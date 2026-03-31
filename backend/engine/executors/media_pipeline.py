from __future__ import annotations

import asyncio
import shutil
import uuid
from pathlib import Path
from typing import Any, Callable, Coroutine

import httpx

from backend.core import ffmpeg
from backend.core.storage import build_key, get_storage, guess_content_type, local_path_for
from backend.engine.planning import RenderPlan, ResolvedGenerationSettings, SceneSpec
from backend.models import Asset, Scene
from backend.services.audio_service import synthesize_speech
from backend.services.image_service import DEFAULT_TEXT_NEGATIVE_PROMPT, generate_image
from backend.services.overlay_service import resolve_overlay_file
from backend.services.subtitle_service import (
    generate_ass_from_scene_texts,
    generate_subtitles_from_scene_audios,
)


def _hex_to_ass_color(hex_color: str) -> str:
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
        return f"&H00{b}{g}{r}"
    return "&H00FFFFFF"


def _effective_clip_duration(sc: SceneSpec, base_duration: float) -> float:
    ts = float(sc.trim_start_sec or 0)
    te = float(sc.trim_end_sec or 0)
    return max(0.5, float(base_duration) - ts - te)


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
    sc: SceneSpec,
    settings: ResolvedGenerationSettings,
) -> tuple[str, str, dict[str, Any]]:
    ov = sc.scene_settings if isinstance(sc.scene_settings, dict) else {}
    prov = ov.get("image_provider") or settings.image_provider
    style = ov.get("image_style") or settings.image_style
    extra: dict[str, Any] = {}
    nprompt = ov.get("negative_prompt")
    if isinstance(nprompt, str) and nprompt.strip():
        extra["negative_prompt"] = nprompt.strip()
    else:
        extra["negative_prompt"] = DEFAULT_TEXT_NEGATIVE_PROMPT
    seed = ov.get("seed")
    if seed is not None and seed != "":
        try:
            extra["seed"] = int(seed)
        except (TypeError, ValueError):
            extra["seed"] = seed
    return prov, style, extra


def _resolve_scene_runtime_duration(
    sc: SceneSpec,
    *,
    audio_duration: float,
    settings: ResolvedGenerationSettings,
) -> float:
    if settings.match_scenes_to_audio:
        duration = max(audio_duration, 0.5)
    else:
        base_duration = sc.duration or settings.scene_duration
        try:
            base_duration = float(base_duration)
        except (TypeError, ValueError):
            base_duration = 5.0
        base_duration = max(base_duration, 1.0)
        duration = max(audio_duration, base_duration)
    return _effective_clip_duration(sc, duration)


async def _commit_scene_asset(
    *,
    session: Any,
    db_lock: asyncio.Lock,
    scene_model: Scene | None,
    asset: Asset,
) -> None:
    if not scene_model:
        return
    async with db_lock:
        session.add(asset)
        await session.commit()


async def _create_scene_clip_from_image(
    *,
    image_path_or_key: str,
    work_dir: Path,
    clip_name: str,
    duration: float,
    width: int,
    height: int,
    transition: str,
    motion_effect: str | None,
    resolved_settings: ResolvedGenerationSettings,
) -> str:
    clip_path = str(work_dir / clip_name)
    local_image = await _ensure_local_file(image_path_or_key, work_dir / "images")
    return await ffmpeg.create_image_clip(
        local_image,
        duration,
        clip_path,
        width,
        height,
        transition,
        motion_effect=motion_effect,
        ken_burns_enabled=resolved_settings.ken_burns_enabled,
        ken_burns_zoom_percent=resolved_settings.ken_burns_zoom_percent,
    )


async def _store_scene_clip_asset(
    *,
    session: Any,
    db_lock: asyncio.Lock,
    scene_model: Scene | None,
    storage: Any,
    project_id: str,
    visual_path: str,
) -> None:
    if not scene_model:
        return
    clip_key = build_key("videos", f"{project_id}/{Path(visual_path).name}")
    await storage.save_file(clip_key, visual_path, guess_content_type(clip_key))
    await _commit_scene_asset(
        session=session,
        db_lock=db_lock,
        scene_model=scene_model,
        asset=Asset(
            scene_id=scene_model.id,
            type="video",
            file_path=clip_key,
            source="ai_generated",
        ),
    )


