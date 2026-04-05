from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.config import get_settings
from backend.engine.context import EngineContext
from backend.engine.requests import EngineRequest
from backend.engine.results import EngineResult
from backend.engine.stages.assets_stage import AssetsStage
from backend.engine.stages.compile_stage import CompileStage
from backend.engine.stages.storyboard_stage import StoryboardStage


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

    async def run(self, request: EngineRequest, session: Any) -> EngineResult:
        context = self.build_context(request, session)
        context = await self._storyboard_stage.run(context)
        if context.target_stage == "storyboard":
            return EngineResult(
                prepared=True,
                storyboard_only=True,
                project_id=context.project_id,
                scenes=len(context.scenes),
                project_version=context.project_version,
            )
        if context.target_stage == "assets":
            return await self._assets_stage.run(context)
        return await self._compile_stage.run(context)
