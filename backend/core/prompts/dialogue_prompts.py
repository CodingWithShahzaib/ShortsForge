from __future__ import annotations

import hashlib

from backend.schemas.characters import CharacterConfig

CHARACTER_PROMPT_TEMPLATES = {
    "comic_book": {
        "base": 'Comic book illustration of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "bold black outlines, dramatic shading, graphic novel style, "
            "political cartoon aesthetic, consistent character design"
        ),
        "negative": "photorealistic, photograph, 3d render, soft lighting, blurry",
    },
    "political_cartoon": {
        "base": 'Political cartoon illustration of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "editorial cartoon styling, inked contours, exaggerated expressions, "
            "high-contrast shading, consistent outfit and face"
        ),
        "negative": "photorealistic, 3d render, blurry, soft watercolor",
    },
    "graphic_novel": {
        "base": 'Graphic novel panel of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "cinematic comic art, bold line weight, dramatic shadows, halftone-ready texture, "
            "consistent character design"
        ),
        "negative": "photograph, 3d render, soft focus, pastel watercolor",
    },
    "anime": {
        "base": 'Anime keyframe of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "clean cel shading, expressive eyes, crisp linework, stylized hair shapes, "
            "dramatic anime framing, consistent character design"
        ),
        "negative": "photorealistic, muddy textures, painterly blur, low-detail face",
    },
    "photorealistic": {
        "base": 'Photorealistic film still of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "lifelike skin texture, natural facial proportions, wardrobe realism, subtle depth of field, "
            "consistent character design"
        ),
        "negative": "cartoon stylization, cel shading, exaggerated anatomy, painterly brush strokes",
    },
    "documentary": {
        "base": 'Documentary frame of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "observational realism, natural available light, authentic wardrobe texture, handheld reportage energy, "
            "consistent character design"
        ),
        "negative": "comic-book outlines, fantasy stylization, glossy fashion lighting, exaggerated colors",
    },
    "cinematic": {
        "base": 'Cinematic story frame of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "dramatic lighting, shallow depth of field, rich color contrast, premium film still composition, "
            "consistent character design"
        ),
        "negative": "flat lighting, low contrast, cartoon exaggeration, muddy details",
    },
    "cinematic_noir": {
        "base": 'Neo-noir cinematic frame of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "moody contrast, selective rim lighting, deep shadows, glossy rain-slick atmosphere, "
            "consistent character design"
        ),
        "negative": "bright pastel palette, flat midday light, cartoon simplification, washed blacks",
    },
    "epic_blockbuster": {
        "base": 'Epic blockbuster frame of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "heroic scale, dramatic backlight, premium action-movie composition, atmospheric depth, "
            "consistent character design"
        ),
        "negative": "flat staging, low detail, casual snapshot framing, weak contrast",
    },
    "watercolor": {
        "base": 'Watercolor illustration of {name}, {description}, {shot_type} shot, {action_context}',
        "style_suffix": (
            "soft pigment blooms, textured paper grain, airy edges, layered transparent washes, "
            "consistent character design"
        ),
        "negative": "photorealistic, hard 3d surfaces, neon oversaturation, heavy ink outlines",
    },
}


SHOT_TYPE_DIRECTION = {
    "closeup": (
        "emphasize micro-expressions, intense eye contact, skin or ink detail on the face, "
        "and a softly active background with strong subject separation"
    ),
    "medium": (
        "show expressive hands, torso posture, and readable interaction with nearby props or set dressing"
    ),
    "two-shot": (
        "stage both characters with clear relationship blocking, contrasting body language, and layered depth between them"
    ),
    "reaction": (
        "capture a vivid reaction beat with strong facial change, body tension, and cinematic pause energy"
    ),
}

ACTION_BEATS = (
    "caught mid-sentence while gesturing with expressive hands",
    "leaning forward into the moment with visible conversational intensity",
    "turning slightly as if reacting to a new realization",
    "holding a tense pause with emotion visible through posture and breath",
    "speaking while interacting with nearby props that support the story beat",
    "frozen in a charged in-between moment rather than a posed portrait",
)

ENVIRONMENT_DETAILS = (
    "inside a richly detailed newsroom with glowing monitors, scattered notes, and layered background activity",
    "in a rain-soaked city setting with reflective surfaces, distant headlights, and atmospheric depth",
    "inside a tense investigation room filled with files, maps, screens, and story-relevant objects",
    "in a lived-in interior with specific furniture, texture, clutter, and signs of recent action",
    "against a dramatic urban backdrop with practical lights, passing silhouettes, and environmental storytelling",
    "inside a cinematic story world with architecture, props, and set dressing tailored to the spoken line",
)

LIGHTING_RECIPES = (
    "dramatic side lighting with motivated practical light sources and textured shadow falloff",
    "moody backlight and rim light separating the character from a detailed environment",
    "high-contrast cinematic lighting with depth haze and strong foreground-to-background separation",
    "story-driven lighting that emphasizes facial planes, wardrobe texture, and environmental detail",
    "dynamic mixed lighting from screens, windows, or street glow that makes the frame feel active",
)

COMPOSITION_RECIPES = (
    "compose the frame like a cinematic key moment with foreground framing elements and a clear focal path",
    "use an off-center composition with negative space that heightens tension and directs the eye",
    "stage the character within a layered vertical frame built for short-form video readability",
    "use perspective lines, prop placement, and depth overlap to create a strong sense of place",
    "frame the shot like an in-progress scene with believable asymmetry instead of a centered portrait",
)

