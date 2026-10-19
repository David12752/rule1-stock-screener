import os
import json
import logging
import hashlib
import re
from typing import Dict, Any, Optional

import requests

logger = logging.getLogger(__name__)

# Process-local cache so reopening the same stock does not re-translate.
_TRANSLATE_CACHE: Dict[str, str] = {}
_TRANSLATE_CACHE_MAX = 512
_HEBREW_RE = re.compile(r"[\u0590-\u05FF]")


class AIAnalyzer:
    """
    AI-powered qualitative analysis using Google Gemini REST API.
    Uses direct HTTP calls to avoid the broken google-generativeai SDK on Python 3.13.
    """

    GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
    DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    def __init__(self, api_key: str, model: str | None = None):
        self.api_key = api_key
        self.model = model or self.DEFAULT_MODEL
        self.available = bool(api_key)
        if not self.available:
            logger.info("No GEMINI_API_KEY set. AI analysis will be disabled.")

    @property
    def endpoint(self) -> str:
        return f"{self.GEMINI_BASE}/{self.model}:generateContent"

    def _redact(self, text: str) -> str:
        """Strip the API key from anything headed for a log.

        The key used to be passed as a `?key=` query parameter, so requests'
        exception messages embedded it and every AI failure wrote a live
        credential into the log file.
        """
        if self.api_key:
            return text.replace(self.api_key, "<REDACTED>")
        return text

    def _default_result(self, reason: str = "AI unavailable") -> Dict[str, Any]:
        return {
            "moat_score": 0,
            "moat_type": "Unknown",
            "moat_analysis": reason,
            "management_integrity": False,
            "management_description": "N/A",
            "meaning_flag": False,
            "red_flags": [reason],
        }

    @staticmethod
    def looks_hebrew(text: str) -> bool:
        if not text:
            return False
        letters = [c for c in text if c.isalpha()]
        if not letters:
            return False
        he = sum(1 for c in letters if _HEBREW_RE.match(c))
        return (he / len(letters)) >= 0.25

    def _gemini_text(self, prompt: str, *, temperature: float = 0.2, timeout: int = 30) -> Optional[str]:
        if not self.available:
            return None
        try:
            response = requests.post(
                self.endpoint,
                headers={"x-goog-api-key": self.api_key},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": temperature},
                },
                timeout=timeout,
            )
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception as e:
            logger.warning(f"Gemini text call failed: {self._redact(str(e))}")
            return None

    def _mymemory_chunk(self, text: str) -> Optional[str]:
        """Free EN→HE fallback. MyMemory caps ~500 chars per request."""
        try:
            res = requests.get(
                "https://api.mymemory.translated.net/get",
                params={"q": text, "langpair": "en|he"},
                timeout=12,
            )
            res.raise_for_status()
            data = res.json()
            translated = (data.get("responseData") or {}).get("translatedText") or ""
            translated = translated.strip()
            # API echoes the source on quota / failure.
            if not translated or translated.lower() == text.strip().lower():
                return None
            return translated
        except Exception as e:
            logger.warning(f"MyMemory translate failed: {e}")
            return None

    def _mymemory_translate(self, text: str) -> Optional[str]:
        chunks: list[str] = []
        remaining = text.strip()
        while remaining:
            # Prefer sentence boundaries under the soft 450-char limit.
            if len(remaining) <= 450:
                piece, remaining = remaining, ""
            else:
                cut = remaining.rfind(". ", 0, 450)
                if cut < 120:
                    cut = remaining.rfind(" ", 0, 450)
                if cut < 120:
                    cut = 450
                piece, remaining = remaining[: cut + 1].strip(), remaining[cut + 1 :].strip()
            translated = self._mymemory_chunk(piece)
            if not translated:
                return None
            chunks.append(translated)
        return " ".join(chunks).strip() or None

    def translate_to_hebrew(self, text: str) -> str:
        """
        Translate English company copy to Hebrew.

        Prefers Gemini when the key works; falls back to MyMemory so the UI
        still gets Hebrew when Gemini returns 400.
        """
        raw = (text or "").strip()
        if not raw:
            return ""
        if self.looks_hebrew(raw):
            return raw

        cache_key = hashlib.sha1(raw.encode("utf-8")).hexdigest()
        cached = _TRANSLATE_CACHE.get(cache_key)
        if cached is not None:
            return cached

        translated: Optional[str] = None
        if self.available:
            prompt = (
                "תרגם לעברית תקנית וברורה את תיאור החברה הבא.\n"
                "שמור על משמעות עסקית מדויקת. אל תוסיף כותרות, הקדמות או הערות.\n"
                "החזר רק את הטקסט המתורגם.\n\n"
                f"{raw[:8000]}"
            )
            translated = self._gemini_text(prompt)

        if not translated or not self.looks_hebrew(translated):
            translated = self._mymemory_translate(raw)

        if not translated:
            translated = raw  # last resort: keep English rather than blank the panel

        if len(_TRANSLATE_CACHE) >= _TRANSLATE_CACHE_MAX:
            # Drop an arbitrary old entry; order is insertion-order in 3.7+.
            _TRANSLATE_CACHE.pop(next(iter(_TRANSLATE_CACHE)), None)
        _TRANSLATE_CACHE[cache_key] = translated
        return translated

    def analyze_moat_and_management(
        self,
        ticker: str,
        business_summary: str,
        risk_factors: str,
        earnings_transcript: str = "",
    ) -> Dict[str, Any]:
        """
        Analyze qualitative aspects using Gemini with strict Rule #1 criteria.
        Narrative fields are requested in Hebrew for the Hebrew UI.
        """
        if not self.available:
            return self._default_result("No GEMINI_API_KEY configured.")

        prompt = f"""
Role: You are a ruthless, cynical "Rule #1" Value Investor (like Charlie Munger). Your goal is to KILL THE DEAL.
Task: Analyze {ticker} using the provided text. Look for reasons to REJECT this company.

Input Data:
Business Summary: {business_summary[:8000]}
Risk Factors: {risk_factors[:4000]}
Earnings Call: {earnings_transcript[:4000]}

Analysis Framework:
1. MEANING: Can you explain the business in 1 simple sentence? Is it understandable?
2. MOAT: Does it *really* have a durable advantage? (Brand, Secret, Toll Bridge, Switching, Price). Be skeptical. Most companies have NO moat.
   - If it's a "Brand" moat, is it a commodity? (e.g. Ford has no moat, Coke does).
   - If it's "Price", is it the lowest cost producer?
3. MANAGEMENT: Are they candid? Do they own shares? (Infer from text).

Language: Write moat_analysis, management_description, and every red_flags item in Hebrew (עברית).
Keep moat_type in English enum values as specified.

Output (JSON only):
{{
  "moat_score": <Integer 1-10. 10=Monopoly, 1=Commodity/Fad. Be harsh. Default to 3.>,
  "moat_type": "<Brand|Secret|Toll Bridge|Switching|Price|None>",
  "moat_analysis": "<2-3 Hebrew sentences. Focus on why the moat might FAIL. Be cynical.>",
  "management_integrity": <true|false>,
  "management_description": "<1 Hebrew sentence on CEO candor/capital allocation.>",
  "meaning_flag": <true|false>,
  "red_flags": ["<סיכון בעברית 1>", "<סיכון בעברית 2>"]
}}
"""

        try:
            response = requests.post(
                self.endpoint,
                headers={"x-goog-api-key": self.api_key},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.3,
                        "responseMimeType": "application/json",
                    },
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()

            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            # Clean up potential markdown formatting
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            return json.loads(text.strip())

        except Exception as e:
            detail = self._redact(str(e))
            logger.error(f"AI Analysis Error for {ticker}: {detail}")
            return self._default_result(f"AI Service Error: {detail}")
