"""
Report export helpers — CSV + simple HTML digests.
"""
from __future__ import annotations

import csv
import html
import io
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional


def _fmt(n: Any) -> str:
    try:
        if n is None:
            return ""
        return f"{float(n):.2f}"
    except (TypeError, ValueError):
        return ""


def stocks_to_csv(rows: Iterable[Dict[str, Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "symbol",
            "company_name",
            "verdict",
            "price",
            "mos_price",
            "sticker_price",
            "moat_score",
            "signal",
            "payback_time",
            "sector",
            "score",
            "top_pattern",
            "confidence",
            "source",
        ]
    )
    for r in rows:
        ai = r.get("ai_analysis") or {}
        ta = r.get("technical_analysis") or {}
        md = r.get("market_data") or {}
        writer.writerow(
            [
                r.get("symbol", ""),
                r.get("company_name") or r.get("name") or r.get("short_name") or "",
                r.get("verdict", ""),
                _fmt(r.get("price") if r.get("price") is not None else r.get("current_price")),
                _fmt(r.get("mos_price") or r.get("mos")),
                _fmt(r.get("sticker_price") or r.get("sticker")),
                ai.get("moat_score") if "ai_analysis" in r else r.get("moat", ""),
                ta.get("signal") if "technical_analysis" in r else r.get("signal", ""),
                r.get("payback_time", ""),
                md.get("sector") if "market_data" in r else r.get("sector", ""),
                r.get("score", ""),
                r.get("topPattern") or r.get("top_pattern", ""),
                r.get("confidence", ""),
                r.get("source", ""),
            ]
        )
    return buf.getvalue()


def stocks_to_html(
    rows: List[Dict[str, Any]],
    *,
    title: str = "Rule #1 Report",
    subtitle: Optional[str] = None,
) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    subtitle = subtitle or f"Generated {now}"

    body_rows = []
    for r in rows:
        ai = r.get("ai_analysis") or {}
        ta = r.get("technical_analysis") or {}
        md = r.get("market_data") or {}
        verdict = html.escape(str(r.get("verdict") or ""))
        sym = html.escape(str(r.get("symbol") or ""))
        name = html.escape(str(r.get("company_name") or r.get("name") or ""))
        price = _fmt(r.get("price") if r.get("price") is not None else r.get("current_price"))
        mos = _fmt(r.get("mos_price") or r.get("mos"))
        sticker = _fmt(r.get("sticker_price") or r.get("sticker"))
        moat = ai.get("moat_score") if "ai_analysis" in r else r.get("moat", "")
        signal = ta.get("signal") if "technical_analysis" in r else r.get("signal", "")
        sector = html.escape(str(md.get("sector") if "market_data" in r else r.get("sector") or ""))
        score = r.get("score", "")
        pattern = html.escape(str(r.get("topPattern") or r.get("top_pattern") or ""))
        source = html.escape(str(r.get("source") or ""))

        body_rows.append(
            "<tr>"
            f"<td>{sym}</td><td>{name}</td><td>{verdict}</td>"
            f"<td class='num'>{price}</td><td class='num'>{mos}</td><td class='num'>{sticker}</td>"
            f"<td class='num'>{moat}</td><td>{html.escape(str(signal or ''))}</td>"
            f"<td>{sector}</td><td class='num'>{score}</td><td>{pattern}</td><td>{source}</td>"
            "</tr>"
        )

    return f"""<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>{html.escape(title)}</title>
<style>
  body {{ font-family: Segoe UI, Heebo, Arial, sans-serif; background:#0b0b0f; color:#e8e8ed; margin:24px; }}
  h1 {{ font-size:22px; margin:0 0 4px; }}
  .sub {{ color:#9a9aa8; font-size:13px; margin-bottom:18px; }}
  table {{ width:100%; border-collapse:collapse; font-size:12px; }}
  th, td {{ border-bottom:1px solid #22232b; padding:8px 10px; text-align:right; }}
  th {{ color:#9a9aa8; font-weight:600; position:sticky; top:0; background:#0b0b0f; }}
  td.num {{ font-family: ui-monospace, Consolas, monospace; }}
  tr:hover td {{ background:#14141c; }}
</style>
</head>
<body>
  <h1>{html.escape(title)}</h1>
  <div class="sub">{html.escape(subtitle)} · {len(rows)} items</div>
  <table>
    <thead>
      <tr>
        <th>סימול</th><th>שם</th><th>Verdict</th><th>מחיר</th><th>MOS</th><th>Sticker</th>
        <th>Moat</th><th>Signal</th><th>סקטור</th><th>Score</th><th>תבנית</th><th>מקור</th>
      </tr>
    </thead>
    <tbody>
      {''.join(body_rows) if body_rows else '<tr><td colspan="12">אין נתונים</td></tr>'}
    </tbody>
  </table>
</body>
</html>
"""
