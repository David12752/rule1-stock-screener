# Verdict Decision Tree

## Inputs

| Input | Source | Type |
|---|---|---|
| `big5_pass` | All 5 CAGR metrics have `consistent_growth == True` | bool |
| `undervalued` | `price < mos_price` (50% margin of safety) | bool |
| `green_signal` | All 3 technical tools bullish simultaneously | bool |
| `moat_score` | AI analysis moat score (1-10) | int |

## Decision Logic

```
IF big5_pass AND undervalued AND green_signal:
    verdict = "BUY"
    reason  = "All Rule #1 criteria met: strong fundamentals, undervalued, technical confirmation"

ELIF big5_pass AND undervalued AND NOT green_signal:
    verdict = "WAIT"
    reason  = "Fundamentals strong and undervalued, but technical timing not confirmed"

ELIF big5_pass AND NOT undervalued AND green_signal:
    verdict = "WAIT"
    reason  = "Strong company with buy signal, but current price above margin of safety"

ELIF big5_pass AND NOT undervalued AND NOT green_signal:
    verdict = "WATCHLIST"
    reason  = "Quality company but overvalued and no buy signal"

ELSE (NOT big5_pass):
    verdict = "DISQUALIFIED"
    reason  = "Does not meet Rule #1 minimum growth requirements (10% CAGR)"
```

## Moat Override

If `moat_score >= 8` and verdict is "WAIT", upgrade display priority (highlight card).
If `moat_score <= 2` and verdict is "BUY", add warning: "Low moat confidence - verify manually".

## Frontend Display

| Verdict | Color | Badge | Card Border |
|---|---|---|---|
| BUY | Green | `bg-green-600` | `border-green-500` |
| WAIT | Yellow | `bg-yellow-600` | `border-yellow-500` |
| WATCHLIST | Blue | `bg-blue-600` | `border-blue-500` |
| DISQUALIFIED | Red | `bg-red-600` | `border-red-500` |

## Backend Return Shape

```json
{
  "verdict": "BUY",
  "verdict_reason": "All Rule #1 criteria met...",
  "verdict_details": {
    "big5_pass": true,
    "undervalued": true,
    "green_signal": true,
    "moat_score": 8
  }
}
```
