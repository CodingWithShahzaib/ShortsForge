from __future__ import annotations

from dataclasses import dataclass, asdict

from backend.services.story_structure import resolve_story_profile


@dataclass(frozen=True)
class VisualAudioProfile:
    lighting: str
    color_grade: str
    camera_movement: str
    insert_types: tuple[str, ...]
    transition_style: str
    music_style: str
    tension_curve: str
    sfx_prominence: str
    silence_usage: str


VISUAL_AUDIO_PROFILES: dict[str, VisualAudioProfile] = {
    "general": VisualAudioProfile(
        lighting="balanced key lighting with readable contrast",
        color_grade="clean cinematic neutral grade",
        camera_movement="gentle push or pan when the beat intensifies",
        insert_types=("detail", "environment", "reaction"),
        transition_style="clean cut or dissolve based on energy",
        music_style="light pulse or minimal underscore",
        tension_curve="steady build",
        sfx_prominence="medium",
        silence_usage="sparingly before key lines",
    ),
    "horror": VisualAudioProfile(
        lighting="low-key contrast with practical light sources and shadow falloff",
        color_grade="desaturated cool tones with selective harsh highlights",
        camera_movement="slow push-in or unsettling locked-off framing",
        insert_types=("shadow", "screen", "hand detail", "reaction"),
        transition_style="hard cut, whip, or glitch when the beat spikes",
        music_style="dark ambient",
        tension_curve="escalating",
        sfx_prominence="high",
        silence_usage="deliberate pauses before the scare or reveal",
    ),
    "mystery": VisualAudioProfile(
        lighting="moody contrast with evidence-friendly focus lighting",
        color_grade="cool neutral with spotlighted points of interest",
        camera_movement="measured push or lateral drift to reveal clues",
        insert_types=("document", "clue", "screen", "reaction"),
        transition_style="cut or dissolve timed to new clues",
        music_style="tense investigative pulse",
        tension_curve="rising curiosity",
        sfx_prominence="medium",
        silence_usage="brief pauses before contradictions or twists",
    ),
    "motivational": VisualAudioProfile(
        lighting="bright contrast that lifts toward the ending",
        color_grade="warm saturation with hopeful highlights",
        camera_movement="dynamic but readable motion that tracks progress",
        insert_types=("action", "symbolic", "before_after", "close detail"),
        transition_style="smooth slide or energizing cut",
        music_style="uplifting pulse",
        tension_curve="build then release",
        sfx_prominence="low",
        silence_usage="rare, mostly to emphasize the final line",
    ),
    "explainer": VisualAudioProfile(
        lighting="clear evenly motivated lighting with readable subject separation",
        color_grade="neutral documentary grade",
        camera_movement="stable framing with occasional purposeful pan",
        insert_types=("diagram", "screen", "graphic", "detail"),
        transition_style="clean cut or dissolve for clarity",
        music_style="minimal modern underscore",
        tension_curve="steady informative pace",
        sfx_prominence="low",
        silence_usage="rare",
    ),
    "news": VisualAudioProfile(
        lighting="even key light with realistic newsroom or field contrast",
        color_grade="neutral high-clarity grade",
        camera_movement="mostly stable with occasional urgency-driven push",
        insert_types=("headline", "b_roll", "graphic", "document"),
        transition_style="hard cut or restrained dissolve",
        music_style="subtle pulse",
        tension_curve="steady urgency",
        sfx_prominence="low",
        silence_usage="short pauses before the implication or CTA",
    ),
    "listicle": VisualAudioProfile(
        lighting="high-contrast readable setups that change between beats",
        color_grade="vivid contrast for fast scrolling attention",
        camera_movement="snappy cut-driven motion cues",
        insert_types=("numbered object", "detail", "reaction", "proof insert"),
        transition_style="quick cut, slide, or punchy zoom",
        music_style="up-tempo rhythmic bed",
        tension_curve="stacked beats",
        sfx_prominence="medium",
        silence_usage="rare",
    ),
    "storytelling": VisualAudioProfile(
        lighting="cinematic scene-motivated light with emotional shifts",
        color_grade="grounded cinematic grade tuned to the turn",
        camera_movement="scene-driven motion that emphasizes the turning point",
        insert_types=("reaction", "environment", "prop detail", "memory insert"),
        transition_style="motivated cut or dissolve based on time shift",
        music_style="subtle narrative underscore",
        tension_curve="setup to turn to payoff",
        sfx_prominence="medium",
        silence_usage="use before the turn or final reveal",
    ),
    "reflective": VisualAudioProfile(
        lighting="soft naturalistic lighting with thoughtful contrast",
        color_grade="muted warm or cool palette tied to the theme",
        camera_movement="gentle drift or stable contemplative framing",
        insert_types=("symbolic", "landscape", "close detail"),
        transition_style="soft dissolve or patient cut",
        music_style="ambient minimal",
        tension_curve="slow build",
        sfx_prominence="low",
        silence_usage="used to let the insight land",
    ),
}


def resolve_visual_audio_profile(
    story_type: str | None,
    story_template: str | None = None,
) -> dict[str, object]:
    profile = resolve_story_profile(story_type, story_template)
    resolved = VISUAL_AUDIO_PROFILES.get(profile.id, VISUAL_AUDIO_PROFILES["general"])
    return {"profile_id": profile.id, **asdict(resolved)}


__all__ = ["VISUAL_AUDIO_PROFILES", "VisualAudioProfile", "resolve_visual_audio_profile"]
