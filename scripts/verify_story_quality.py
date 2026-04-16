from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload

from backend.database import async_session
from backend.models import Asset, Project, Scene
from backend.services.story_structure import normalize_story_type_value


@dataclass
class SceneAudit:
    scene_id: str
    order_index: int
    beat_role: str | None
    story_profile: str | None
    has_image_asset: bool
    prompt_audit_present: bool
    prompt_keyword_hits: dict[str, bool]


@dataclass
class ProjectAudit:
    project_id: str
    title: str
    status: str
    created_at: str
    story_type: str
    normalized_story_type: str
    story_brief_present: bool
    quality_report_present: bool
    hook_type: str | None
    ending_type: str | None
    scene_count: int
    scenes_with_role_metadata: int
    scenes_with_story_profile: int
    image_scenes_with_prompt_audit: int
    image_scene_count: int
    scene_audits: list[SceneAudit]


def _latest_active_image_asset(scene: Scene) -> Asset | None:
    candidates = [
        asset
        for asset in scene.assets
        if asset.type == "image" and getattr(asset, "is_active", True)
    ]
    candidates.sort(
        key=lambda asset: asset.created_at.timestamp() if asset.created_at else 0.0,
        reverse=True,
    )
    return candidates[0] if candidates else None


def _pick_recent_diverse_projects(projects: list[Project], sample_size: int) -> list[Project]:
    selected: list[Project] = []
    selected_ids: set[str] = set()
    seen_story_types: set[str] = set()

    for project in projects:
        normalized = normalize_story_type_value(project.story_type)
        if normalized in seen_story_types:
            continue
        selected.append(project)
        selected_ids.add(project.id)
        seen_story_types.add(normalized)
        if len(selected) >= sample_size:
            return selected

    for project in projects:
        if project.id in selected_ids:
            continue
        selected.append(project)
        selected_ids.add(project.id)
        if len(selected) >= sample_size:
            break
    return selected


def _audit_project(project: Project) -> ProjectAudit:
    settings = project.settings if isinstance(project.settings, Mapping) else {}
    story_brief = settings.get("story_brief") if isinstance(settings.get("story_brief"), Mapping) else {}
    quality_report = settings.get("story_quality_report") or settings.get("quality_report")
    ordered_scenes = sorted(project.scenes, key=lambda scene: scene.order_index)

    scene_audits: list[SceneAudit] = []
    scenes_with_role_metadata = 0
    scenes_with_story_profile = 0
    image_scene_count = 0
    image_scenes_with_prompt_audit = 0

    for scene in ordered_scenes:
        scene_settings = scene.scene_settings if isinstance(scene.scene_settings, Mapping) else {}
        beat_role = str(
            scene_settings.get("beat_role")
            or scene_settings.get("scene_role")
            or ""
        ).strip() or None
        story_profile = str(scene_settings.get("story_profile") or "").strip() or None
        image_asset = _latest_active_image_asset(scene)
        prompt_audit = (
            image_asset.metadata_.get("prompt_audit")
            if image_asset and isinstance(image_asset.metadata_, Mapping)
            else None
        )
        keyword_hits = (
            dict(prompt_audit.get("profile_keyword_hits") or {})
            if isinstance(prompt_audit, Mapping)
            else {}
        )

        if beat_role:
            scenes_with_role_metadata += 1
        if story_profile:
            scenes_with_story_profile += 1
        if image_asset:
            image_scene_count += 1
        if isinstance(prompt_audit, Mapping):
            image_scenes_with_prompt_audit += 1

        scene_audits.append(
            SceneAudit(
                scene_id=scene.id,
                order_index=scene.order_index,
                beat_role=beat_role,
                story_profile=story_profile,
                has_image_asset=image_asset is not None,
                prompt_audit_present=isinstance(prompt_audit, Mapping),
                prompt_keyword_hits={str(key): bool(value) for key, value in keyword_hits.items()},
            )
        )

    return ProjectAudit(
        project_id=project.id,
        title=project.title,
        status=project.status,
        created_at=project.created_at.isoformat() if project.created_at else "",
        story_type=project.story_type,
        normalized_story_type=normalize_story_type_value(project.story_type),
        story_brief_present=bool(story_brief),
        quality_report_present=isinstance(quality_report, Mapping),
        hook_type=str(story_brief.get("hook_type") or "").strip() or None,
        ending_type=str(story_brief.get("ending_type") or "").strip() or None,
        scene_count=len(ordered_scenes),
        scenes_with_role_metadata=scenes_with_role_metadata,
        scenes_with_story_profile=scenes_with_story_profile,
        image_scenes_with_prompt_audit=image_scenes_with_prompt_audit,
        image_scene_count=image_scene_count,
        scene_audits=scene_audits,
    )


