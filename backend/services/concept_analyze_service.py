from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from backend.services.ai_client import chat_completion

logger = logging.getLogger(__name__)


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


def _parse_llm_json(raw: str) -> dict[str, Any]:
    cleaned = _strip_code_fence(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(cleaned[start:end])
        raise ValueError("Failed to parse JSON from LLM response") from None


async def analyze_concept(
    *,
    title: str,
    story_type: str,
    niche: str | None,
    llm_provider: str,
    llm_model: str | None,
) -> list[dict[str, Any]]:
    """Return 3 hook variations with engagement score and rationale."""
    niche_line = f"Niche/audience: {niche.strip()}\n" if niche and niche.strip() else ""
    prompt = f"""You help creators improve short-form video hooks for viral potential.

Title/concept (user input):
{title.strip()}

Story type: {story_type}
{niche_line}
Respond with ONLY valid JSON:
{{
  "suggestions": [
    {{
      "id": "string-uuid",
      "hook": "Rewritten hook line (one punchy sentence)",
      "engagement_score": 0-100,
      "rationale": "1-2 sentences: why this pattern works for shorts"
    }}
  ]
}}

Generate exactly 3 suggestions with distinct angles (curiosity, controversy, empathy, urgency)."""

    raw = await chat_completion(
        messages=[{"role": "user", "content": prompt}],
        provider=llm_provider,
        model=llm_model,
        temperature=0.85,
    )
    data = _parse_llm_json(raw)
    suggestions = data.get("suggestions")
    if not isinstance(suggestions, list):
        raise ValueError("Invalid suggestions shape")
    out: list[dict[str, Any]] = []
    for item in suggestions[:3]:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id") or "").strip() or str(uuid.uuid4())
        hook = str(item.get("hook") or "").strip()
        if not hook:
            continue
        try:
            score = int(float(item.get("engagement_score", 0)))
        except (TypeError, ValueError):
            score = 50
        score = max(0, min(100, score))
        rationale = str(item.get("rationale") or "").strip() or "Pattern tuned for short-form retention."
        out.append(
            {
                "id": sid,
                "hook": hook,
                "engagement_score": score,
                "rationale": rationale,
            }
        )
    if len(out) < 1:
        raise ValueError("LLM returned no usable suggestions")
    return out
