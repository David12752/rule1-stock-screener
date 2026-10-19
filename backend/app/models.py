"""
SQLModel schema — works with SQLite (local default) and PostgreSQL.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import Column, JSON, Text
from sqlmodel import Field, SQLModel


class Ticker(SQLModel, table=True):
    symbol: str = Field(primary_key=True, index=True, max_length=32)
    company_name: Optional[str] = None
    sector: Optional[str] = None
    exchange: Optional[str] = None
    universe: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AnalysisResult(SQLModel, table=True):
    """Latest Rule #1 analysis snapshot per symbol."""

    id: Optional[int] = Field(default=None, primary_key=True)
    symbol: str = Field(index=True, max_length=32)
    verdict: Optional[str] = Field(default=None, index=True, max_length=32)
    moat_score: int = 0
    moat_type: Optional[str] = None
    sticker_price: float = 0.0
    mos_price: float = 0.0
    price: float = 0.0
    analysis_data: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    last_analyzed: datetime = Field(default_factory=datetime.utcnow, index=True)


class ScanArchive(SQLModel, table=True):
    """Archived scan / catalog runs (library, pattern, candidates export)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str = Field(index=True, max_length=32)  # library | pattern | candidates
    universe: Optional[str] = Field(default=None, max_length=64)
    title: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    payload: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