def _build_summary(project_audits: list[ProjectAudit]) -> dict[str, Any]:
    total_projects = len(project_audits)
    total_scenes = sum(project.scene_count for project in project_audits)
    total_image_scenes = sum(project.image_scene_count for project in project_audits)
    scenes_with_roles = sum(project.scenes_with_role_metadata for project in project_audits)
    scenes_with_story_profiles = sum(project.scenes_with_story_profile for project in project_audits)
    image_scenes_with_prompt_audit = sum(project.image_scenes_with_prompt_audit for project in project_audits)

    return {
        "projects_audited": total_projects,
        "total_scenes": total_scenes,
        "total_image_scenes": total_image_scenes,
        "story_brief_present_projects": sum(1 for project in project_audits if project.story_brief_present),
        "quality_report_present_projects": sum(1 for project in project_audits if project.quality_report_present),
        "scenes_with_role_metadata": scenes_with_roles,
        "scenes_with_story_profile": scenes_with_story_profiles,
        "image_scenes_with_prompt_audit": image_scenes_with_prompt_audit,
        "scene_role_coverage_pct": round((scenes_with_roles / total_scenes) * 100, 1) if total_scenes else 0.0,
        "story_profile_coverage_pct": round((scenes_with_story_profiles / total_scenes) * 100, 1) if total_scenes else 0.0,
        "prompt_audit_coverage_pct": round((image_scenes_with_prompt_audit / total_image_scenes) * 100, 1)
        if total_image_scenes
        else 0.0,
    }


def _print_human_report(project_audits: list[ProjectAudit], summary: Mapping[str, Any]) -> None:
    print("ShortsForge Story Quality Audit")
    print("=" * 32)
    print(
        "Checks `Project.settings.story_brief`, "
        "`Project.settings.story_quality_report|quality_report`, and "
        "`Scene.scene_settings.beat_role|scene_role`."
    )
    print()
    print("Coverage Summary")
    print(f"- Projects audited: {summary['projects_audited']}")
    print(f"- Total scenes: {summary['total_scenes']}")
    print(
        f"- Scene role coverage: {summary['scenes_with_role_metadata']}/{summary['total_scenes']} "
        f"({summary['scene_role_coverage_pct']}%)"
    )
    print(
        f"- Story profile coverage: {summary['scenes_with_story_profile']}/{summary['total_scenes']} "
        f"({summary['story_profile_coverage_pct']}%)"
    )
    print(
        f"- Project story briefs: {summary['story_brief_present_projects']}/{summary['projects_audited']}"
    )
    print(
        f"- Project quality reports: {summary['quality_report_present_projects']}/{summary['projects_audited']}"
    )
    print(
        f"- Prompt audit coverage: {summary['image_scenes_with_prompt_audit']}/{summary['total_image_scenes']} "
        f"({summary['prompt_audit_coverage_pct']}%)"
    )

    for project in project_audits:
        print()
        print(f"{project.title} [{project.project_id}]")
        print(
            f"- Created: {project.created_at or 'unknown'} | Status: {project.status} | "
            f"Story type: {project.story_type} -> {project.normalized_story_type}"
        )
        print(
            f"- Story brief: {'yes' if project.story_brief_present else 'no'} | "
            f"Hook: {project.hook_type or 'missing'} | Ending: {project.ending_type or 'missing'}"
        )
        print(
            f"- Quality report: {'yes' if project.quality_report_present else 'no'} | "
            f"Scene roles: {project.scenes_with_role_metadata}/{project.scene_count} | "
            f"Prompt audits: {project.image_scenes_with_prompt_audit}/{project.image_scene_count}"
        )

        missing_roles = [
            f"S{scene.order_index + 1}"
            for scene in project.scene_audits
            if not scene.beat_role
        ]
        missing_prompt_audits = [
            f"S{scene.order_index + 1}"
            for scene in project.scene_audits
            if scene.has_image_asset and not scene.prompt_audit_present
        ]
        if missing_roles:
            print(f"- Missing beat metadata: {', '.join(missing_roles)}")
        if missing_prompt_audits and project.image_scene_count:
            print(f"- Missing prompt audit metadata: {', '.join(missing_prompt_audits)}")


async def _load_recent_projects(candidate_pool: int) -> list[Project]:
    async with async_session() as session:
        result = await session.execute(
            select(Project)
            .options(selectinload(Project.scenes).selectinload(Scene.assets))
            .order_by(Project.created_at.desc())
            .limit(candidate_pool)
        )
        return [
            project
            for project in result.scalars().all()
            if project.scenes
        ]


async def main() -> int:
    parser = argparse.ArgumentParser(description="Audit recent projects for story-quality metadata coverage.")
    parser.add_argument("--sample-size", type=int, default=5, help="How many recent projects to audit.")
    parser.add_argument(
        "--candidate-pool",
        type=int,
        default=30,
        help="How many recent projects to scan before picking a diverse sample.",
    )
    parser.add_argument("--json", action="store_true", help="Print the report as JSON.")
    parser.add_argument(
        "--fail-on-gaps",
        action="store_true",
        help="Exit with code 2 if any selected project is missing story metadata coverage.",
    )
    args = parser.parse_args()

    try:
        projects = await _load_recent_projects(max(args.sample_size, args.candidate_pool))
    except (SQLAlchemyError, OSError) as exc:
        print("Failed to connect to the configured database.")
        print("Start the project database or update the backend database configuration, then rerun this script.")
        print(f"Details: {exc.__class__.__name__}: {exc}")
        return 1
    selected = _pick_recent_diverse_projects(projects, args.sample_size)
    if not selected:
        print("No recent projects with scenes were found.")
        return 1

    project_audits = [_audit_project(project) for project in selected]
    summary = _build_summary(project_audits)
    payload = {
        "summary": summary,
        "projects": [asdict(project) for project in project_audits],
    }

    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        _print_human_report(project_audits, summary)

    if args.fail_on_gaps:
        has_gap = any(
            not project.story_brief_present
            or not project.quality_report_present
            or project.scenes_with_role_metadata < project.scene_count
            for project in project_audits
        )
        if has_gap:
            return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
