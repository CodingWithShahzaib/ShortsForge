from __future__ import annotations

import asyncio
import logging

from sqlalchemy import event, inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# SQLite: longer timeout for lock contention; NullPool avoids pool-level locking; WAL reduces contention
connect_args = {}
engine_kw: dict = {"echo": False, "pool_pre_ping": True}
if "sqlite" in settings.database_url:
    connect_args["timeout"] = 60  # seconds to wait for lock
    engine_kw["poolclass"] = NullPool  # one connection per session, no pool contention
else:
    # Enable sane pooling defaults for Postgres/MySQL/etc.
    engine_kw["pool_size"] = settings.db_pool_size
    engine_kw["max_overflow"] = settings.db_max_overflow
    engine_kw["pool_timeout"] = settings.db_pool_timeout

engine = create_async_engine(
    settings.database_url,
    connect_args=connect_args,
    **engine_kw,
)


class RetryAsyncSession(AsyncSession):
    """AsyncSession that retries commit on SQLite 'database is locked' errors."""

    async def commit(self) -> None:
        last_err: Exception | None = None
        for attempt in range(5):
            try:
                return await super().commit()
            except OperationalError as e:
                last_err = e
                err_str = str(getattr(e, "orig", e)).lower()
                if "locked" in err_str or "busy" in err_str:
                    await self.rollback()
                    if attempt < 4:
                        delay = 0.05 * (2**attempt)
                        logger.debug("Database locked, retry %d/5 in %.2fs", attempt + 1, delay)
                        await asyncio.sleep(delay)
                        continue
                raise
        if last_err:
            raise last_err

    async def flush(self, objects=None) -> None:
        """Retry flush on SQLite lock/busy errors to keep session usable."""
        last_err: Exception | None = None
        for attempt in range(5):
            try:
                return await super().flush(objects=objects)
            except OperationalError as e:
                last_err = e
                err_str = str(getattr(e, "orig", e)).lower()
                if "locked" in err_str or "busy" in err_str:
                    await self.rollback()
                    if attempt < 4:
                        delay = 0.05 * (2**attempt)
                        logger.debug("Database locked, retry %d/5 in %.2fs", attempt + 1, delay)
                        await asyncio.sleep(delay)
                        continue
                raise
        if last_err:
            raise last_err


async_session = async_sessionmaker(engine, class_=RetryAsyncSession, expire_on_commit=False)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    """Enable WAL mode and long busy timeout for better concurrent access."""
    if "sqlite" in settings.database_url:
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")  # 60s in ms
        cursor.execute("PRAGMA synchronous=NORMAL")  # WAL-safe, fewer fsyncs
        cursor.close()


class Base(DeclarativeBase):
    pass


def _widen_projects_title_for_postgresql(connection) -> None:
    """Existing DBs may have title VARCHAR(500); long prompts need TEXT."""
    if connection.dialect.name != "postgresql":
        return
    insp = inspect(connection)
    if "projects" not in insp.get_table_names():
        return
    connection.execute(
        text("ALTER TABLE projects ALTER COLUMN title TYPE TEXT USING title::text")
    )


def _ensure_scene_settings_column(connection) -> None:
    """Add scenes.scene_settings for existing DBs (create_all does not alter tables)."""
    dialect = connection.dialect.name
    if dialect == "sqlite":
        res = connection.execute(text("PRAGMA table_info(scenes)"))
        cols = [row[1] for row in res.fetchall()]
        if "scene_settings" not in cols:
            connection.execute(text("ALTER TABLE scenes ADD COLUMN scene_settings TEXT"))
    elif dialect == "postgresql":
        connection.execute(
            text("ALTER TABLE scenes ADD COLUMN IF NOT EXISTS scene_settings JSONB")
        )


def _ensure_projects_control_columns(connection) -> None:
    dialect = connection.dialect.name
    if dialect == "sqlite":
        res = connection.execute(text("PRAGMA table_info(projects)"))
        cols = [row[1] for row in res.fetchall()]
        if "control_mode" not in cols:
            connection.execute(
                text("ALTER TABLE projects ADD COLUMN control_mode VARCHAR(20) DEFAULT 'autopilot'")
            )
        if "version" not in cols:
            connection.execute(text("ALTER TABLE projects ADD COLUMN version INTEGER DEFAULT 1"))
    elif dialect == "postgresql":
        connection.execute(
            text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS control_mode VARCHAR(20) DEFAULT 'autopilot'")
        )
        connection.execute(
            text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1")
        )


def _ensure_scene_editor_columns(connection) -> None:
    dialect = connection.dialect.name
    if dialect == "sqlite":
        res = connection.execute(text("PRAGMA table_info(scenes)"))
        cols = [row[1] for row in res.fetchall()]
        if "is_locked" not in cols:
            connection.execute(text("ALTER TABLE scenes ADD COLUMN is_locked BOOLEAN DEFAULT 0"))
        if "user_notes" not in cols:
            connection.execute(text("ALTER TABLE scenes ADD COLUMN user_notes TEXT"))
        if "trim_start_sec" not in cols:
            connection.execute(text("ALTER TABLE scenes ADD COLUMN trim_start_sec FLOAT DEFAULT 0"))
        if "trim_end_sec" not in cols:
            connection.execute(text("ALTER TABLE scenes ADD COLUMN trim_end_sec FLOAT DEFAULT 0"))
    elif dialect == "postgresql":
        connection.execute(
            text("ALTER TABLE scenes ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false")
        )
        connection.execute(
            text("ALTER TABLE scenes ADD COLUMN IF NOT EXISTS user_notes TEXT")
        )
        connection.execute(
            text("ALTER TABLE scenes ADD COLUMN IF NOT EXISTS trim_start_sec DOUBLE PRECISION DEFAULT 0")
        )
        connection.execute(
            text("ALTER TABLE scenes ADD COLUMN IF NOT EXISTS trim_end_sec DOUBLE PRECISION DEFAULT 0")
        )


def _ensure_asset_extended_columns(connection) -> None:
    dialect = connection.dialect.name
    if dialect == "sqlite":
        res = connection.execute(text("PRAGMA table_info(assets)"))
        cols = [row[1] for row in res.fetchall()]
        if "source" not in cols:
            connection.execute(
                text("ALTER TABLE assets ADD COLUMN source VARCHAR(30) DEFAULT 'ai_generated'")
            )
        if "parent_asset_id" not in cols:
            connection.execute(text("ALTER TABLE assets ADD COLUMN parent_asset_id VARCHAR(32)"))
        if "is_active" not in cols:
            connection.execute(text("ALTER TABLE assets ADD COLUMN is_active BOOLEAN DEFAULT 1"))
    elif dialect == "postgresql":
        connection.execute(
            text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'ai_generated'")
        )
        connection.execute(
            text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS parent_asset_id VARCHAR(32)")
        )
        connection.execute(
            text("ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true")
        )


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_widen_projects_title_for_postgresql)
        await conn.run_sync(_ensure_scene_settings_column)
        await conn.run_sync(_ensure_projects_control_columns)
        await conn.run_sync(_ensure_scene_editor_columns)
        await conn.run_sync(_ensure_asset_extended_columns)


async def get_db() -> AsyncSession:  # type: ignore[misc]
    async with async_session() as session:
        yield session
