"use client";

import { usePriceAlerts } from "@/hooks/use-price-alerts";

/** Drop this into root layout to activate background price-alert polling. */
export function AlertsProvider() {
    usePriceAlerts();
    return null;
}
