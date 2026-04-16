from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.schemas import (
    GenerateScriptRequest,
    GenerateStoryboardRequest,
    GenerateVideoProductionScriptRequest,
    NormalizeScriptRequest,
    NormalizeScriptResponse,
    RefineScriptCharactersRequest,
    RefineScriptCharactersResponse,
    RewriteScriptRequest,
    ScriptAnalysisRequest,
    ScriptImproveRequest,
    ScriptImproveResponse,
    ScriptQualityMetrics,
    StoryQualityReport,
    StoryStructureAnalysisRequest,
    StoryTemplateField,
)
from backend.schemas.generation import ViralIdeasRequest
from backend.services.script_service import (
    analyze_story_structure_report,
    analyze_narration_quality,
    analyze_hook_quality,
    generate_script,
    generate_story_and_storyboard,
    generate_video_production_script,
    improve_narration_text,
    list_story_templates,
    normalize_script_text_with_report,
    refine_script_with_characters,
    rewrite_script,
    validate_story_template_field,
)
from backend.services.story_structure import list_story_type_options
from backend.services.transition_service import list_transitions
from backend.services.viral_ideas_service import fetch_viral_ideas, stream_viral_ideas

router = APIRouter()
logger = logging.getLogger(__name__)

_RESOLUTION_IDS = [
    "1080x1920",
    "720x1280",
    "1920x1080",
    "1280x720",
    "1024x1024",
    "1024x1792",
    "1792x1024",
]


def _check_story_template(story_template: str) -> None:
    try:
        validate_story_template_field(story_template)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/generate")
async def generate_script_endpoint(req: GenerateScriptRequest):
    script = await generate_script(
        concept=req.concept,
        story_type=req.story_type,
        word_count=req.word_count,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        temperature=req.temperature,
        story_template=req.story_template,
        story_brief=req.story_brief.model_dump(exclude_none=True) if req.story_brief else None,
    )
    return {"script": script, "word_count": len(script.split())}


