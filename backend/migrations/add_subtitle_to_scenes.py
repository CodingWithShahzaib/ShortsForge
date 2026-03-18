"""
Migration: Add subtitle column to scenes table.
Run with: python -m backend.migrations.add_subtitle_to_scenes
"""
from __future__ import annotations

import asyncio
import os
import sys

# Ensure project root is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


async def migrate():
    from sqlalchemy import text
    from backend.database import engine

    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE scenes ADD COLUMN subtitle TEXT"))
            print("Added subtitle column to scenes table.")
        except Exception as e:
            err = str(e).lower()
            if "duplicate column" in err or "already exists" in err:
                print("Column subtitle already exists, skipping.")
            else:
                raise


if __name__ == "__main__":
    asyncio.run(migrate())
