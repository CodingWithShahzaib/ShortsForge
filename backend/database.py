from __future__ import annotations

import asyncio
import logging

from sqlalchemy import event
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


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:  # type: ignore[misc]
    async with async_session() as session:
        yield session
