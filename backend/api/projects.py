from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.storage import build_key, get_storage, guess_content_type
from backend.database import get_db
from backend.models import Project, Scene, Asset
from backend.schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut, ProjectListOut,
    SceneCreate, SceneUpdate, SceneOut,
)

router = APIRouter()


async def _attach_project_asset_urls(project: Project) -> None:
    storage = get_storage()
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
    query = select(Project).order_by(Project.created_at.desc()).offset(skip).limit(limit)
    if status:
        query = query.where(Project.status == status)
    result = await db.execute(query)
    projects = result.scalars().all()
    out = []
    for p in projects:
        scene_count_q = await db.execute(
            select(func.count(Scene.id)).where(Scene.project_id == p.id)
        )
        count = scene_count_q.scalar() or 0
        out.append(ProjectListOut(
            id=p.id, title=p.title, story_type=p.story_type,
            status=p.status, created_at=p.created_at, scene_count=count,
        ))
    return out


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
            )
            db.add(scene)
    await db.commit()
    await db.refresh(project)
    result = await db.execute(
        select(Project).where(Project.id == project.id).options(
            selectinload(Project.scenes).selectinload(Scene.assets)
        )
    )
    project = result.scalar_one()
    await _attach_project_asset_urls(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(
            selectinload(Project.scenes).selectinload(Scene.assets)
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    result = await db.execute(
        select(Project).where(Project.id == project_id).options(
            selectinload(Project.scenes).selectinload(Scene.assets)
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(scene, field, value)
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
        select(Scene).where(Scene.id == scene_id, Scene.project_id == project_id)
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

    asset = Asset(
        scene_id=scene_id,
        type="image",
        file_path=key,
        provider="upload",
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
    image_provider = settings.get("image_provider", "replicate")
    image_style = settings.get("image_style", "realistic")

    if not scene.image_prompt:
        raise HTTPException(400, "Scene has no image prompt to regenerate from")

    # Delete existing image and video assets (video clips are derived from images)
    for asset in list(scene.assets):
        if asset.type in ("image", "video"):
            await db.delete(asset)
    await db.flush()

    img_path = await generate_image(
        scene.image_prompt, image_provider, width, height, image_style
    )

    asset = Asset(
        scene_id=scene_id,
        type="image",
        file_path=img_path,
        provider=image_provider,
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
