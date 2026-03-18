from __future__ import annotations

import logging

from backend.services.ai_client import chat_completion

logger = logging.getLogger(__name__)


async def enhance_image_prompt(
    base_prompt: str,
    style: str = "realistic",
    context: str = "",
    llm_provider: str | None = None,
    llm_model: str | None = None,
) -> str:
    """Take a basic image prompt and enhance it for better image generation."""
    system_prompt = (
        f"You are an expert at writing prompts for AI image generation. "
        f"Enhance the given prompt to produce a stunning {style} image. "
        f"Add specific details about composition, lighting, camera angle, colors, "
        f"textures, and atmosphere. Keep it under 200 words. "
        f"Return ONLY the enhanced prompt, nothing else."
    )
    user_content = base_prompt
    if context:
        user_content += f"\n\nContext: {context}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    return await chat_completion(messages, llm_provider, llm_model, temperature=0.6, max_tokens=500)


async def generate_sora_prompt(
    scene_description: str,
    style: str = "cinematic",
    duration: str = "8",
    llm_provider: str | None = None,
    llm_model: str | None = None,
) -> str:
    """Generate an optimized prompt for Sora video generation."""
    system_prompt = (
        "You are an expert at writing prompts for OpenAI Sora video generation. "
        "Write a detailed prompt that describes shot type, subject, action, setting, "
        "lighting, camera movement, and mood. Be specific about motion and temporal changes. "
        f"The video will be {duration} seconds. Style: {style}. "
        "Return ONLY the prompt, nothing else."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": scene_description},
    ]
    return await chat_completion(messages, llm_provider, llm_model, temperature=0.7, max_tokens=300)
