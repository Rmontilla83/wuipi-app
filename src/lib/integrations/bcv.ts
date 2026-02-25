// ===========================================
// BCV Rate Client
// Fetches official USD/BS exchange rate
// ===========================================

import type { BCVRate } from "@/types/finance";

// BCV publishes rates at https://www.bcv.org.ve
// We can scrape or use known API endpoints

export async function fetchBCVRate(): Promise<BCVRate> {
  try {
    // Try fetching from BCV or a reliable proxy
    // The BCV website can be scraped for the official rate
    const res = await fetch("https://pydolarve.org/api/v1/dollar?monitor=bcv", {
      next: { revalidate: 3600 }, // Cache 1 hour
    });

    if (res.ok) {
      const data = await res.json();
      // pydolarve returns: { price: number, last_update: string }
      return {
        date: new Date().toISOString().split("T")[0],
        usd_to_bs: data?.price || 0,
        eur_to_bs: 0,
        source: "bcv",
        updated_at: data?.last_update || new Date().toISOString(),
      };
    }
  } catch (error) {
    console.error("BCV rate fetch error:", error);
  }

  // Fallback - manual rate (should be updated in env)
  return {
    date: new Date().toISOString().split("T")[0],
    usd_to_bs: parseFloat(process.env.BCV_MANUAL_RATE || "78.50"),
    eur_to_bs: 0,
    source: "manual",
    updated_at: new Date().toISOString(),
  };
}

export function convertUsdToBs(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100;
}

export function convertBsToUsd(amountBs: number, rate: number): number {
  return Math.round((amountBs / rate) * 100) / 100;
}