@router.post("/rewrite")
async def rewrite_script_endpoint(req: RewriteScriptRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Please add text to rewrite.")
    if not req.instruction.strip():
        raise HTTPException(status_code=400, detail="Please add instructions for the rewrite.")
    edited = await rewrite_script(
        text=req.text,
        instruction=req.instruction,
        story_type=req.story_type,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        temperature=req.temperature,
    )
    return {"text": edited}


@router.post("/refine-characters", response_model=RefineScriptCharactersResponse)
async def refine_script_characters_endpoint(req: RefineScriptCharactersRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Please add text to refine.")
    if not req.instruction.strip():
        raise HTTPException(status_code=400, detail="Please describe what should change.")
    try:
        refined_text, characters = await refine_script_with_characters(
            text=req.text,
            instruction=req.instruction,
            story_type=req.story_type,
            llm_provider=req.llm_provider,
            llm_model=req.llm_model,
            temperature=req.temperature,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"Refine response was invalid: {exc}") from exc
    return RefineScriptCharactersResponse(text=refined_text, characters=characters)


@router.post("/analyze", response_model=ScriptQualityMetrics)
async def analyze_script_quality_endpoint(req: ScriptAnalysisRequest):
    narration = req.narration.strip()
    if not narration:
        raise HTTPException(status_code=400, detail="Narration is required")

    hook_analysis = None
    if req.is_first_scene:
        hook_analysis = await analyze_hook_quality(
            script_text=narration,
            concept=narration,
            story_type=req.story_type,
            llm_provider=req.llm_provider,
            llm_model=req.llm_model,
        )

    metrics = analyze_narration_quality(
        narration,
        story_type=req.story_type,
        previous_narrations=req.previous_narrations,
        hook_analysis=hook_analysis,
        is_first_scene=req.is_first_scene,
    )
    return ScriptQualityMetrics.model_validate(metrics)


@router.post("/improve", response_model=ScriptImproveResponse)
async def improve_script_quality_endpoint(req: ScriptImproveRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    improved = await improve_narration_text(
        text,
        story_type=req.story_type,
        previous_narrations=req.previous_narrations,
        is_first_scene=req.is_first_scene,
        issues=req.issues,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        temperature=req.temperature,
    )

    hook_analysis = None
    if req.is_first_scene:
        hook_analysis = await analyze_hook_quality(
            script_text=improved,
            concept=improved,
            story_type=req.story_type,
            llm_provider=req.llm_provider,
            llm_model=req.llm_model,
        )

    metrics = analyze_narration_quality(
        improved,
        story_type=req.story_type,
        previous_narrations=req.previous_narrations,
        hook_analysis=hook_analysis,
        is_first_scene=req.is_first_scene,
    )
    return ScriptImproveResponse(
        text=improved,
        metrics=ScriptQualityMetrics.model_validate(metrics),
        improvements_made=req.issues or ["hook", "pacing", "tts_clarity"],
    )


@router.post("/normalize", response_model=NormalizeScriptResponse)
async def normalize_script_endpoint(req: NormalizeScriptRequest):
    normalized_text, report = normalize_script_text_with_report(req.text)
    return NormalizeScriptResponse(text=normalized_text, report=report)


@router.post("/analyze-story-structure", response_model=StoryQualityReport)
async def analyze_story_structure_endpoint(req: StoryStructureAnalysisRequest):
    scene_payloads = [scene.model_dump(exclude_none=True) for scene in req.scenes]
    report = analyze_story_structure_report(
        story_type=req.story_type,
        story_template=req.story_template,
        scenes=scene_payloads,
        script=req.script,
        story_brief=req.story_brief.model_dump(exclude_none=True) if req.story_brief else None,
    )
    return StoryQualityReport.model_validate(report)


@router.post("/storyboard")
async def generate_storyboard_endpoint(req: GenerateStoryboardRequest):
    _check_story_template(req.story_template)
    try:
        storyboard = await generate_story_and_storyboard(
            concept=req.concept or None,
            script=req.script or None,
            story_type=req.story_type,
            scene_count=req.scene_count,
            dynamic_scenes=req.dynamic_scenes,
            image_style=req.image_style,
            resolution=req.resolution,
            transition=req.transition,
            word_count=req.word_count,
            scene_narration_style=req.scene_narration_style,
            generate_subtitles=req.generate_subtitles,
            llm_provider=req.llm_provider,
            llm_model=req.llm_model,
            story_template=req.story_template,
            story_brief=req.story_brief.model_dump(exclude_none=True) if req.story_brief else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return storyboard


@router.post("/video-production")
async def generate_video_production_script_endpoint(req: GenerateVideoProductionScriptRequest):
    """Generate a professional video production script with timestamps, camera angles, lighting, quality per scene."""
    result = await generate_video_production_script(
        concept=req.concept,
        story_type=req.story_type,
        story_template=req.story_template,
        scene_count=req.scene_count,
        dynamic_scenes=req.dynamic_scenes,
        image_style=req.image_style,
        resolution=req.resolution,
        transition=req.transition,
        scene_narration_style=req.scene_narration_style,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        temperature=req.temperature,
        visual_continuity=req.visual_continuity,
        story_brief=req.story_brief.model_dump(exclude_none=True) if req.story_brief else None,
    )
    return result


@router.get("/story-types")
async def list_story_types():
    return list_story_type_options()


@router.get("/story-templates")
async def list_story_templates_endpoint():
    return list_story_templates()


class SplitScenesRequest(BaseModel):
    script: str
    scene_count: int = Field(default=5, ge=2, le=100)
    dynamic_scenes: bool = False
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    scene_narration_style: str = "balanced"
    generate_subtitles: bool = True
    llm_provider: str = "openai"
    llm_model: str | None = None


@router.post("/split-scenes")
async def split_script_to_scenes(req: SplitScenesRequest):
    """Split a script into individual scenes with narration and image prompts."""
    if not req.script.strip():
        raise HTTPException(400, "Please add a script before splitting into scenes.")

    storyboard = await generate_story_and_storyboard(
        script=req.script,
        story_type=req.story_type,
        scene_count=req.scene_count,
        dynamic_scenes=req.dynamic_scenes,
        image_style="realistic",
        scene_narration_style=req.scene_narration_style,
        generate_subtitles=req.generate_subtitles,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        story_template=req.story_template,
    )
    return storyboard


class UrlToScriptRequest(BaseModel):
    url: str
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    word_count: int = 400
    llm_provider: str = "openai"
    llm_model: str | None = None


class TextToScriptRequest(BaseModel):
    text: str
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    word_count: int = 400
    llm_provider: str = "openai"
    llm_model: str | None = None


def _extract_text_sync(url: str) -> str:
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            text = trafilatura.extract(downloaded, include_comments=False, include_tables=False)
            if text:
                return text
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("trafilatura failed for %s: %s", url, exc)

    try:
        import httpx
        from bs4 import BeautifulSoup
        resp = httpx.get(url, follow_redirects=True, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        lines = [line.strip() for line in text.splitlines() if len(line.strip()) > 20]
        return "\n".join(lines[:200])
    except Exception as exc:
        raise RuntimeError(f"Could not extract content from URL: {exc}") from exc


@router.post("/url-to-script")
async def url_to_script(req: UrlToScriptRequest):
    try:
        content = await asyncio.to_thread(_extract_text_sync, req.url)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc

    if not content or len(content.strip()) < 50:
        raise HTTPException(400, "We couldn't extract enough text from that URL.")

    summary = content[:3000]
    concept = f"Create a video script based on this content:\n\n{summary}"
    script = await generate_script(
        concept=concept,
        story_type=req.story_type,
        word_count=req.word_count,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        story_template=req.story_template,
    )

    return {
        "script": script,
        "word_count": len(script.split()),
        "source_url": req.url,
        "extracted_length": len(content),
    }


@router.post("/text-to-script")
async def text_to_script(req: TextToScriptRequest):
    content = req.text.strip()
    if len(content) < 50:
        raise HTTPException(400, "Please paste at least 50 characters of source text.")

    summary = content[:3000]
    concept = f"Create a video script based on this content:\n\n{summary}"
    script = await generate_script(
        concept=concept,
        story_type=req.story_type,
        word_count=req.word_count,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        story_template=req.story_template,
    )

    return {
        "script": script,
        "word_count": len(script.split()),
        "extracted_length": len(content),
    }


@router.post("/viral-ideas")
async def viral_ideas(req: ViralIdeasRequest):
    """LLM-generated viral-style topics with normalized video settings for the Create form."""
    transition_ids = [t["id"] for t in list_transitions()]
    try:
        ideas = await fetch_viral_ideas(
            niche=req.niche,
            count=req.count,
            llm_provider=req.llm_provider,
            llm_model=req.llm_model,
            idea_type=req.idea_type,
            tone=req.tone,
            hook_style=req.hook_style,
            virality_angle=req.virality_angle,
            duration_target_seconds=req.duration_target_seconds,
            character_mode=req.character_mode,
            cast_size=req.cast_size,
            avoid_topics=req.avoid_topics,
            resolution_ids=_RESOLUTION_IDS,
            transition_ids=transition_ids,
        )
    except ValueError as exc:
        logger.warning("viral ideas parse error: %s", exc)
        raise HTTPException(502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("viral ideas LLM failure")
        raise HTTPException(502, detail=f"AI request failed: {str(exc)[:200]}") from exc
    return {"ideas": ideas}


@router.post("/viral-ideas-stream")
async def viral_ideas_stream(req: ViralIdeasRequest):
    """Stream viral ideas progressively as NDJSON events."""
    transition_ids = [t["id"] for t in list_transitions()]

    async def event_stream():
        try:
            async for event in stream_viral_ideas(
                niche=req.niche,
                count=req.count,
                llm_provider=req.llm_provider,
                llm_model=req.llm_model,
                idea_type=req.idea_type,
                tone=req.tone,
                hook_style=req.hook_style,
                virality_angle=req.virality_angle,
                duration_target_seconds=req.duration_target_seconds,
                character_mode=req.character_mode,
                cast_size=req.cast_size,
                avoid_topics=req.avoid_topics,
                resolution_ids=_RESOLUTION_IDS,
                transition_ids=transition_ids,
            ):
                yield json.dumps(event) + "\n"
        except ValueError as exc:
            logger.warning("viral ideas stream parse error: %s", exc)
            yield json.dumps({"type": "error", "message": str(exc)}) + "\n"
        except Exception as exc:
            logger.exception("viral ideas stream failure")
            yield json.dumps({"type": "error", "message": f"AI request failed: {str(exc)[:200]}"}) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


class AnalyzeConceptRequest(BaseModel):
    title: str = ""
    story_type: str = "general"
    niche: str | None = Field(default=None, max_length=240)
    llm_provider: str = "openai"
    llm_model: str | None = None


@router.post("/analyze-concept")
async def analyze_concept_endpoint(req: AnalyzeConceptRequest):
    """LLM hook variations and engagement notes for the Create form co-pilot."""
    if not req.title.strip():
        raise HTTPException(400, detail="Title is required")
    from backend.services.concept_analyze_service import analyze_concept as run_analyze

    try:
        suggestions = await run_analyze(
            title=req.title,
            story_type=req.story_type,
            niche=req.niche,
            llm_provider=req.llm_provider,
            llm_model=req.llm_model,
        )
    except ValueError as exc:
        logger.warning("analyze concept parse error: %s", exc)
        raise HTTPException(502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("analyze concept LLM failure")
        raise HTTPException(502, detail=f"AI request failed: {str(exc)[:200]}") from exc
    return {"suggestions": suggestions}