async def _prepare_scene_assets(
    *,
    idx: int,
    sc: SceneSpec,
    scene_model: Scene | None,
    session: Any,
    db_lock: asyncio.Lock,
    audio_sem: asyncio.Semaphore,
    image_sem: asyncio.Semaphore,
    work_dir: Path,
    resolved_settings: ResolvedGenerationSettings,
    tts_provider: str,
    tts_voice: str,
    width: int,
    height: int,
    progress: Callable[[str], Coroutine[Any, Any, None]],
) -> tuple[str, float]:
    existing_assets = list(scene_model.assets) if scene_model else []
    audio_asset = await _get_asset_by_type(existing_assets, "audio")
    if audio_asset:
        audio_path = await _ensure_local_file(audio_asset.file_path, work_dir / "audio")
        await progress(f"Reusing audio for scene {idx + 1}")
    else:
        async with audio_sem:
            audio_key = await synthesize_speech(sc.narration, tts_provider, tts_voice, save=True)
        await progress(f"Audio for scene {idx + 1}")
        await _commit_scene_asset(
            session=session,
            db_lock=db_lock,
            scene_model=scene_model,
            asset=Asset(scene_id=scene_model.id if scene_model else None, type="audio", file_path=audio_key),
        )
        audio_path = await _ensure_local_file(audio_key, work_dir / "audio")

    audio_dur = await ffmpeg.get_duration(audio_path)
    duration = _resolve_scene_runtime_duration(sc, audio_duration=audio_dur, settings=resolved_settings)

    image_asset = await _get_asset_by_type(existing_assets, "image")
    if not image_asset and sc.image_prompt:
        ip, ist, iextra = _scene_image_generate_kwargs(sc, resolved_settings)
        async with image_sem:
            img_path = await generate_image(sc.image_prompt, ip, width, height, ist, **iextra)
        await progress(f"Image for scene {idx + 1}")
        await _commit_scene_asset(
            session=session,
            db_lock=db_lock,
            scene_model=scene_model,
            asset=Asset(
                scene_id=scene_model.id if scene_model else None,
                type="image",
                file_path=img_path,
                provider=ip,
                metadata_={
                    "width": width,
                    "height": height,
                    "style": ist,
                    **{k: iextra[k] for k in ("negative_prompt", "seed") if k in iextra},
                },
            ),
        )
    return audio_path, duration


async def _render_scene_audio(
    *,
    idx: int,
    sc: SceneSpec,
    scene_model: Scene | None,
    session: Any,
    db_lock: asyncio.Lock,
    audio_sem: asyncio.Semaphore,
    work_dir: Path,
    resolved_settings: ResolvedGenerationSettings,
    tts_provider: str,
    tts_voice: str,
    regenerate_scene_ids: set[str] | None,
    progress: Callable[[str], Coroutine[Any, Any, None]],
) -> tuple[str, float]:
    existing_assets = list(scene_model.assets) if scene_model else []
    sid = sc.id
    reg = regenerate_scene_ids
    force_reuse = reg is not None and bool(sid) and sid not in reg
    force_new = reg is not None and bool(sid) and sid in reg

    async with audio_sem:
        audio_asset = await _get_asset_by_type(existing_assets, "audio")
        if force_reuse:
            if not audio_asset:
                raise ValueError(f"Incremental render: scene {sid} has no audio asset to reuse")
            audio_path = await _ensure_local_file(audio_asset.file_path, work_dir / "audio")
            await progress(f"Reusing audio for scene {idx + 1}")
        elif audio_asset and not force_new:
            audio_path = await _ensure_local_file(audio_asset.file_path, work_dir / "audio")
            await progress(f"Reusing audio for scene {idx + 1}")
        else:
            audio_key = await synthesize_speech(sc.narration, tts_provider, tts_voice, save=True)
            await progress(f"Audio for scene {idx + 1}")
            await _commit_scene_asset(
                session=session,
                db_lock=db_lock,
                scene_model=scene_model,
                asset=Asset(
                    scene_id=scene_model.id if scene_model else None,
                    type="audio",
                    file_path=audio_key,
                    source="ai_generated",
                ),
            )
            audio_path = await _ensure_local_file(audio_key, work_dir / "audio")

    audio_dur = await ffmpeg.get_duration(audio_path)
    duration = _resolve_scene_runtime_duration(sc, audio_duration=audio_dur, settings=resolved_settings)
    return audio_path, duration


