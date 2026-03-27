from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.storage import build_key, get_storage, guess_content_type
from backend.core.task_manager import task_manager
from backend.database import get_db
from backend.models import Project, Scene, Asset, Job, ProjectAsset
from backend.schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut, ProjectListOut,
    SceneCreate, SceneUpdate, SceneOut, JobOut, ProjectAssetOut,
)

router = APIRouter()


async def _attach_project_asset_urls(project: Project) -> None:
    storage = get_storage()
    for pa in getattr(project, "project_assets", []) or []:
        if pa.file_path:
            pa.url = await storage.get_url(pa.file_path)
    for scene in project.scenes:
        for asset in scene.assets:
            if asset.file_path:
                asset.url = await storage.get_url(asset.file_path)


async def _attach_scene_asset_urls(scene: Scene) -> None:
    storage = get_storage()
    for asset in scene.assets:
        if asset.file_path:
            asset.url = await storage.get_url(asset.file_path)


@router.get("/", response_model=list[ProjectListOut])
async def list_projects(
    skip: int = 0,
    limit: int = 50,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    scene_counts_sq = (
        select(
            Scene.project_id.label("project_id"),
            func.count(Scene.id).label("scene_count"),
        )
        .group_by(Scene.project_id)
        .subquery()
    )
    duration_sq = (
        select(
            Scene.project_id.label("project_id"),
            func.coalesce(func.sum(Scene.duration), 0).label("total_duration"),
        )
        .group_by(Scene.project_id)
        .subquery()
    )
    query = (
        select(
            Project,
            func.coalesce(scene_counts_sq.c.scene_count, 0).label("scene_count"),
            func.coalesce(duration_sq.c.total_duration, 0).label("total_duration"),
        )
        .outerjoin(scene_counts_sq, scene_counts_sq.c.project_id == Project.id)
        .outerjoin(duration_sq, duration_sq.c.project_id == Project.id)
        .order_by(Project.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if status:
        query = query.where(Project.status == status)
    result = await db.execute(query)
    rows = result.all()

    project_ids = [p.id for p, _, _ in rows]
    thumbnail_map: dict[str, str] = {}
    if project_ids:
        storage = get_storage()
        first_scene_sq = (
            select(
                Scene.project_id,
                func.min(Scene.order_index).label("min_idx"),
            )
            .where(Scene.project_id.in_(project_ids))
            .group_by(Scene.project_id)
            .subquery()
        )
        thumb_q = (
            select(Scene.project_id, Asset.file_path)
            .join(first_scene_sq, (Scene.project_id == first_scene_sq.c.project_id) & (Scene.order_index == first_scene_sq.c.min_idx))
            .join(Asset, Asset.scene_id == Scene.id)
            .where(Asset.type == "image", Asset.is_active == True)
        )
        thumb_result = await db.execute(thumb_q)
        for pid, fpath in thumb_result.all():
            if pid not in thumbnail_map and fpath:
                try:
                    thumbnail_map[pid] = await storage.get_url(fpath)
                except Exception:
                    pass

    return [
        ProjectListOut(
            id=p.id,
            title=p.title,
            story_type=p.story_type,
            status=p.status,
            created_at=p.created_at,
            scene_count=int(scene_count or 0),
            thumbnail_url=thumbnail_map.get(p.id),
            duration_sec=int(total_duration or 0) or None,
        )
        for p, scene_count, total_duration in rows
    ]


@router.get("/summary")
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    projects_q = await db.execute(
        select(
            func.count(Project.id).label("total"),
            func.coalesce(func.sum(case((Project.status == "completed", 1), else_=0)), 0).label("completed"),
            func.coalesce(func.sum(case((Project.status == "generating", 1), else_=0)), 0).label("generating"),
            func.coalesce(func.sum(case((Project.status == "failed", 1), else_=0)), 0).label("failed"),
        )
    )
    jobs_q = await db.execute(
        select(
            func.count(Job.id).label("total"),
            func.coalesce(func.sum(case((Job.status == "completed", 1), else_=0)), 0).label("completed"),
            func.coalesce(func.sum(case((Job.status == "failed", 1), else_=0)), 0).label("failed"),
            func.coalesce(func.sum(case((Job.status == "queued", 1), else_=0)), 0).label("queued"),
            func.coalesce(func.sum(case((Job.status == "in_progress", 1), else_=0)), 0).label("in_progress"),
        )
    )
    p = projects_q.one()
    j = jobs_q.one()
    return {
        "projects": {
            "total": int(p.total or 0),
            "completed": int(p.completed or 0),
            "generating": int(p.generating or 0),
            "failed": int(p.failed or 0),
        },
        "jobs": {
            "total": int(j.total or 0),
            "completed": int(j.completed or 0),
            "failed": int(j.failed or 0),
            "queued": int(j.queued or 0),
            "in_progress": int(j.in_progress or 0),
        },
    }


@router.post("/", response_model=ProjectOut, status_code=201)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
):
    project = Project(
        title=data.title,
        story_type=data.story_type,
        script=data.script,
        settings=data.settings,
        control_mode=data.control_mode,
    )
    db.add(project)
    await db.flush()
    if data.scenes:
        for i, sc in enumerate(data.scenes):
            scene = Scene(
                project_id=project.id,
                order_index=i,
                narration=sc.narration,
                subtitle=sc.subtitle or sc.narration,
                image_prompt=sc.image_prompt,
                transition_type=sc.transition_type,
                duration=sc.duration,
                scene_type=sc.scene_type,
                scene_settings=sc.scene_settings,
                is_locked=getattr(sc, "is_locked", False),
                user_notes=getattr(sc, "user_notes", None),
                trim_start_sec=getattr(sc, "trim_start_sec", 0.0) or 0.0,
                trim_end_sec=getattr(sc, "trim_end_sec", 0.0) or 0.0,
            )
            db.add(scene)
    await db.commit()
    await db.refresh(project)
    result = await db.execute(
        select(Project).where(Project.id == project.id).options(
            selectinload(Project.scenes).selectinload(Scene.assets),
            selectinload(Project.project_assets),
        )
    )
    project = result.scalar_one()
    await _attach_project_asset_urls(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(
            selectinload(Project.scenes).selectinload(Scene.assets),
            selectinload(Project.project_assets),
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    await _attach_project_asset_urls(project)
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str, data: ProjectUpdate, db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    payload = data.model_dump(exclude_unset=True)
    expected = payload.pop("expected_version", None)
    cur_v = project.version or 1
    if expected is not None and expected != cur_v:
        fresh = await db.execute(
            select(Project).where(Project.id == project_id).options(
                selectinload(Project.scenes).selectinload(Scene.assets),
                selectinload(Project.project_assets),
            )
        )
        p_cur = fresh.scalar_one()
        await _attach_project_asset_urls(p_cur)
        return JSONResponse(
            status_code=409,
            content={
                "error": "version_conflict",
                "current_version": cur_v,
                "project": ProjectOut.model_validate(p_cur).model_dump(mode="json"),
            },
        )
    for field, value in payload.items():
        setattr(project, field, value)
    project.version = cur_v + 1
    await db.commit()
    await db.refresh(project)
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(
            selectinload(Project.scenes).selectinload(Scene.assets),
            selectinload(Project.project_assets),
        )
    )
    project = result.scalar_one()
    await _attach_project_asset_urls(project)
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    await db.delete(project)
    await db.commit()


@router.post("/{project_id}/scenes", response_model=SceneOut, status_code=201)
async def add_scene(
    project_id: str, data: SceneCreate, db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Project not found")
    count_q = await db.execute(
        select(func.count(Scene.id)).where(Scene.project_id == project_id)
    )
    idx = count_q.scalar() or 0
    scene = Scene(
        project_id=project_id, order_index=idx,
        narration=data.narration, subtitle=data.subtitle or data.narration,
        image_prompt=data.image_prompt,
        transition_type=data.transition_type, duration=data.duration,
        scene_type=data.scene_type,
        scene_settings=data.scene_settings,
        is_locked=data.is_locked,
        user_notes=data.user_notes,
        trim_start_sec=data.trim_start_sec,
        trim_end_sec=data.trim_end_sec,
    )
    db.add(scene)
    await db.commit()
    result = await db.execute(
        select(Scene)
        .where(Scene.id == scene.id)
        .options(selectinload(Scene.assets))
    )
    scene = result.scalar_one()
    await _attach_scene_asset_urls(scene)
    return scene


@router.patch("/{project_id}/scenes/{scene_id}", response_model=SceneOut)
async def update_scene(
    project_id: str, scene_id: str, data: SceneUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Scene).where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(404, "Scene not found")
    r_proj = await db.execute(select(Project).where(Project.id == project_id))
    project = r_proj.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    payload = data.model_dump(exclude_unset=True)
    expected = payload.pop("expected_version", None)
    cur_v = project.version or 1
    if expected is not None and expected != cur_v:
        return JSONResponse(
            status_code=409,
            content={
                "error": "version_conflict",
                "current_version": cur_v,
            },
        )
    for field, value in payload.items():
        setattr(scene, field, value)
    project.version = cur_v + 1
    await db.commit()
    result = await db.execute(
        select(Scene)
        .where(Scene.id == scene_id, Scene.project_id == project_id)
        .options(selectinload(Scene.assets))
    )
    scene = result.scalar_one()
    await _attach_scene_asset_urls(scene)
    return scene


@router.delete("/{project_id}/scenes/{scene_id}", status_code=204)
async def delete_scene(
    project_id: str, scene_id: str, db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Scene).where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(404, "Scene not found")
    await db.delete(scene)
    await db.commit()


@router.put("/{project_id}/scenes/reorder")
async def reorder_scenes(
    project_id: str,
    scene_ids: list[str],
    db: AsyncSession = Depends(get_db),
):
    for idx, sid in enumerate(scene_ids):
        result = await db.execute(
            select(Scene).where(Scene.id == sid, Scene.project_id == project_id)
        )
        scene = result.scalar_one_or_none()
        if scene:
            scene.order_index = idx
    r_proj = await db.execute(select(Project).where(Project.id == project_id))
    project = r_proj.scalar_one_or_none()
    if project:
        project.version = (project.version or 1) + 1
    await db.commit()
    return {"status": "ok"}


@router.post("/{project_id}/scenes/{scene_id}/upload-image")
async def upload_scene_image(
    project_id: str,
    scene_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Scene)
        .where(Scene.id == scene_id, Scene.project_id == project_id)
        .options(selectinload(Scene.assets))
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(404, "Scene not found")

    if not file.filename:
        raise HTTPException(400, "No file provided")
    ext = Path(file.filename).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        raise HTTPException(400, f"Unsupported image format: {ext}")

    name = f"{uuid.uuid4().hex}{ext}"
    content = await file.read()
    key = build_key("images", name)
    storage = get_storage()
    await storage.save_bytes(key, content, guess_content_type(name))

    for a in list(scene.assets):
        if a.type == "video":
            await db.delete(a)
    for a in scene.assets:
        if a.type == "image":
            a.is_active = False
    await db.flush()

    asset = Asset(
        scene_id=scene_id,
        type="image",
        file_path=key,
        provider="upload",
        source="user_uploaded",
        is_active=True,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return {
        "id": asset.id,
        "scene_id": scene_id,
        "type": "image",
        "file_path": key,
        "provider": "upload",
        "url": await storage.get_url(key),
    }


@router.post("/{project_id}/scenes/{scene_id}/regenerate-image")
async def regenerate_scene_image(
    project_id: str,
    scene_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Regenerate the image for a scene from its image_prompt using project settings."""
    from backend.services.image_service import generate_image

    result = await db.execute(
        select(Scene)
        .where(Scene.id == scene_id, Scene.project_id == project_id)
        .options(selectinload(Scene.assets))
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(404, "Scene not found")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project or not project.settings:
        raise HTTPException(400, "Project or settings not found")

    settings = project.settings
    resolution = settings.get("resolution", "1080x1920")
    width, height = map(int, resolution.split("x"))
    ov = scene.scene_settings if isinstance(scene.scene_settings, dict) else {}
    image_provider = ov.get("image_provider") or settings.get("image_provider", "replicate")
    image_style = ov.get("image_style") or settings.get("image_style", "realistic")
    gen_kwargs: dict = {}
    nprompt = ov.get("negative_prompt")
    if isinstance(nprompt, str) and nprompt.strip():
        gen_kwargs["negative_prompt"] = nprompt.strip()
    seed = ov.get("seed")
    if seed is not None and seed != "":
        try:
            gen_kwargs["seed"] = int(seed)
        except (TypeError, ValueError):
            gen_kwargs["seed"] = seed

    if not scene.image_prompt:
        raise HTTPException(400, "Scene has no image prompt to regenerate from")

    # Drop derived clip only; keep prior images as history (latest wins in render)
    for asset in list(scene.assets):
        if asset.type == "video":
            await db.delete(asset)
    prev_id: str | None = None
    imgs = [a for a in scene.assets if a.type == "image" and a.is_active]
    if imgs:
        imgs.sort(
            key=lambda x: x.created_at.timestamp() if x.created_at else 0.0,
            reverse=True,
        )
        prev_id = imgs[0].id
    for a in scene.assets:
        if a.type == "image":
            a.is_active = False
    await db.flush()

    img_path = await generate_image(
        scene.image_prompt, image_provider, width, height, image_style, **gen_kwargs
    )

    asset = Asset(
        scene_id=scene_id,
        type="image",
        file_path=img_path,
        provider=image_provider,
        source="ai_generated",
        parent_asset_id=prev_id,
        is_active=True,
        metadata_={
            "width": width,
            "height": height,
            "style": image_style,
            **{k: gen_kwargs[k] for k in ("negative_prompt", "seed") if k in gen_kwargs},
        },
    )
    db.add(asset)
    await db.commit()

    result = await db.execute(
        select(Scene)
        .where(Scene.id == scene_id, Scene.project_id == project_id)
        .options(selectinload(Scene.assets))
    )
    scene = result.scalar_one()
    await _attach_scene_asset_urls(scene)
    return scene


class GenerateSceneAssetBody(BaseModel):
    asset_type: Literal["image", "audio"] = "image"
    prompt_override: str | None = None


@router.post("/{project_id}/scenes/{scene_id}/assets/generate", response_model=JobOut)
async def queue_generate_scene_asset(
    project_id: str,
    scene_id: str,
    body: GenerateSceneAssetBody,
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(Scene).where(Scene.id == scene_id, Scene.project_id == project_id)
    )
    if not r.scalar_one_or_none():
        raise HTTPException(404, "Scene not found")

    job = Job(
        project_id=project_id,
        type="asset_generate",
        status="queued",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    redis_params = {
        "project_id": project_id,
        "scene_id": scene_id,
        "job_id": job.id,
        "asset_type": body.asset_type,
        "prompt_override": body.prompt_override,
    }

    async def _run():
        from backend.core.job_registry import handle_asset_generate
        return await handle_asset_generate(redis_params)

    await task_manager.submit_to_redis(
        job.id, "asset_generate", redis_params, fallback_coro=_run,
    )
    return job


class PutActiveAssetBody(BaseModel):
    asset_id: str


@router.put("/{project_id}/scenes/{scene_id}/assets/active", response_model=SceneOut)
async def set_active_scene_asset(
    project_id: str,
    scene_id: str,
    body: PutActiveAssetBody,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Scene)
        .where(Scene.id == scene_id, Scene.project_id == project_id)
        .options(selectinload(Scene.assets))
    )
    scene = result.scalar_one_or_none()
    if not scene:
        raise HTTPException(404, "Scene not found")
    target = next((a for a in scene.assets if a.id == body.asset_id), None)
    if not target:
        raise HTTPException(404, "Asset not found on this scene")
    for a in scene.assets:
        if a.type == target.type:
            a.is_active = (a.id == body.asset_id)
    r_proj = await db.execute(select(Project).where(Project.id == project_id))
    project = r_proj.scalar_one()
    project.version = (project.version or 1) + 1
    await db.commit()
    result = await db.execute(
        select(Scene)
        .where(Scene.id == scene_id, Scene.project_id == project_id)
        .options(selectinload(Scene.assets))
    )
    scene = result.scalar_one()
    await _attach_scene_asset_urls(scene)
    return scene


class RegenerateScriptSectionBody(BaseModel):
    section_start: int = Field(ge=0)
    section_end: int = Field(ge=0)
    prompt_hint: str | None = None


@router.post("/{project_id}/script/regenerate-section", response_model=ProjectOut)
async def regenerate_script_section(
    project_id: str,
    body: RegenerateScriptSectionBody,
    db: AsyncSession = Depends(get_db),
):
    from backend.config import get_settings
    from backend.services.ai_client import chat_completion

    result = await db.execute(
        select(Project).where(Project.id == project_id).options(
            selectinload(Project.scenes).selectinload(Scene.assets),
            selectinload(Project.project_assets),
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    script = project.script or ""
    if body.section_end > len(script) or body.section_start > body.section_end:
        raise HTTPException(400, "Invalid section range")
    chunk = script[body.section_start : body.section_end]
    if not chunk.strip():
        raise HTTPException(400, "Selected section is empty")

    app = get_settings()
    settings = project.settings or {}
    hint = body.prompt_hint or "Improve clarity and pacing for short-form voiceover."
    messages = [
        {
            "role": "system",
            "content": (
                "You rewrite a slice of video narration. Output ONLY the replacement text "
                "for that slice — no quotes, no preamble. Match the tone of the surrounding script."
            ),
        },
        {
            "role": "user",
            "content": f"Context before:\n{script[max(0, body.section_start - 200):body.section_start]}\n\n"
            f"SECTION TO REPLACE:\n{chunk}\n\n"
            f"Context after:\n{script[body.section_end:body.section_end + 200]}\n\n"
            f"Instructions: {hint}",
        },
    ]
    new_chunk = await chat_completion(
        messages,
        settings.get("llm_provider") or app.default_llm_provider,
        settings.get("llm_model") or app.default_llm_model,
        0.7,
    )
    new_script = script[: body.section_start] + new_chunk.strip() + script[body.section_end :]
    project.script = new_script
    project.version = (project.version or 1) + 1
    await db.commit()
    await db.refresh(project)
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(
            selectinload(Project.scenes).selectinload(Scene.assets),
            selectinload(Project.project_assets),
        )
    )
    project = result.scalar_one()
    await _attach_project_asset_urls(project)
    return project


class AISuggestionsBody(BaseModel):
    focus: Literal["script", "image_prompts", "transitions"] = "script"
    hint: str | None = None


@router.post("/{project_id}/ai/suggestions")
async def ai_project_suggestions(
    project_id: str,
    body: AISuggestionsBody,
    db: AsyncSession = Depends(get_db),
):
    from backend.config import get_settings
    from backend.services.ai_client import chat_completion

    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .options(selectinload(Project.scenes))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    settings = project.settings or {}
    app = get_settings()
    scenes = sorted(project.scenes, key=lambda s: s.order_index)
    if body.focus == "script":
        user = f"Script:\n{project.script or ''}\n\nGive 3 concise improvement bullets. {body.hint or ''}"
    elif body.focus == "image_prompts":
        prompts = "\n".join(f"- {(s.image_prompt or '')[:200]}" for s in scenes)
        user = f"Image prompts:\n{prompts}\n\nSuggest 3 ways to make visuals more cinematic. {body.hint or ''}"
    else:
        trans = [s.transition_type for s in scenes]
        user = f"Transitions in order: {trans}\n\nSuggest smoother flow (names only, one line each). {body.hint or ''}"
    text = await chat_completion(
        [
            {"role": "system", "content": "You are a short-form video editor assistant. Be concise."},
            {"role": "user", "content": user},
        ],
        settings.get("llm_provider") or app.default_llm_provider,
        settings.get("llm_model") or app.default_llm_model,
        0.6,
    )
    lines = [ln.strip("- •\t ") for ln in text.splitlines() if ln.strip()]
    return {"suggestions": lines[:8] or [text.strip()[:500]]}


@router.get("/{project_id}/project-assets", response_model=list[ProjectAssetOut])
async def list_project_level_assets(project_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Project).where(Project.id == project_id))
    if not r.scalar_one_or_none():
        raise HTTPException(404, "Project not found")
    r2 = await db.execute(
        select(ProjectAsset).where(ProjectAsset.project_id == project_id).order_by(ProjectAsset.created_at.desc())
    )
    rows = r2.scalars().all()
    storage = get_storage()
    for pa in rows:
        if pa.file_path:
            pa.url = await storage.get_url(pa.file_path)
    return rows


@router.post("/{project_id}/project-assets", response_model=ProjectAssetOut, status_code=201)
async def upload_project_level_asset(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    asset_type: str = Form("music"),
    file: UploadFile = File(...),
):
    r = await db.execute(select(Project).where(Project.id == project_id))
    if not r.scalar_one_or_none():
        raise HTTPException(404, "Project not found")

    if not file.filename:
        raise HTTPException(400, "No file provided")
    ext = Path(file.filename).suffix.lower()
    allowed = {".mp3", ".wav", ".m4a", ".ogg", ".flac"}
    if asset_type == "music" and ext not in allowed:
        raise HTTPException(400, f"Unsupported audio format: {ext}")

    name = f"{uuid.uuid4().hex}{ext}"
    content = await file.read()
    key = build_key("music" if asset_type == "music" else "images", f"projects/{project_id}/{name}")
    storage = get_storage()
    await storage.save_bytes(key, content, guess_content_type(name))

    pa = ProjectAsset(
        project_id=project_id,
        type=asset_type,
        file_path=key,
        provider="upload",
        source="user_uploaded",
    )
    db.add(pa)
    r_proj = await db.execute(select(Project).where(Project.id == project_id))
    project = r_proj.scalar_one()
    project.version = (project.version or 1) + 1
    await db.commit()
    await db.refresh(pa)
    pa.url = await storage.get_url(key)
    return pa
