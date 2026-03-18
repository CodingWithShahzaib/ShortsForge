from __future__ import annotations

import asyncio
import logging
import uuid
from pathlib import Path
from typing import Any, Callable, Coroutine

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


def _scene_to_dict(scene: Scene) -> dict[str, Any]:
    """Convert Scene model to dict for pipeline compatibility."""
    return {
        "id": scene.id,
        "narration": scene.narration or "",
        "subtitle": scene.subtitle or scene.narration or "",
        "image_prompt": scene.image_prompt or "",
        "transition": scene.transition_type,
        "transition_type": scene.transition_type,
        "scene_type": scene.scene_type,
        "duration": scene.duration,
    }


async def _asset_exists(path_or_key: str) -> bool:
    local_path = local_path_for(path_or_key)
    if local_path:
        return Path(local_path).exists()
    storage = get_storage()
    return await storage.exists(path_or_key)


async def _ensure_local_file(path_or_key: str, dest_dir: Path) -> str:
    local_path = local_path_for(path_or_key)
    if local_path:
        return local_path
    storage = get_storage()
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = Path(path_or_key).name
    dest_path = dest_dir / filename
    await storage.download_to_path(path_or_key, str(dest_path))
    return str(dest_path)


async def _get_asset_by_type(assets: list[Asset], atype: str) -> Asset | None:
    for a in assets:
        if a.type == atype and a.file_path and await _asset_exists(a.file_path):
            return a
    return None


async def render_video(
    project_id: str,
    job_id: str,
    session: Any,
    scenes: list[dict[str, Any]] | None = None,
    settings: dict[str, Any] | None = None,
    stop_after_assets: bool = False,
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
    subtitle_source = settings.get("subtitle_source", "transcription")
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

    # --- Step 1 & 2: Generate visuals and audio (sequential for progress persistence) ---
    visual_paths: list[str] = []
    audio_paths: list[str] = []
    durations: list[float] = []

    for idx, sc in enumerate(scenes):
        scene_model = scene_models.get(idx)
        existing_assets = list(scene_model.assets) if scene_model else []

        narration = sc.get("narration", "")
        img_prompt = sc.get("image_prompt", "")
        transition = sc.get("transition", sc.get("transition_type", "fade"))
        scene_type = sc.get("scene_type", "image")

        # Reuse or generate audio
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

        # Reuse or generate visual (image clip)
        video_asset = await _get_asset_by_type(existing_assets, "video")
        image_asset = await _get_asset_by_type(existing_assets, "image")

        if stop_after_assets:
            # Prepare-only mode: save audio and image only, skip clip creation
            if not image_asset and img_prompt:
                img_path = await generate_image(
                    img_prompt, image_provider, width, height, image_style
                )
                await _progress(f"Image for scene {idx + 1}")
                if scene_model:
                    asset = Asset(scene_id=scene_model.id, type="image", file_path=img_path)
                    session.add(asset)
                    await session.flush()
            visual_paths.append("")  # placeholder, unused when stopping early
            audio_paths.append(audio_path)
            durations.append(duration)
        elif video_asset:
            visual_key = video_asset.file_path
            visual_path = await _ensure_local_file(visual_key, work_dir / "video")
            await _progress(f"Reusing clip for scene {idx + 1}")
            visual_paths.append(visual_path)
            audio_paths.append(audio_path)
            durations.append(duration)
        elif image_asset:
            clip_path = str(work_dir / f"clip_{idx:03d}.mp4")
            local_image = await _ensure_local_file(image_asset.file_path, work_dir / "images")
            visual_path = await ffmpeg.create_image_clip(
                local_image, duration, clip_path, width, height, transition
            )
            await _progress(f"Clip for scene {idx + 1}")
            if scene_model:
                clip_key = build_key("videos", f"{project_id}/{Path(visual_path).name}")
                await storage.save_file(clip_key, visual_path, guess_content_type(clip_key))
                asset = Asset(scene_id=scene_model.id, type="video", file_path=clip_key)
                session.add(asset)
                await session.flush()
            visual_paths.append(visual_path)
            audio_paths.append(audio_path)
            durations.append(duration)
        else:
            img_path = await generate_image(
                img_prompt, image_provider, width, height, image_style
            )
            await _progress(f"Image for scene {idx + 1}")
            if scene_model:
                asset = Asset(scene_id=scene_model.id, type="image", file_path=img_path)
                session.add(asset)
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
                clip_asset = Asset(scene_id=scene_model.id, type="video", file_path=clip_key)
                session.add(clip_asset)
                await session.flush()
            visual_paths.append(visual_path)
            audio_paths.append(audio_path)
            durations.append(duration)

    # --- Early return for prepare-only mode ---
    if stop_after_assets:
        return {"prepared": True, "project_id": project_id, "scenes": len(scenes)}

    # --- Step 3: Concat video clips with transitions ---
    await _progress("Concatenating video clips")
    transitions = [s.get("transition", "fade") for s in scenes[1:]]
    concat_video = str(work_dir / "concat_video.mp4")
    await ffmpeg.concat_with_transitions(visual_paths, transitions, concat_video)

    # --- Step 4: Concat audio ---
    await _progress("Concatenating audio")
    concat_audio = str(work_dir / "concat_audio.mp3")
    await ffmpeg.concat_audio_files(audio_paths, concat_audio)

    # --- Step 5: Merge video + audio ---
    await _progress("Merging audio and video")
    merged = str(work_dir / "merged.mp4")
    await ffmpeg.add_audio_to_video(concat_video, concat_audio, merged)

    # --- Step 6: Subtitles ---
    current = merged
    if subtitle_enabled:
        await _progress("Generating subtitles")
        sub_path = str(work_dir / "subtitles.ass")
        hex_color = subtitle_settings["color"]
        ass_color = _hex_to_ass_color(hex_color) if hex_color.startswith("#") else "&H00FFFFFF"
        if subtitle_source == "llm":
            # Use LLM-generated subtitle text per scene with computed durations
            scene_subtitle_data = [
                {
                    "subtitle": sc.get("subtitle") or sc.get("narration", ""),
                    "narration": sc.get("narration", ""),
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

    return {
        "video_path": final_key,
        "video_url": await storage.get_url(final_key),
        "duration": sum(durations),
        "scenes": len(scenes),
        "resolution": resolution,
    }
