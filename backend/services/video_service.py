from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path
from typing import Any, Callable, Coroutine

import httpx
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.config import get_settings
from backend.core.storage import build_key, get_storage, guess_content_type, local_path_for
from backend.core import ffmpeg
from backend.core.websocket_manager import ws_manager
from backend.models import Asset, Project, Scene
from backend.services.image_service import generate_image
from backend.services.audio_service import synthesize_speech
from backend.services.subtitle_service import (
    generate_subtitles_from_audio,
    generate_ass_from_scene_texts,
)

logger = logging.getLogger(__name__)


def _hex_to_ass_color(hex_color: str) -> str:
    """Convert #RRGGBB to ASS format &HAABBGGRR (alpha, blue, green, red)."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
        return f"&H00{b}{g}{r}"
    return "&H00FFFFFF"


def _effective_clip_duration(sc: dict[str, Any], base_duration: float) -> float:
    """Shorten clip by optional trim metadata on the scene dict."""
    ts = float(sc.get("trim_start_sec") or 0)
    te = float(sc.get("trim_end_sec") or 0)
    return max(0.5, float(base_duration) - ts - te)


def _scene_to_dict(scene: Scene) -> dict[str, Any]:
    """Convert Scene model to dict for pipeline compatibility."""
    ss = scene.scene_settings if isinstance(getattr(scene, "scene_settings", None), dict) else {}
    return {
        "id": scene.id,
        "narration": scene.narration or "",
        "subtitle": scene.narration or scene.subtitle or "",
        "image_prompt": scene.image_prompt or "",
        "transition": scene.transition_type,
        "transition_type": scene.transition_type,
        "scene_type": scene.scene_type,
        "duration": scene.duration,
        "scene_settings": ss,
        "trim_start_sec": float(getattr(scene, "trim_start_sec", 0) or 0),
        "trim_end_sec": float(getattr(scene, "trim_end_sec", 0) or 0),
    }


async def _asset_exists(path_or_key: str) -> bool:
    raw = (path_or_key or "").strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        return True
    local_path = local_path_for(raw)
    if local_path:
        return Path(local_path).exists()
    storage = get_storage()
    return await storage.exists(raw)


async def _ensure_local_file(path_or_key: str, dest_dir: Path) -> str:
    raw = (path_or_key or "").strip()
    local_path = local_path_for(raw)
    if local_path:
        return local_path
    dest_dir.mkdir(parents=True, exist_ok=True)
    # Legacy: UI used to persist presigned URLs instead of object keys — fetch over HTTP.
    if raw.startswith("http://") or raw.startswith("https://"):
        dest_path = dest_dir / f"dl_{uuid.uuid4().hex}{Path(raw.split('?', 1)[0]).suffix or '.bin'}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(raw, follow_redirects=True, timeout=120.0)
            resp.raise_for_status()
        dest_path.write_bytes(resp.content)
        return str(dest_path)
    storage = get_storage()
    filename = Path(raw).name
    dest_path = dest_dir / (filename or f"asset_{uuid.uuid4().hex}")
    await storage.download_to_path(raw, str(dest_path))
    return str(dest_path)


async def _get_asset_by_type(assets: list[Asset], atype: str) -> Asset | None:
    """Prefer the newest active asset of a type (supports non-destructive image history)."""
    candidates = [a for a in assets if a.type == atype and a.file_path and getattr(a, "is_active", True)]
    candidates.sort(
        key=lambda a: a.created_at.timestamp() if a.created_at else 0.0,
        reverse=True,
    )
    for a in candidates:
        if await _asset_exists(a.file_path):
            return a
    return None


def _scene_image_generate_kwargs(
    sc: dict[str, Any],
    settings: dict[str, Any],
    app_settings: Any,
) -> tuple[str, str, dict[str, Any]]:
    ov = sc.get("scene_settings") if isinstance(sc.get("scene_settings"), dict) else {}
    prov = ov.get("image_provider") or settings.get("image_provider") or app_settings.default_image_provider
    style = ov.get("image_style") or settings.get("image_style") or app_settings.default_image_style
    extra: dict[str, Any] = {}
    nprompt = ov.get("negative_prompt")
    if isinstance(nprompt, str) and nprompt.strip():
        extra["negative_prompt"] = nprompt.strip()
    seed = ov.get("seed")
    if seed is not None and seed != "":
        try:
            extra["seed"] = int(seed)
        except (TypeError, ValueError):
            extra["seed"] = seed
    return prov, style, extra


async def render_video(
    project_id: str,
    job_id: str,
    session: Any,
    scenes: list[dict[str, Any]] | None = None,
    settings: dict[str, Any] | None = None,
    stop_after_assets: bool = False,
    regenerate_scene_ids: set[str] | None = None,
) -> dict[str, Any]:
    """Full video rendering pipeline with progress persistence.

    Loads project + scenes from DB if not provided. Saves assets per scene so
    retries can resume from the last completed stage.
    """
    app_settings = get_settings()
    storage = get_storage()
    work_dir = Path(app_settings.temp_dir) / project_id
    work_dir.mkdir(parents=True, exist_ok=True)
    local_output_dir = work_dir / "output"
    local_output_dir.mkdir(parents=True, exist_ok=True)

    # Load project + scenes from DB if not provided (e.g. retry)
    if scenes is None or settings is None:
        result = await session.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.scenes).selectinload(Scene.assets))
        )
        project = result.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project {project_id} not found")
        settings = project.settings or {}
        db_scenes = sorted(project.scenes, key=lambda s: s.order_index)
        scenes = [_scene_to_dict(s) for s in db_scenes]
        scene_models = {i: db_scenes[i] for i in range(len(db_scenes))}
    else:
        # New run: normalize scenes to dicts, load scene models for asset persistence
        scene_list = []
        for s in scenes:
            if isinstance(s, dict):
                scene_list.append(s)
            else:
                scene_list.append(_scene_to_dict(s))
        scenes = scene_list

        result = await session.execute(
            select(Scene)
            .where(Scene.project_id == project_id)
            .options(selectinload(Scene.assets))
            .order_by(Scene.order_index)
        )
        db_scenes = result.scalars().all()
        scene_models = {i: db_scenes[i] for i in range(min(len(db_scenes), len(scenes)))} if db_scenes else {}

    resolution = settings.get("resolution") or app_settings.default_resolution
    width, height = map(int, resolution.split("x"))
    tts_provider = settings.get("tts_provider") or app_settings.default_tts_provider
    tts_voice = settings.get("tts_voice") or app_settings.default_tts_voice
    image_provider = settings.get("image_provider") or app_settings.default_image_provider
    image_style = settings.get("image_style") or app_settings.default_image_style
    subtitle_enabled = settings.get("subtitle_enabled", True)
    subtitle_source = settings.get("subtitle_source", "llm")
    subtitle_settings = {
        "font": settings.get("subtitle_font", "Arial"),
        "font_size": settings.get("subtitle_size", 48),
        "color": settings.get("subtitle_color", "#FFFFFF"),
        "position": settings.get("subtitle_position", "bottom"),
    }
    bg_music = settings.get("background_music")
    bg_volume = settings.get("background_music_volume", 0.15)

    total_steps = len(scenes) * 3 + 4
    step = 0

    async def _progress(detail: str = ""):
        nonlocal step
        step += 1
        pct = min(int(step / total_steps * 100), 99)
        await ws_manager.send_progress(job_id, "video_render", pct, "in_progress", detail)

    # --- Step 1 & 2: Generate visuals and audio ---
    visual_paths: list[str] = []
    audio_paths: list[str] = []
    durations: list[float] = []

    if stop_after_assets:
        for idx, sc in enumerate(scenes):
            scene_model = scene_models.get(idx)
            existing_assets = list(scene_model.assets) if scene_model else []

            narration = sc.get("narration", "")
            img_prompt = sc.get("image_prompt", "")
            transition = sc.get("transition", sc.get("transition_type", "fade"))

            audio_asset = await _get_asset_by_type(existing_assets, "audio")
            if audio_asset:
                audio_path = await _ensure_local_file(audio_asset.file_path, work_dir / "audio")
                await _progress(f"Reusing audio for scene {idx + 1}")
            else:
                audio_key = await synthesize_speech(
                    narration, tts_provider, tts_voice, save=True
                )
                await _progress(f"Audio for scene {idx + 1}")
                if scene_model:
                    asset = Asset(scene_id=scene_model.id, type="audio", file_path=audio_key)
                    session.add(asset)
                    await session.flush()
                audio_path = await _ensure_local_file(audio_key, work_dir / "audio")

            audio_dur = await ffmpeg.get_duration(audio_path)
            match_scenes_to_audio = settings.get("match_scenes_to_audio", False)
            if match_scenes_to_audio:
                duration = max(audio_dur, 0.5)
            else:
                base_duration = sc.get("duration") or settings.get("scene_duration") or 5.0
                try:
                    base_duration = float(base_duration)
                except (TypeError, ValueError):
                    base_duration = 5.0
                base_duration = max(base_duration, 1.0)
                duration = max(audio_dur, base_duration)
            duration = _effective_clip_duration(sc, duration)

            image_asset = await _get_asset_by_type(existing_assets, "image")
            if not image_asset and img_prompt:
                ip, ist, iextra = _scene_image_generate_kwargs(sc, settings, app_settings)
                img_path = await generate_image(
                    img_prompt, ip, width, height, ist, **iextra
                )
                await _progress(f"Image for scene {idx + 1}")
                if scene_model:
                    asset = Asset(
                        scene_id=scene_model.id,
                        type="image",
                        file_path=img_path,
                        provider=ip,
                        metadata_={
                            "width": width,
                            "height": height,
                            "style": ist,
                            **{k: iextra[k] for k in ("negative_prompt", "seed") if k in iextra},
                        },
                    )
                    session.add(asset)
                    await session.flush()
            visual_paths.append("")
            audio_paths.append(audio_path)
            durations.append(duration)

        return {"prepared": True, "project_id": project_id, "scenes": len(scenes)}

    # TTS is capped; image generation + clip encode run fully in parallel (API-bound).
    RENDER_AUDIO_CONCURRENCY = 4
    audio_sem = asyncio.Semaphore(RENDER_AUDIO_CONCURRENCY)
    db_lock = asyncio.Lock()

    async def scene_audio(idx: int) -> tuple[str, float]:
        sc = scenes[idx]
        scene_model = scene_models.get(idx)
        existing_assets = list(scene_model.assets) if scene_model else []
        narration = sc.get("narration", "")
        sid = sc.get("id")
        reg = regenerate_scene_ids
        force_reuse = reg is not None and bool(sid) and sid not in reg
        force_new = reg is not None and bool(sid) and sid in reg

        async with audio_sem:
            audio_asset = await _get_asset_by_type(existing_assets, "audio")

            if force_reuse:
                if not audio_asset:
                    raise ValueError(
                        f"Incremental render: scene {sid} has no audio asset to reuse"
                    )
                audio_path = await _ensure_local_file(audio_asset.file_path, work_dir / "audio")
                await _progress(f"Reusing audio for scene {idx + 1}")
            elif audio_asset and not force_new:
                audio_path = await _ensure_local_file(audio_asset.file_path, work_dir / "audio")
                await _progress(f"Reusing audio for scene {idx + 1}")
            else:
                audio_key = await synthesize_speech(
                    narration, tts_provider, tts_voice, save=True
                )
                await _progress(f"Audio for scene {idx + 1}")
                async with db_lock:
                    if scene_model:
                        session.add(
                            Asset(
                                scene_id=scene_model.id,
                                type="audio",
                                file_path=audio_key,
                                source="ai_generated",
                            )
                        )
                        await session.flush()
                audio_path = await _ensure_local_file(audio_key, work_dir / "audio")

        audio_dur = await ffmpeg.get_duration(audio_path)
        match_scenes_to_audio = settings.get("match_scenes_to_audio", False)
        if match_scenes_to_audio:
            duration = max(audio_dur, 0.5)
        else:
            base_duration = sc.get("duration") or settings.get("scene_duration") or 5.0
            try:
                base_duration = float(base_duration)
            except (TypeError, ValueError):
                base_duration = 5.0
            base_duration = max(base_duration, 1.0)
            duration = max(audio_dur, base_duration)
        duration = _effective_clip_duration(sc, duration)
        return audio_path, duration

    audio_packed = await asyncio.gather(*[scene_audio(i) for i in range(len(scenes))])
    audio_paths = [p[0] for p in audio_packed]
    durations = [p[1] for p in audio_packed]

    async def scene_visual(idx: int) -> str:
        sc = scenes[idx]
        scene_model = scene_models.get(idx)
        existing_assets = list(scene_model.assets) if scene_model else []
        img_prompt = sc.get("image_prompt", "")
        transition = sc.get("transition", sc.get("transition_type", "fade"))
        duration = _effective_clip_duration(sc, durations[idx])

        sid = sc.get("id")
        reg = regenerate_scene_ids
        force_reuse = reg is not None and bool(sid) and sid not in reg
        force_new = reg is not None and bool(sid) and sid in reg

        video_asset = await _get_asset_by_type(existing_assets, "video")
        image_asset = await _get_asset_by_type(existing_assets, "image")

        if force_reuse:
            if video_asset:
                visual_path = await _ensure_local_file(video_asset.file_path, work_dir / "video")
                await _progress(f"Reusing clip for scene {idx + 1}")
                return visual_path
            if image_asset:
                clip_path = str(work_dir / f"clip_{idx:03d}.mp4")
                local_image = await _ensure_local_file(image_asset.file_path, work_dir / "images")
                visual_path = await ffmpeg.create_image_clip(
                    local_image, duration, clip_path, width, height, transition
                )
                await _progress(f"Clip for scene {idx + 1}")
                if scene_model:
                    clip_key = build_key("videos", f"{project_id}/{Path(visual_path).name}")
                    await storage.save_file(clip_key, visual_path, guess_content_type(clip_key))
                    async with db_lock:
                        session.add(
                            Asset(
                                scene_id=scene_model.id,
                                type="video",
                                file_path=clip_key,
                                source="ai_generated",
                            )
                        )
                        await session.flush()
                return visual_path
            raise ValueError(
                f"Incremental render: scene {sid} has no video or image to reuse"
            )

        if not force_new and video_asset:
            visual_path = await _ensure_local_file(video_asset.file_path, work_dir / "video")
            await _progress(f"Reusing clip for scene {idx + 1}")
            return visual_path

        if not force_new and image_asset:
            clip_path = str(work_dir / f"clip_{idx:03d}.mp4")
            local_image = await _ensure_local_file(image_asset.file_path, work_dir / "images")
            visual_path = await ffmpeg.create_image_clip(
                local_image, duration, clip_path, width, height, transition
            )
            await _progress(f"Clip for scene {idx + 1}")
            if scene_model:
                clip_key = build_key("videos", f"{project_id}/{Path(visual_path).name}")
                await storage.save_file(clip_key, visual_path, guess_content_type(clip_key))
                async with db_lock:
                    session.add(
                        Asset(
                            scene_id=scene_model.id,
                            type="video",
                            file_path=clip_key,
                            source="ai_generated",
                        )
                    )
                    await session.flush()
            return visual_path

        ip, ist, iextra = _scene_image_generate_kwargs(sc, settings, app_settings)
        img_path = await generate_image(
            img_prompt, ip, width, height, ist, **iextra
        )
        await _progress(f"Image for scene {idx + 1}")
        async with db_lock:
            if scene_model:
                session.add(
                    Asset(
                        scene_id=scene_model.id,
                        type="image",
                        file_path=img_path,
                        provider=ip,
                        source="ai_generated",
                        metadata_={
                            "width": width,
                            "height": height,
                            "style": ist,
                            **{k: iextra[k] for k in ("negative_prompt", "seed") if k in iextra},
                        },
                    )
                )
                await session.flush()
        clip_path = str(work_dir / f"clip_{idx:03d}.mp4")
        local_image = await _ensure_local_file(img_path, work_dir / "images")
        visual_path = await ffmpeg.create_image_clip(
            local_image, duration, clip_path, width, height, transition
        )
        await _progress(f"Clip for scene {idx + 1}")
        if scene_model:
            clip_key = build_key("videos", f"{project_id}/{Path(visual_path).name}")
            await storage.save_file(clip_key, visual_path, guess_content_type(clip_key))
            async with db_lock:
                session.add(
                    Asset(
                        scene_id=scene_model.id,
                        type="video",
                        file_path=clip_key,
                        source="ai_generated",
                    )
                )
                await session.flush()
        return visual_path

    visual_paths = await asyncio.gather(*[scene_visual(i) for i in range(len(scenes))])

    for idx in range(len(scenes)):
        norm = str(work_dir / f"audio_norm_{idx:03d}.mp3")
        await ffmpeg.pad_or_trim_audio(audio_paths[idx], durations[idx], norm)
        audio_paths[idx] = norm

    # --- Step 3: Concat video clips (no xfade overlap; matches padded audio timeline) ---
    await _progress("Concatenating video clips")
    concat_video = str(work_dir / "concat_video.mp4")
    await ffmpeg.concat_video_simple(visual_paths, concat_video)

    # --- Step 4: Concat audio ---
    await _progress("Concatenating audio")
    concat_audio = str(work_dir / "concat_audio.mp3")
    await ffmpeg.concat_audio_files(audio_paths, concat_audio)

    # --- Step 5: Merge video + audio ---
    await _progress("Merging audio and video")
    merged = str(work_dir / "merged.mp4")
    await ffmpeg.merge_audio_to_video_matched(concat_video, concat_audio, merged)

    # --- Step 6: Subtitles ---
    current = merged
    if subtitle_enabled:
        await _progress("Generating subtitles")
        sub_path = str(work_dir / "subtitles.ass")
        hex_color = subtitle_settings["color"]
        ass_color = _hex_to_ass_color(hex_color) if hex_color.startswith("#") else "&H00FFFFFF"
        if subtitle_source == "llm":
            # Burn in full narration (matches TTS), not short LLM "subtitle" summaries
            scene_subtitle_data = [
                {
                    "narration": sc.get("narration", ""),
                    "subtitle": sc.get("narration") or sc.get("subtitle", ""),
                    "duration": durations[i] if i < len(durations) else 5.0,
                }
                for i, sc in enumerate(scenes)
            ]
            ass_content = generate_ass_from_scene_texts(
                scene_subtitle_data,
                font_name=subtitle_settings["font"],
                font_size=subtitle_settings["font_size"],
                primary_color=ass_color,
                position=subtitle_settings["position"],
                video_width=width,
                video_height=height,
            )
            Path(sub_path).write_text(ass_content, encoding="utf-8")
        else:
            await generate_subtitles_from_audio(
                concat_audio, sub_path,
                font_name=subtitle_settings["font"],
                font_size=subtitle_settings["font_size"],
                primary_color=ass_color,
                highlight_color="&H0000FFFF",
                position=subtitle_settings["position"],
                video_width=width, video_height=height,
                transcription_provider=settings.get("transcription_provider"),
                transcription_language=settings.get("transcription_language", "en"),
            )
        subtitled = str(work_dir / "subtitled.mp4")
        await ffmpeg.overlay_subtitles(current, sub_path, subtitled)
        current = subtitled

    # --- Step 7: Background music ---
    if bg_music:
        await _progress("Adding background music")
        bg_music_local = await _ensure_local_file(bg_music, work_dir / "music")
        music_out = str(work_dir / "with_music.mp4")
        await ffmpeg.mix_background_music(current, bg_music_local, music_out, bg_volume)
        current = music_out

    # --- Final: Upload to storage ---
    final_name = f"video_{uuid.uuid4().hex[:8]}.mp4"
    final_local = str(local_output_dir / final_name)
    import shutil
    shutil.copy2(current, final_local)
    final_key = build_key("videos", f"{project_id}/{final_name}")
    await storage.save_file(final_key, final_local, guess_content_type(final_name))

    final_duration = await ffmpeg.get_duration(final_local)

    return {
        "video_path": final_key,
        "video_url": await storage.get_url(final_key),
        "duration": final_duration,
        "scenes": len(scenes),
        "resolution": resolution,
    }
