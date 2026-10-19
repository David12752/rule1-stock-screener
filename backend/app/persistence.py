"""
Persistence helpers for analyses + scan archives.
Graceful: never crash the request path if DB write fails.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlmodel import select

from app.database import session_scope
from app.models import AnalysisResult, ScanArchive, Ticker
from app.symbol_utils import normalize_yahoo_symbol, safe_float

logger = logging.getLogger(__name__)


def upsert_analysis(result: Dict[str, Any]) -> None:
    """Persist one Rule #1 analysis dict (from _analyze_ticker)."""
    try:
        symbol = normalize_yahoo_symbol(str(result.get("symbol", ""))) or str(
            result.get("symbol", "")
        ).upper()
        if not symbol:
            return

        with session_scope() as session:
            ticker = session.get(Ticker, symbol)
            if ticker is None:
                ticker = Ticker(symbol=symbol)
                session.add(ticker)
            ticker.company_name = result.get("company_name") or result.get("short_name")
            ticker.sector = result.get("sector") or (result.get("market_data") or {}).get("sector")
            ticker.updated_at = datetime.utcnow()

            existing = session.exec(
                select(AnalysisResult)
                .where(AnalysisResult.symbol == symbol)
                .order_by(AnalysisResult.last_analyzed.desc())
            ).first()

            ai = result.get("ai_analysis") or {}
            payload = {
                "verdict": result.get("verdict"),
                "moat_score": int(ai.get("moat_score") or 0),
                "moat_type": ai.get("moat_type"),
                "sticker_price": float(safe_float(result.get("sticker_price"), 0) or 0),
                "mos_price": float(safe_float(result.get("mos_price"), 0) or 0),
                "price": float(safe_float(result.get("price"), 0) or 0),
                "analysis_data": result,
                "last_analyzed": datetime.utcnow(),
            }

            if existing:
                for k, v in payload.items():
                    setattr(existing, k, v)
            else:
                session.add(AnalysisResult(symbol=symbol, **payload))

            session.commit()
    except Exception as exc:
        logger.warning(f"[Persist] upsert_analysis failed for {result.get('symbol')}: {exc}")


def archive_scan(
    kind: str,
    *,
    universe: Optional[str] = None,
    title: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
    notes: Optional[str] = None,
) -> Optional[int]:
    try:
        with session_scope() as session:
            row = ScanArchive(
                kind=kind,
                universe=universe,
                title=title,
                meta=meta or {},
                payload=payload or {},
                notes=notes,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return row.id
    except Exception as exc:
        logger.warning(f"[Persist] archive_scan({kind}) failed: {exc}")
        return None


def list_archives(kind: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    try:
        with session_scope() as session:
            stmt = select(ScanArchive).order_by(ScanArchive.created_at.desc()).limit(limit)
            if kind:
                stmt = (
                    select(ScanArchive)
                    .where(ScanArchive.kind == kind)
                    .order_by(ScanArchive.created_at.desc())
                    .limit(limit)
                )
            rows = session.exec(stmt).all()
            return [
                {
                    "id": r.id,
                    "kind": r.kind,
                    "universe": r.universe,
                    "title": r.title,
                    "meta": r.meta,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "notes": r.notes,
                    "item_count": (
                        len((r.payload or {}).get("stocks") or (r.payload or {}).get("results") or [])
                        if isinstance(r.payload, dict)
                        else 0
                    ),
                }
                for r in rows
            ]
    except Exception as exc:
        logger.warning(f"[Persist] list_archives failed: {exc}")
        return []


def get_archive(archive_id: int) -> Optional[Dict[str, Any]]:
    try:
        with session_scope() as session:
            r = session.get(ScanArchive, archive_id)
            if not r:
                return None
            return {
                "id": r.id,
                "kind": r.kind,
                "universe": r.universe,
                "title": r.title,
                "meta": r.meta,
                "payload": r.payload,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "notes": r.notes,
            }
    except Exception as exc:
        logger.warning(f"[Persist] get_archive failed: {exc}")
        return None


def list_latest_analyses(limit: int = 500, verdict: Optional[str] = None) -> List[Dict[str, Any]]:
    try:
        with session_scope() as session:
            stmt = select(AnalysisResult).order_by(AnalysisResult.last_analyzed.desc()).limit(limit)
            if verdict:
                stmt = (
                    select(AnalysisResult)
                    .where(AnalysisResult.verdict == verdict)
                    .order_by(AnalysisResult.last_analyzed.desc())
                    .limit(limit)
                )
            rows = session.exec(stmt).all()
            return [r.analysis_data for r in rows if r.analysis_data]
    except Exception as exc:
        logger.warning(f"[Persist] list_latest_analyses failed: {exc}")
        return []
