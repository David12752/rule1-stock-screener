"use client";

import { useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POLL_INTERVAL_MS = 60_000; // 1 minute — live quotes power the check
const NOTIF_PERM_KEY = "rule1_notif_permission";

/** Request notification permission once per session */
async function ensureNotifPermission(): Promise<boolean> {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
}

function fireNotification(title: string, body: string, symbol: string) {
    if (typeof window === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: `rule1_alert_${symbol}`,
    });
    n.onclick = () => {
        window.focus();
        window.location.href = `/stock/${symbol}`;
    };
}

/**
 * Price Alerts hook — runs a background poll every minute against live quotes.
 * Drop this in a layout or root page component to activate alerts globally.
 */
export function usePriceAlerts() {
    const checkAlerts = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/alerts/check`);
            if (!res.ok) return;
            const data: { fired: any[] } = await res.json();
            for (const alert of data.fired) {
                const label =
                    alert.alert_type === "at_mos"
                        ? "הגיע למחיר MOS"
                        : alert.alert_type === "at_sticker"
                        ? "הגיע למחיר Sticker"
                        : `ירד מתחת ל-$${alert.threshold}`;
                await ensureNotifPermission();
                fireNotification(
                    `🎯 התראה: ${alert.symbol}`,
                    `${alert.symbol} ${label} — $${alert.fired_price?.toFixed(2)}`,
                    alert.symbol
                );
            }
        } catch {
            // backend offline — silent
        }
    }, []);

    useEffect(() => {
        // Request permission on mount
        ensureNotifPermission().catch(() => {});

        // Initial check (with short delay to not block render)
        const t = setTimeout(checkAlerts, 3000);

        // Poll every 15 minutes
        const interval = setInterval(checkAlerts, POLL_INTERVAL_MS);
        return () => { clearTimeout(t); clearInterval(interval); };
    }, [checkAlerts]);
}
