"""
Database engine bootstrap.

Default: SQLite at backend/.tmp/rule1.db (zero-ops local persistence).
Override with DATABASE_URL=postgresql://... for production Postgres.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine

load_dotenv()

logger = logging.getLogger(__name__)

_TMP = Path(__file__).resolve().parent.parent / ".tmp"
_TMP.mkdir(parents=True, exist_ok=True)

_DEFAULT_SQLITE = f"sqlite:///{(_TMP / 'rule1.db').as_posix()}"
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()

# Treat placeholder / missing Postgres as SQLite so the app boots without Docker.
_PLACEHOLDER = (
    not DATABASE_URL
    or "user:password@localhost" in DATABASE_URL
    or DATABASE_URL.startswith("postgresql://user:password")
)
if _PLACEHOLDER:
    DATABASE_URL = _DEFAULT_SQLITE
    logger.info(f"[DB] Using SQLite at {_TMP / 'rule1.db'}")
else:
    logger.info(f"[DB] Using DATABASE_URL dialect={DATABASE_URL.split(':', 1)[0]}")

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=_connect_args)


def create_db_and_tables() -> None:
    # Import models so metadata is registered
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    logger.info("[DB] Tables ready")


def get_session():
    with Session(engine) as session:
        yield session


def session_scope() -> Session:
    return Session(engine)