SCENE_VARIATION_DETAILS = (
    "use a richly dressed environment with specific architecture, props, and texture variation",
    "include atmospheric motion cues like drifting dust, rain streaks, steam, moving light, or passing silhouettes where appropriate",
    "build three clear depth planes: a readable foreground, a story-active midground, and a detailed background",
    "avoid plain walls, blank backdrops, static studio framing, or repeated generic compositions",
)


def _dialogue_excerpt(dialogue_line: str) -> str:
    return (
        f'{dialogue_line[:50]}...'
        if len(dialogue_line) > 50
        else dialogue_line
    )


def _seeded_choice(options: tuple[str, ...], *parts: str) -> str:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    index = int(digest[:8], 16) % len(options)
    return options[index]


def _infer_dialogue_energy(dialogue_line: str) -> tuple[str, str, str]:
    line = (dialogue_line or "").strip().lower()
    if any(token in line for token in ("?", "why", "how", "really", "are you sure")):
        return (
            "skeptical curiosity",
            "raised brow, focused eyes, alert listening posture",
            "leaning in slightly as if pressing for an answer",
        )
    if any(token in line for token in ("!", "run", "now", "hurry", "quick", "before")):
        return (
            "urgent intensity",
            "wide eyes, tense jaw, high emotional charge",
            "dynamic forward motion, shoulders engaged, caught mid-beat",
        )
    if any(token in line for token in ("no", "don't", "do not", "can't", "won't", "never", "stop")):
        return (
            "defiant tension",
            "tight mouth, sharp stare, visible resistance in the face",
            "guarded stance, restrained but forceful body language",
        )
    if any(token in line for token in ("sorry", "please", "help", "miss", "lost")):
        return (
            "vulnerable emotion",
            "softened eyes, conflicted expression, emotional nuance",
            "hesitant gesture, protective posture, human fragility",
        )
    return (
        "confident conversational energy",
        "alive, expressive face with clear emotion tied to the line",
        "natural speaking gesture, believable weight shift, engaged posture",
    )


def _infer_visual_action(dialogue_line: str) -> str:
    line = (dialogue_line or "").strip().lower()
    if any(token in line for token in ("why", "how", "what", "?")):
        return "challenging someone, questioning the moment, or demanding clarity"
    if any(token in line for token in ("run", "hurry", "now", "before", "quick")):
        return "caught in an urgent turning point with motion and escalating stakes"
    if any(token in line for token in ("no", "don't", "do not", "stop", "never")):
        return "pushing back against someone with visible resistance and emotional force"
    if any(token in line for token in ("look", "listen", "remember", "think", "understand")):
        return "making an important point with persuasive emphasis and grounded authority"
    if any(token in line for token in ("sorry", "please", "help", "miss", "lost")):
        return "revealing emotional vulnerability during a fragile, human beat"
    return "delivering a meaningful line during an active story moment"


def _build_scene_recipe(character_name: str, dialogue_line: str, shot_type: str) -> tuple[str, str, str, str, str]:
    seed_parts = (character_name, dialogue_line, shot_type)
    return (
        _seeded_choice(ACTION_BEATS, "action", *seed_parts),
        _seeded_choice(ENVIRONMENT_DETAILS, "environment", *seed_parts),
        _seeded_choice(LIGHTING_RECIPES, "lighting", *seed_parts),
        _seeded_choice(COMPOSITION_RECIPES, "composition", *seed_parts),
        _seeded_choice(SCENE_VARIATION_DETAILS, "variation", *seed_parts),
    )


def build_dialogue_scene_prompt(
    character: CharacterConfig,
    dialogue_line: str,
    shot_type: str,
    preset: str = "comic_book",
) -> str:
    template = CHARACTER_PROMPT_TEMPLATES.get(preset, CHARACTER_PROMPT_TEMPLATES["comic_book"])
    excerpt = _dialogue_excerpt(dialogue_line)
    emotional_tone, facial_expression, body_language = _infer_dialogue_energy(dialogue_line)
    visual_action = _infer_visual_action(dialogue_line)
    shot_direction = SHOT_TYPE_DIRECTION.get(
        shot_type,
        "use cinematic framing with expressive posture and readable environmental storytelling",
    )
    action_beat, environment_detail, lighting_recipe, composition_recipe, scene_variation = (
        _build_scene_recipe(character.name, dialogue_line, shot_type)
    )
    action_context = (
        f'speaking: "{excerpt}", emotional tone: {emotional_tone}, '
        f"facial expression: {facial_expression}, body language: {body_language}, "
        f"visual action: {visual_action}"
    )
    base = template["base"].format(
        name=character.name,
        description=character.description,
        shot_type=shot_type,
        action_context=action_context,
    )
    return (
        f"{base}, {character.style_prompt}, {template['style_suffix']}, "
        f"{shot_direction}, action beat: {action_beat}, environment: {environment_detail}, "
        f"lighting: {lighting_recipe}, composition: {composition_recipe}, {scene_variation}, "
        "create a highly detailed, story-specific scene around the character with cinematic lighting, "
        "layered environment storytelling, rich textures, realistic depth, and props that reinforce the spoken line, "
        "show the character doing something visually readable instead of simply standing and speaking, "
        "make the frame feel alive and in-progress rather than posed, "
        "ensure the background is unique, detailed, and context-aware instead of generic"
    )
