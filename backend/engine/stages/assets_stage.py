from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.core.websocket_manager import ws_manager
from backend.engine.context import EngineContext
from backend.engine.results import EngineResult
from backend.engine.executors.media_pipeline import _prepare_scene_assets
from backend.models import Scene


class AssetsStage:
    async def run(self, context: EngineContext) -> EngineResult:
        work_dir = context.work_dir
        if work_dir is None:
            raise ValueError("EngineContext.work_dir must be set before running AssetsStage")
        work_dir.mkdir(parents=True, exist_ok=True)

        result = await context.session.execute(
            select(Scene)
            .where(Scene.project_id == context.project_id)
            .options(selectinload(Scene.assets), selectinload(Scene.asset_override))
            .order_by(Scene.order_index)
        )
        db_scenes = result.scalars().all()
        scene_models = {i: db_scenes[i] for i in range(min(len(db_scenes), len(context.scenes)))} if db_scenes else {}

        total_steps = len(context.scenes) * 3 + 4
        step = 0

        async def _progress(detail: str = "") -> None:
            nonlocal step
            step += 1
            pct = min(int(step / total_steps * 100), 99)
            await ws_manager.send_progress(
                context.job_id,
                "video_render",
                pct,
                "in_progress",
                detail,
            )

        audio_sem = asyncio.Semaphore(5)
        image_sem = asyncio.Semaphore(5)
        db_lock = asyncio.Lock()
        resolution = context.settings.resolution
        width, height = map(int, resolution.split("x"))

        packed = await asyncio.gather(*[
            _prepare_scene_assets(
                idx=i,
                sc=context.scenes[i],
                scene_model=scene_models.get(i),
                session=context.session,
                db_lock=db_lock,
                audio_sem=audio_sem,
                image_sem=image_sem,
                work_dir=work_dir,
                resolved_settings=context.settings,
                tts_provider=context.settings.tts_provider,
                tts_voice=context.settings.tts_voice,
                width=width,
                height=height,
                progress=_progress,
            )
            for i in range(len(context.scenes))
        ])
        context.audio_paths = [p[0] for p in packed]
        context.durations = [p[1] for p in packed]
        context.visual_paths = [""] * len(context.scenes)

        return EngineResult(
            prepared=True,
            project_id=context.project_id,
            scenes=len(context.scenes),
        )
