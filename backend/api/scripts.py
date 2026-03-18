from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.schemas import (
    GenerateScriptRequest,
    GenerateVideoProductionScriptRequest,
    DirectorBoardGenerateRequest,
)
from backend.services.script_service import (
    generate_script,
    generate_story_and_storyboard,
    generate_video_production_script,
    generate_director_board_sections,
    STORY_TYPES,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/generate")
async def generate_script_endpoint(req: GenerateScriptRequest):
    script = await generate_script(
        concept=req.concept,
        story_type=req.story_type,
        word_count=req.word_count,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        temperature=req.temperature,
    )
    return {"script": script, "word_count": len(script.split())}


@router.post("/storyboard")
async def generate_storyboard_endpoint(
    concept: str = "",
    script: str = "",
    story_type: str = "general",
    scene_count: int = 5,
    image_style: str = "realistic",
    word_count: int = 400,
    generate_subtitles: bool = True,
    llm_provider: str = "openai",
    llm_model: str | None = None,
):
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
    )
    return storyboard


@router.post("/video-production")
async def generate_video_production_script_endpoint(req: GenerateVideoProductionScriptRequest):
    """Generate a professional video production script with timestamps, camera angles, lighting, quality per scene (Sora/Runway style)."""
    result = await generate_video_production_script(
        concept=req.concept,
        story_type=req.story_type,
        scene_count=req.scene_count,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        temperature=req.temperature,
    )
    return result


@router.post("/director-board")
async def generate_director_board_endpoint(req: DirectorBoardGenerateRequest):
    """AI-generate cinematic settings, audio design, and safety rules from overall story + timeline."""
    entries = [
        {
            "start_sec": e.start_sec,
            "end_sec": e.end_sec,
            "phase_label": e.phase_label,
            "script": e.script,
            "bullet_notes": e.bullet_notes or [],
        }
        for e in req.timeline_entries
    ]
    return await generate_director_board_sections(
        overall_story=req.overall_story,
        timeline_entries=entries,
        total_duration=req.total_duration,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        temperature=req.temperature,
    )


@router.get("/story-types")
async def list_story_types():
    return [{"id": t, "name": t.replace("_", " ").title()} for t in STORY_TYPES]


class SplitScenesRequest(BaseModel):
    script: str
    scene_count: int = 5
    story_type: str = "general"
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
    )
    return storyboard


class UrlToScriptRequest(BaseModel):
    url: str
    story_type: str = "general"
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
        raise RuntimeError(f"Could not extract content from URL: {exc}")


@router.post("/url-to-script")
async def url_to_script(req: UrlToScriptRequest):
    try:
        content = await asyncio.to_thread(_extract_text_sync, req.url)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))

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
    )

    return {
        "script": script,
        "word_count": len(script.split()),
        "source_url": req.url,
        "extracted_length": len(content),
    }
