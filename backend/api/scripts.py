from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.schemas import (
    GenerateScriptRequest,
    GenerateVideoProductionScriptRequest,
    RewriteScriptRequest,
    StoryTemplateField,
)
from backend.schemas.generation import ViralIdeasRequest
from backend.services.script_service import (
    generate_script,
    generate_story_and_storyboard,
    generate_video_production_script,
    list_story_templates,
    rewrite_script,
    STORY_TYPES,
    validate_story_template_field,
)
from backend.services.transition_service import list_transitions
from backend.services.viral_ideas_service import fetch_viral_ideas

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
    )
    return {"script": script, "word_count": len(script.split())}


@router.post("/rewrite")
async def rewrite_script_endpoint(req: RewriteScriptRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    if not req.instruction.strip():
        raise HTTPException(status_code=400, detail="Instruction is required")
    edited = await rewrite_script(
        text=req.text,
        instruction=req.instruction,
        story_type=req.story_type,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        temperature=req.temperature,
    )
    return {"text": edited}


@router.post("/storyboard")
async def generate_storyboard_endpoint(
    concept: str = "",
    script: str = "",
    story_type: str = "general",
    story_template: str = "default",
    scene_count: int = 5,
    image_style: str = "realistic",
    word_count: int = 400,
    generate_subtitles: bool = True,
    llm_provider: str = "openai",
    llm_model: str | None = None,
):
    _check_story_template(story_template)
    storyboard = await generate_story_and_storyboard(
        concept=concept or None,
        script=script or None,
        story_type=story_type,
        scene_count=scene_count,
        image_style=image_style,
        word_count=word_count,
        generate_subtitles=generate_subtitles,
        llm_provider=llm_provider,
        llm_model=llm_model,
        story_template=story_template,
    )
    return storyboard


@router.post("/video-production")
async def generate_video_production_script_endpoint(req: GenerateVideoProductionScriptRequest):
    """Generate a professional video production script with timestamps, camera angles, lighting, quality per scene."""
    result = await generate_video_production_script(
        concept=req.concept,
        story_type=req.story_type,
        scene_count=req.scene_count,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        temperature=req.temperature,
    )
    return result


@router.get("/story-types")
async def list_story_types():
    return [{"id": t, "name": t.replace("_", " ").title()} for t in STORY_TYPES]


@router.get("/story-templates")
async def list_story_templates_endpoint():
    return list_story_templates()


class SplitScenesRequest(BaseModel):
    script: str
    scene_count: int = 5
    story_type: str = "general"
    story_template: StoryTemplateField = "default"
    generate_subtitles: bool = True
    llm_provider: str = "openai"
    llm_model: str | None = None


@router.post("/split-scenes")
async def split_script_to_scenes(req: SplitScenesRequest):
    """Split a script into individual scenes with narration and image prompts."""
    if not req.script.strip():
        raise HTTPException(400, "Script cannot be empty")

    storyboard = await generate_story_and_storyboard(
        script=req.script,
        story_type=req.story_type,
        scene_count=req.scene_count,
        image_style="realistic",
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
        raise HTTPException(400, "Could not extract enough content from this URL")

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
        raise HTTPException(400, "Paste at least 50 characters of source text")

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
            resolution_ids=_RESOLUTION_IDS,
            transition_ids=transition_ids,
        )
    except ValueError as exc:
        logger.warning("viral ideas parse error: %s", exc)
        raise HTTPException(502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("viral ideas LLM failure")
        raise HTTPException(502, detail=f"LLM failed: {str(exc)[:200]}") from exc
    return {"ideas": ideas}


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
        raise HTTPException(502, detail=f"LLM failed: {str(exc)[:200]}") from exc
    return {"suggestions": suggestions}
