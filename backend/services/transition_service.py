from __future__ import annotations


AVAILABLE_TRANSITIONS = {
    "fade": "Classic fade to black and back",
    "fade_in_fade_out": "Alternates fade-out/fade-in accents between scene boundaries",
    "zoom_in_zoom_out": "Alternates zoom-in and zoom-out motion between scenes",
    "dissolve": "Smooth cross-dissolve between scenes",
    "wipeleft": "Wipe from right to left",
    "wiperight": "Wipe from left to right",
    "wipeup": "Wipe from bottom to top",
    "wipedown": "Wipe from top to bottom",
    "slideup": "Slide up transition",
    "slidedown": "Slide down transition",
    "slideleft": "Slide left transition",
    "slideright": "Slide right transition",
    "crossfade": "Crossfade between clips",
    "glitch": "Glitch-style cut accent (falls back to fade if unavailable)",
    "circleopen": "Circle opening reveal",
    "circleclose": "Circle closing transition",
    "zoom_in": "Ken Burns zoom in effect on image",
    "zoom_out": "Ken Burns zoom out effect on image",
    "pan_left": "Horizontal pan from right to left",
    "pan_right": "Horizontal pan from left to right",
    "pan_up": "Vertical pan from bottom to top",
    "pan_down": "Vertical pan from top to bottom",
    "none": "Hard cut with no blend",
}


def list_transitions() -> list[dict[str, str]]:
    custom_names = {
        "fade_in_fade_out": "Fade In / Fade Out",
        "zoom_in_zoom_out": "Zoom In / Zoom Out",
    }
    return [
        {
            "id": k,
            "name": custom_names.get(k, k.replace("_", " ").title()),
            "description": v,
        }
        for k, v in AVAILABLE_TRANSITIONS.items()
    ]
