# ShortsForge Video Quality Milestones

Last updated: 2026-03-31

## Milestones

| Milestone | Status | Scope |
| --- | --- | --- |
| Phase 1A | `done` | Tracker, schema foundation, subtitle readability, Ken Burns, safe zones |
| Phase 1B | `done` | Negative prompts for image generation and deterministic metadata |
| Phase 2 | `done` | Scene regeneration, manual uploads, Studio controls |
| Phase 3 | `done` | Settings UX, transitions, audio ducking, overlays |
| Phase 4 | `done` | Hook optimization, duration splitting, narrative flow, consistency guardrails |

## Detailed Checklist

### Phase 1

- [ ] Create tracker and keep append-only changelog entries for each implementation pass
- [x] Add dedicated persistence for project video settings and scene asset overrides
- [x] Improve subtitle readability with box, shadow, and safe-zone-aware placement
- [x] Add configurable Ken Burns motion for still-image clips
- [x] Add safe zone preset API and frontend preview surface
- [x] Add provider-aware negative prompts and deterministic image metadata

### Phase 2

- [x] Add explicit scene regeneration modes: image, audio, both
- [x] Add generic scene asset upload endpoint for image, audio, and video
- [x] Preserve manual override intent and expose it to Studio
- [x] Add Studio regeneration controls and upload preview flow
- [x] Add per-scene/global transition selection enhancements

### Phase 3

- [x] Add audio ducking during narration
- [x] Add film grain and vignette overlays
- [x] Add settings endpoints for video style, subtitles, audio, and safe zones
- [x] Expand settings page for video style, subtitle, and audio defaults

### Phase 4

- [x] Add hook quality analysis and alternative suggestion generation
- [x] Enforce scene duration min/max and auto-splitting for long narration
- [x] Add narrative bridge generation between weak topic transitions
- [x] Add character consistency and public-figure avoidance guardrails
- [x] Add word-pop subtitle animation and glitch transition polish

## Decision Log

- 2026-03-31: Use dedicated DB tables now for project video settings and scene asset overrides, but continue mirroring effective values into `Project.settings` so old flows remain compatible.
- 2026-03-31: Keep compile compatibility by resolving effective settings through a shared helper instead of forcing all callers to know about the new tables immediately.
- 2026-03-31: Separate intra-scene still-image motion from inter-scene transitions; Ken Burns should no longer depend on `transition_type`.

## Changelog

### 2026-03-31

- Created milestone tracker with phase breakdown, decision log, and validation log sections.
- Began persistence and rendering foundation work for video-style, subtitle, audio, and override settings.
- Added dedicated `ProjectVideoSettings` and `SceneAssetOverride` models plus typed backend/frontend contracts.
- Added app-level settings endpoints for video style, subtitles, audio, and safe-zone presets.
- Separated still-image motion from clip transitions, added Ken Burns controls, safer subtitle placement, film grain/vignette overlays, and audio ducking hooks.
- Added scene regeneration modes, generic scene asset upload support, project/scene override endpoints, and Studio safe-zone/upload/regeneration controls.
- Added provider-aware negative prompt shaping, manual override state syncing, hook suggestions, pacing enforcement, and public-figure avoidance guidance in storyboard/image prompts.
- Replaced hardcoded storyboard hook/bridge term matching with dynamic script-based analysis and optional AI-provided `bridge_line` handling.
- Replaced the remaining local hook heuristic with AI-evaluated opening analysis so hook suggestions and weakness detection are driven by the generated script itself.

## Validation Log

### 2026-03-31

- Backend targeted unit tests:
  `python -m unittest backend.tests.test_generation_validation backend.tests.test_generation_plan backend.tests.test_compile_stage backend.tests.test_assets_stage backend.tests.test_image_prompt_enhancement backend.tests.test_settings_validation backend.tests.test_scene_narration_guard backend.tests.test_scene_pacing_timing backend.tests.test_pipeline_stage_resolution`
  Result: `OK` (45 tests).
- Frontend repo-wide lint:
  `npm run lint`
  Result: fails because of many existing repo-wide issues unrelated to this milestone set, including long-standing `no-explicit-any` and React hook warnings/errors in untouched files.

## Open Blockers

- Frontend repo-wide lint is not clean yet; current failure set is dominated by pre-existing issues outside the milestone files.