async def _render_scene_visual(
    *,
    idx: int,
    sc: SceneSpec,
    scene_model: Scene | None,
    session: Any,
    db_lock: asyncio.Lock,
    visual_sem: asyncio.Semaphore,
    work_dir: Path,
    storage: Any,
    project_id: str,
    resolved_settings: ResolvedGenerationSettings,
    width: int,
    height: int,
    duration: float,
    regenerate_scene_ids: set[str] | None,
    force_regenerate_scene_clips: bool,
    progress: Callable[[str], Coroutine[Any, Any, None]],
) -> str:
    async with visual_sem:
        existing_assets = list(scene_model.assets) if scene_model else []
        transition = sc.transition or sc.transition_type or "fade"
        motion_effect = None
        if resolved_settings.ken_burns_enabled:
            motion_effect = resolved_settings.ken_burns_motion
        sid = sc.id
        reg = regenerate_scene_ids
        force_reuse = reg is not None and bool(sid) and sid not in reg
        force_new = reg is not None and bool(sid) and sid in reg

        video_asset = await _get_asset_by_type(existing_assets, "video")
        image_asset = await _get_asset_by_type(existing_assets, "image")
        if force_reuse:
            if video_asset and not force_regenerate_scene_clips:
                visual_path = await _ensure_local_file(video_asset.file_path, work_dir / "video")
                await progress(f"Reusing clip for scene {idx + 1}")
                return visual_path
            if image_asset:
                visual_path = await _create_scene_clip_from_image(
                    image_path_or_key=image_asset.file_path,
                    work_dir=work_dir,
                    clip_name=f"clip_{idx:03d}.mp4",
                    duration=duration,
                    width=width,
                    height=height,
                    transition=transition,
                    motion_effect=motion_effect,
                    resolved_settings=resolved_settings,
                )
                await progress(f"Clip for scene {idx + 1}")
                await _store_scene_clip_asset(
                    session=session,
                    db_lock=db_lock,
                    scene_model=scene_model,
                    storage=storage,
                    project_id=project_id,
                    visual_path=visual_path,
                )
                return visual_path
            raise ValueError(f"Incremental render: scene {sid} has no video or image to reuse")

        if not force_new and video_asset and not force_regenerate_scene_clips:
            visual_path = await _ensure_local_file(video_asset.file_path, work_dir / "video")
            await progress(f"Reusing clip for scene {idx + 1}")
            return visual_path
        if not force_new and image_asset:
            visual_path = await _create_scene_clip_from_image(
                image_path_or_key=image_asset.file_path,
                work_dir=work_dir,
                clip_name=f"clip_{idx:03d}.mp4",
                duration=duration,
                width=width,
                height=height,
                transition=transition,
                motion_effect=motion_effect,
                resolved_settings=resolved_settings,
            )
            await progress(f"Clip for scene {idx + 1}")
            await _store_scene_clip_asset(
                session=session,
                db_lock=db_lock,
                scene_model=scene_model,
                storage=storage,
                project_id=project_id,
                visual_path=visual_path,
            )
            return visual_path

        ip, ist, iextra = _scene_image_generate_kwargs(sc, resolved_settings)
        img_path = await generate_image(sc.image_prompt, ip, width, height, ist, **iextra)
        await progress(f"Image for scene {idx + 1}")
        await _commit_scene_asset(
            session=session,
            db_lock=db_lock,
            scene_model=scene_model,
            asset=Asset(
                scene_id=scene_model.id if scene_model else None,
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
            ),
        )
        visual_path = await _create_scene_clip_from_image(
            image_path_or_key=img_path,
            work_dir=work_dir,
            clip_name=f"clip_{idx:03d}.mp4",
            duration=duration,
            width=width,
            height=height,
            transition=transition,
            motion_effect=motion_effect,
            resolved_settings=resolved_settings,
        )
        await progress(f"Clip for scene {idx + 1}")
        await _store_scene_clip_asset(
            session=session,
            db_lock=db_lock,
            scene_model=scene_model,
            storage=storage,
            project_id=project_id,
            visual_path=visual_path,
        )
        return visual_path


