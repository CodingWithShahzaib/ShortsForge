from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TimelinePlan:
    paced_durations: list[float]
    boundary_overlaps: list[float]
    scene_starts: list[float]


def build_timeline_plan(
    base_durations: list[float],
    transitions_between: list[str],
    inter_scene_pause_ms: int,
    transition_overlap_ms: int,
) -> TimelinePlan:
    if not base_durations:
        return TimelinePlan(paced_durations=[], boundary_overlaps=[], scene_starts=[])

    pause_sec = max(0.0, float(inter_scene_pause_ms) / 1000.0)
    requested_overlap = max(0.0, float(transition_overlap_ms) / 1000.0)

    paced = [max(0.5, float(d)) for d in base_durations]
    for i in range(len(paced) - 1):
        paced[i] += pause_sec

    overlaps: list[float] = []
    for i in range(len(paced) - 1):
        trans = str(transitions_between[i] if i < len(transitions_between) else "fade").strip().lower()
        if trans in {"none", "cut"}:
            overlaps.append(0.0)
            continue
        left = paced[i]
        right = paced[i + 1]
        safe_cap = max(0.001, min(left, right) * 0.35)
        overlaps.append(max(0.001, min(requested_overlap, safe_cap, 0.8)))

    starts = [0.0]
    for i in range(1, len(paced)):
        prev_duration = max(0.0, paced[i - 1])
        overlap = max(0.0, overlaps[i - 1]) if i - 1 < len(overlaps) else 0.0
        starts.append(starts[-1] + prev_duration - overlap)

    return TimelinePlan(
        paced_durations=paced,
        boundary_overlaps=overlaps,
        scene_starts=starts,
    )


__all__ = ["TimelinePlan", "build_timeline_plan"]
