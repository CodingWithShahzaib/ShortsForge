from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path
from typing import Any

from backend.config import get_settings
from backend.engine.context import EngineContext
from backend.engine.requests import EngineRequest
from backend.engine.results import EngineResult
from backend.engine.stages.assets_stage import AssetsStage
from backend.engine.stages.compile_stage import CompileStage
from backend.engine.stages.storyboard_stage import StoryboardStage

logger = logging.getLogger(__name__)


def _safe_cleanup_temp_dir(temp_root: Path, work_dir: Path) -> None:
    try:
        temp_root_resolved = temp_root.resolve()
        work_resolved = work_dir.resolve()
    except FileNotFoundError:
        return
    if temp_root_resolved == work_resolved:
        return
    if temp_root_resolved not in work_resolved.parents:
        return
    if not work_resolved.exists():
        return
    shutil.rmtree(work_resolved, ignore_errors=True)


class ShortsForgeEngine:
    """Engine orchestrator coordinating storyboard, assets, and compile stages."""

    def __init__(
        self,
        *,
        storyboard_stage: StoryboardStage | None = None,
        assets_stage: AssetsStage | None = None,
        compile_stage: CompileStage | None = None,
    ) -> None:
        self._storyboard_stage = storyboard_stage or StoryboardStage()
        self._assets_stage = assets_stage or AssetsStage()
        self._compile_stage = compile_stage or CompileStage()

    def build_context(self, request: EngineRequest, session: Any) -> EngineContext:
        app_settings = get_settings()
        work_dir = Path(app_settings.temp_dir) / request.project_id
        local_output_dir = work_dir / "output"
        return EngineContext(
            project_id=request.project_id,
            job_id=request.job_id,
            session=session,
            settings=request.settings,
            scenes=list(request.scenes or []),
            pipeline_mode=request.pipeline_mode,
            target_stage=request.target_stage,
            regenerate_scene_ids=request.regenerate_scene_ids,
            force_regenerate_scene_clips=request.force_regenerate_scene_clips,
            work_dir=work_dir,
            local_output_dir=local_output_dir,
            app_settings=app_settings,
        )

    @staticmethod
    def _with_timing(
        result: EngineResult,
        *,
        stage_durations_ms: dict[str, int],
        total_duration_ms: int,
        scene_count: int,
    ) -> EngineResult:
        average_scene_runtime_ms = (
            round(total_duration_ms / max(scene_count, 1), 2)
            if scene_count > 0
            else None
        )
        payload = result.to_mapping()
        payload["stage_durations_ms"] = stage_durations_ms
        payload["total_duration_ms"] = total_duration_ms
        payload["average_scene_runtime_ms"] = average_scene_runtime_ms
        return EngineResult(**payload)

    async def run(self, request: EngineRequest, session: Any) -> EngineResult:
        total_start = time.perf_counter()
        stage_durations_ms: dict[str, int] = {}
        context = self.build_context(request, session)
        storyboard_start = time.perf_counter()
        context = await self._storyboard_stage.run(context)
        stage_durations_ms["storyboard"] = round((time.perf_counter() - storyboard_start) * 1000)
        if context.target_stage == "storyboard":
            result = EngineResult(
                prepared=True,
                storyboard_only=True,
                project_id=context.project_id,
                scenes=len(context.scenes),
                project_version=context.project_version,
            )
            total_duration_ms = round((time.perf_counter() - total_start) * 1000)
            timed_result = self._with_timing(
                result,
                stage_durations_ms=stage_durations_ms,
                total_duration_ms=total_duration_ms,
                scene_count=len(context.scenes),
            )
            logger.info(
                "Engine timing project_id=%s target_stage=%s stage_durations_ms=%s total_duration_ms=%s average_scene_runtime_ms=%s",
                context.project_id,
                context.target_stage,
                timed_result.stage_durations_ms,
                timed_result.total_duration_ms,
                timed_result.average_scene_runtime_ms,
            )
            return timed_result
        if context.target_stage == "assets":
            assets_start = time.perf_counter()
            result = await self._assets_stage.run(context)
            stage_durations_ms["assets"] = round((time.perf_counter() - assets_start) * 1000)
        else:
            compile_start = time.perf_counter()
            result = await self._compile_stage.run(context)
            stage_durations_ms["compile"] = round((time.perf_counter() - compile_start) * 1000)
            _safe_cleanup_temp_dir(Path(context.app_settings.temp_dir), context.work_dir)

        total_duration_ms = round((time.perf_counter() - total_start) * 1000)
        timed_result = self._with_timing(
            result,
            stage_durations_ms=stage_durations_ms,
            total_duration_ms=total_duration_ms,
            scene_count=len(context.scenes),
        )
        logger.info(
            "Engine timing project_id=%s target_stage=%s stage_durations_ms=%s total_duration_ms=%s average_scene_runtime_ms=%s",
            context.project_id,
            context.target_stage,
            timed_result.stage_durations_ms,
            timed_result.total_duration_ms,
            timed_result.average_scene_runtime_ms,
        )
        return timed_result