async def _concat_and_merge_render_media(
    *,
    work_dir: Path,
    visual_paths: list[str],
    audio_paths: list[str],
    transitions_between: list[str],
    boundary_overlaps: list[float],
    progress: Callable[[str], Coroutine[Any, Any, None]],
) -> str:
    await progress("Concatenating video clips")
    concat_video = str(work_dir / "concat_video.mp4")
    if len(visual_paths) <= 1:
        await ffmpeg.concat_video_simple(visual_paths, concat_video)
    else:
        await ffmpeg.concat_with_transitions(
            visual_paths,
            transitions_between,
            concat_video,
            transition_duration=boundary_overlaps,
        )

    await progress("Concatenating audio")
    concat_audio = str(work_dir / "concat_audio.mp3")
    if len(audio_paths) <= 1:
        await ffmpeg.concat_audio_files(audio_paths, concat_audio)
    else:
        await ffmpeg.concat_audio_with_crossfade(audio_paths, concat_audio, crossfade_duration=boundary_overlaps)

    await progress("Merging audio and video")
    merged = str(work_dir / "merged.mp4")
    await ffmpeg.merge_audio_to_video_matched(concat_video, concat_audio, merged)
    return merged


async def _apply_render_subtitles(
    *,
    current_video: str,
    work_dir: Path,
    render_plan: RenderPlan,
    audio_paths: list[str],
    width: int,
    height: int,
    progress: Callable[[str], Coroutine[Any, Any, None]],
) -> str:
    settings = render_plan.settings
    if not settings.subtitle_enabled:
        return current_video

    await progress("Generating subtitles")
    sub_path = str(work_dir / "subtitles.ass")
    hex_color = settings.subtitle_color
    ass_color = _hex_to_ass_color(hex_color) if hex_color.startswith("#") else "&H00FFFFFF"

    if settings.subtitle_source == "llm":
        scene_subtitle_data = [
            {
                "narration": sc.narration,
                "subtitle": sc.narration or sc.subtitle,
                "duration": render_plan.timeline.paced_durations[i] if i < len(render_plan.timeline.paced_durations) else 5.0,
            }
            for i, sc in enumerate(render_plan.scenes)
        ]
        ass_content = generate_ass_from_scene_texts(
            scene_subtitle_data,
            font_name=settings.subtitle_font,
            font_size=settings.subtitle_size,
            primary_color=ass_color,
            position=settings.subtitle_position,
            video_width=width,
            video_height=height,
            words_per_group=settings.subtitle_words_per_group,
            scene_starts=render_plan.timeline.scene_starts,
            background_opacity=settings.subtitle_background_opacity,
            shadow_enabled=settings.subtitle_shadow_enabled,
            shadow_strength=settings.subtitle_shadow_strength,
            safe_zone_enabled=settings.subtitle_safe_zone_enabled,
            safe_zone_platform=settings.subtitle_safe_zone_platform,
            safe_zone_config=settings.subtitle_safe_zone_config,
        )
        Path(sub_path).write_text(ass_content, encoding="utf-8")
    else:
        await generate_subtitles_from_scene_audios(
            audio_paths,
            render_plan.timeline.paced_durations,
            sub_path,
            font_name=settings.subtitle_font,
            font_size=settings.subtitle_size,
            primary_color=ass_color,
            highlight_color="&H0000FFFF",
            position=settings.subtitle_position,
            video_width=width,
            video_height=height,
            transcription_provider=settings.transcription_provider,
            transcription_language=settings.transcription_language,
            words_per_group=settings.subtitle_words_per_group,
            scene_starts=render_plan.timeline.scene_starts,
            background_opacity=settings.subtitle_background_opacity,
            shadow_enabled=settings.subtitle_shadow_enabled,
            shadow_strength=settings.subtitle_shadow_strength,
            safe_zone_enabled=settings.subtitle_safe_zone_enabled,
            safe_zone_platform=settings.subtitle_safe_zone_platform,
            safe_zone_config=settings.subtitle_safe_zone_config,
            word_pop_enabled=settings.subtitle_word_pop_enabled,
        )

    subtitled = str(work_dir / "subtitled.mp4")
    await ffmpeg.overlay_subtitles(current_video, sub_path, subtitled)
    return subtitled


