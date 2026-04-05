from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Template

router = APIRouter()

BUILTIN_TEMPLATES = [
    {
        "name": "Reddit Story",
        "description": "Viral Reddit-style storytelling with dramatic narration and AI visuals",
        "category": "social",
        "story_type": "reddit_story",
        "scene_count": 5,
        "settings": {
            "image_style": "cinematic",
            "tts_provider": "kokoro",
            "tts_voice": "am_michael",
            "subtitle_enabled": True,
            "subtitle_font": "Impact",
            "subtitle_color": "#FFFFFF",
            "subtitle_position": "bottom",
            "transition": "fade",
            "resolution": "1080x1920",
        },
    },
    {
        "name": "Explainer Video",
        "description": "Professional explainer video with clean visuals and clear narration",
        "category": "education",
        "story_type": "educational",
        "scene_count": 6,
        "settings": {
            "image_style": "3d_render",
            "tts_provider": "kokoro",
            "tts_voice": "af_bella",
            "subtitle_enabled": True,
            "subtitle_font": "Montserrat",
            "subtitle_color": "#FFFFFF",
            "subtitle_position": "bottom",
            "transition": "dissolve",
            "resolution": "1920x1080",
        },
    },
    {
        "name": "Top 5 Listicle",
        "description": "Engaging countdown-style video for top 5/10 lists",
        "category": "entertainment",
        "story_type": "top_list",
        "scene_count": 7,
        "settings": {
            "image_style": "cinematic",
            "tts_provider": "kokoro",
            "tts_voice": "am_adam",
            "subtitle_enabled": True,
            "subtitle_font": "Arial",
            "subtitle_color": "#FFD700",
            "subtitle_position": "bottom",
            "transition": "zoom_in",
            "resolution": "1080x1920",
        },
    },
    {
        "name": "Scary Story",
        "description": "Horror-themed narration with dark, atmospheric visuals",
        "category": "entertainment",
        "story_type": "horror",
        "scene_count": 5,
        "settings": {
            "image_style": "cinematic",
            "tts_provider": "kokoro",
            "tts_voice": "am_echo",
            "subtitle_enabled": True,
            "subtitle_font": "Impact",
            "subtitle_color": "#FF0000",
            "subtitle_position": "bottom",
            "transition": "fade",
            "resolution": "1080x1920",
        },
    },
    {
        "name": "Product Demo",
        "description": "Clean product showcase with professional voiceover",
        "category": "business",
        "story_type": "general",
        "scene_count": 4,
        "settings": {
            "image_style": "realistic",
            "tts_provider": "kokoro",
            "tts_voice": "af_sky",
            "subtitle_enabled": True,
            "subtitle_font": "Roboto",
            "subtitle_color": "#FFFFFF",
            "subtitle_position": "bottom",
            "transition": "dissolve",
            "resolution": "1920x1080",
        },
    },
    {
        "name": "Motivational Short",
        "description": "Inspirational short-form video with powerful quotes and visuals",
        "category": "social",
        "story_type": "motivational",
        "scene_count": 5,
        "settings": {
            "image_style": "cinematic",
            "tts_provider": "kokoro",
            "tts_voice": "bm_fable",
            "subtitle_enabled": True,
            "subtitle_font": "Montserrat",
            "subtitle_color": "#FFFFFF",
            "subtitle_position": "center",
            "transition": "fade",
            "resolution": "1080x1920",
        },
    },
    {
        "name": "Fun Facts",
        "description": "Quick, entertaining facts with colorful visuals",
        "category": "education",
        "story_type": "fun_facts",
        "scene_count": 5,
        "settings": {
            "image_style": "3d_render",
            "tts_provider": "kokoro",
            "tts_voice": "af_nova",
            "subtitle_enabled": True,
            "subtitle_font": "Arial",
            "subtitle_color": "#00FF88",
            "subtitle_position": "bottom",
            "transition": "zoom_in",
            "resolution": "1080x1920",
        },
    },
    {
        "name": "News Recap",
        "description": "Professional news-style reporting with anchored narration",
        "category": "business",
        "story_type": "news",
        "scene_count": 5,
        "settings": {
            "image_style": "realistic",
            "tts_provider": "kokoro",
            "tts_voice": "am_michael",
            "subtitle_enabled": True,
            "subtitle_font": "Roboto",
            "subtitle_color": "#FFFFFF",
            "subtitle_position": "bottom",
            "transition": "fade",
            "resolution": "1920x1080",
        },
    },
]


class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    category: str = "general"
    story_type: str = "general"
    scene_count: int = 5
    settings: dict | None = None
    scenes: list | None = None


@router.get("/")
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Template).order_by(Template.created_at.desc()))
    custom = result.scalars().all()
    custom_list = [
        {
            "id": t.id, "name": t.name, "description": t.description,
            "category": t.category, "story_type": t.story_type,
            "scene_count": t.scene_count, "settings": t.settings,
            "scenes": t.scenes, "builtin": False,
        }
        for t in custom
    ]
    builtin = [
        {**t, "id": f"builtin_{i}", "builtin": True}
        for i, t in enumerate(BUILTIN_TEMPLATES)
    ]
    return builtin + custom_list


@router.get("/{template_id}")
async def get_template(template_id: str, db: AsyncSession = Depends(get_db)):
    if template_id.startswith("builtin_"):
        idx = int(template_id.replace("builtin_", ""))
        if 0 <= idx < len(BUILTIN_TEMPLATES):
            return {**BUILTIN_TEMPLATES[idx], "id": template_id, "builtin": True}
        raise HTTPException(404, "Template not found")
    result = await db.execute(select(Template).where(Template.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    return {
        "id": t.id, "name": t.name, "description": t.description,
        "category": t.category, "story_type": t.story_type,
        "scene_count": t.scene_count, "settings": t.settings,
        "scenes": t.scenes, "builtin": False,
    }


@router.post("/", status_code=201)
async def create_template(data: TemplateCreate, db: AsyncSession = Depends(get_db)):
    template = Template(
        name=data.name,
        description=data.description,
        category=data.category,
        story_type=data.story_type,
        scene_count=data.scene_count,
        settings=data.settings,
        scenes=data.scenes,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return {
        "id": template.id, "name": template.name, "description": template.description,
        "category": template.category, "story_type": template.story_type,
        "scene_count": template.scene_count, "settings": template.settings,
        "scenes": template.scenes, "builtin": False,
    }


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: str, db: AsyncSession = Depends(get_db)):
    if template_id.startswith("builtin_"):
        raise HTTPException(400, "Cannot delete built-in templates")
    result = await db.execute(select(Template).where(Template.id == template_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    await db.delete(t)
    await db.commit()
