from __future__ import annotations


AVAILABLE_TRANSITIONS = {
    "fade": "Classic fade to black and back",
    "dissolve": "Smooth cross-dissolve between scenes",
    "wipeleft": "Wipe from right to left",
    "wiperight": "Wipe from left to right",
    "wipeup": "Wipe from bottom to top",
    "wipedown": "Wipe from top to bottom",
    "slideup": "Slide up transition",
    "slidedown": "Slide down transition",
    "slideleft": "Slide left transition",
    "slideright": "Slide right transition",
    "circleopen": "Circle opening reveal",
    "circleclose": "Circle closing transition",
    "zoom_in": "Ken Burns zoom in effect on image",
    "zoom_out": "Ken Burns zoom out effect on image",
    "pan_left": "Horizontal pan from right to left",
    "pan_right": "Horizontal pan from left to right",
    "pan_up": "Vertical pan from bottom to top",
    "pan_down": "Vertical pan from top to bottom",
    "none": "Soft blend at cuts (same as fade in export)",
}


def list_transitions() -> list[dict[str, str]]:
    return [{"id": k, "name": k.replace("_", " ").title(), "description": v}
            for k, v in AVAILABLE_TRANSITIONS.items()]