async def _apply_optional_overlay(
    *,
    current_video: str,
    raw_overlay: Any,
    work_dir: Path,
    width: int,
    height: int,
    progress: Callable[[str], Coroutine[Any, Any, None]],
) -> str:
    overlay_local = resolve_overlay_file(str(raw_overlay) if raw_overlay is not None else None)
    if not overlay_local:
        return current_video
    await progress("Applying video overlay")
    overlaid = str(work_dir / "with_overlay.mp4")
    await ffmpeg.overlay_asset_on_video(current_video, str(overlay_local), overlaid, width, height)
    return overlaid


async def _apply_visual_style_overlays(
    *,
    current_video: str,
    work_dir: Path,
    settings: ResolvedGenerationSettings,
    progress: Callable[[str], Coroutine[Any, Any, None]],
) -> str:
    if not settings.film_grain_enabled and not settings.vignette_enabled:
        return current_video
    if not Path(current_video).exists():
        return current_video
    await progress("Applying visual overlays")
    styled = str(work_dir / "with_visual_style.mp4")
    await ffmpeg.apply_visual_overlays(
        current_video,
        styled,
        film_grain_enabled=settings.film_grain_enabled,
        film_grain_intensity=settings.film_grain_intensity,
        vignette_enabled=settings.vignette_enabled,
        vignette_intensity=settings.vignette_intensity,
    )
    return styled


async def _apply_optional_background_music(
    *,
    current_video: str,
    bg_music: str | None,
    bg_volume: float,
    ducking_enabled: bool,
    ducking_amount: float,
    work_dir: Path,
    progress: Callable[[str], Coroutine[Any, Any, None]],
) -> str:
    if not bg_music:
        return current_video
    await progress("Adding background music")
    bg_music_local = await _ensure_local_file(bg_music, work_dir / "music")
    music_out = str(work_dir / "with_music.mp4")
    await ffmpeg.mix_background_music(
        current_video,
        bg_music_local,
        music_out,
        bg_volume,
        ducking_enabled=ducking_enabled,
        ducking_amount=ducking_amount,
    )
    return music_out


async def _save_final_render(
    *,
    current_video: str,
    local_output_dir: Path,
    project_id: str,
    storage: Any,
) -> tuple[str, str, float]:
    final_name = f"video_{uuid.uuid4().hex[:8]}.mp4"
    final_local = str(local_output_dir / final_name)
    shutil.copy2(current_video, final_local)
    final_key = build_key("videos", f"{project_id}/{final_name}")
    await storage.save_file(final_key, final_local, guess_content_type(final_name))
    final_duration = await ffmpeg.get_duration(final_local)
    final_url = await storage.get_url(final_key)
    return final_key, final_url, final_duration
