# Rule #1 Professional Upgrade Plan

This document outlines the comprehensive work plan to elevate the Rule #1 Stock Screener from a basic prototype to a professional-grade investing tool.

## 🎯 Objective
To create a "No-Compromise" Rule #1 analysis tool that provides strict, accurate, and actionable investment data with a premium user experience.

---

## 📅 Phase 1: Data Integrity & Foundation (The Bedrock)
**Goal:** Ensure 10-year data accuracy and handle corporate actions correctly.

1.  **Stock Split Normalization**:
    *   **Problem:** Historical EPS/Equity data from raw APIs often isn't adjusted for splits, causing fake "crashes" in growth charts.
    *   **Solution:** Implement a `SplitAdjustment` layer in `backend/app/data_service.py` that normalizes all historical per-share data using the cumulative split ratio.
2.  **Extended History (10 Years)**:
    *   **Problem:** Default `yfinance` fetch might be too short.
    *   **Solution:** Force `period="max"` and filter for the last 10 full fiscal years.
3.  **Data Quality Validation**:
    *   **Action:** Flag stocks with >20% missing data points as "Incomplete Data" (don't try to guess).

## 📊 Phase 2: Advanced Rule #1 Metrics
**Goal:** Implement the specific, hard-nosed metrics Phil Town uses.

1.  **Debt Payback Time**:
    *   **Formula:** `Long-Term Debt / Free Cash Flow`.
    *   **Rule:** Must be < 3 years.
    *   **Implementation:** Fetch Balance Sheet (Debt) and Cash Flow (FCF), compute, and display in the dashboard.
2.  **ROE (Return on Equity)**:
    *   **Action:** Add ROE alongside ROIC to verify management efficiency.
3.  **"Traffic Light" System**:
    *   **Action:** Instead of just numbers, every Big 5 metric cell gets a visual status:
        *   🟢 **Green:** > 10% Growth
        *   🟡 **Yellow:** 5% - 10%
        *   🔴 **Red:** < 5% or Negative

## 🧠 Phase 3: The "Deal Breaker" Logic & AI
**Goal:** Provide instant, cynical analysis—not just raw data.

1.  **Strict Verdict Logic**:
    *   **Buy:** All Big 5 Green + Mos Price > Current Price + Technical Buy Signal.
    *   **Wait:** Great Company (Big 5 Green) but too expensive.
    *   **Pass:** Inconsistent growth or bad management.
2.  **"Deal Breaker" Summary**:
    *   **Action:** Generate a one-sentence summary at the top of the page.
    *   *Example:* "Excellent business with a wide moat, but currently trading at 2x its fair value."
3.  **Cynical AI Analysis**:
    *   **Action:** Update Gemini prompt to be "The Cynical Investor". Ask it to disprove the Moat, not just find it.

## 🎨 Phase 4: Professional UX/UI Overhaul
**Goal:** A "Bloomberg Terminal" feel for Value Investors.

1.  **"Parallel Lines" Growth Chart**:
    *   **Concept:** Visualize EPS, Sales, Equity, and FCF on a single normalized chart (all starting at Index 100).
    *   **Benefit:** Instantly see if the company is growing symmetrically (a key Rule #1 indicator).
2.  **Search-Centric Home Page**:
    *   **Action:** Redesign `page.tsx` to focus on a large, clean search bar (Google-style) rather than a cluttered list.
3.  **Visual Polish**:
    *   **Action:** Use "Glassmorphism" for cards, distinct Red/Green badges for verdicts, and improved typography (Inter/Roboto Mono).

---

## 🚀 Execution Strategy

1.  **Start with Phase 1 & 2** (Backend/Data) to ensure the numbers are right.
2.  **Proceed to Phase 3** (Logic) to interpret the data.
3.  **Finish with Phase 4** (Frontend) to visualize the results beautifully.
