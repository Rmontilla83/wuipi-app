// ===========================================
// BCV Rate Client
// Fetches official USD/BS exchange rate
// Multi-API fallback chain
// ===========================================

import type { BCVRate } from "@/types/finance";

// In-memory cache shared across the module
let _cache: { rate: BCVRate; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchBCVRate(): Promise<BCVRate> {
  // Return cached if fresh
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return _cache.rate;
  }

  // --- Try 1: pydolarve v2 ---
  try {
    const res = await fetch("https://pydolarve.org/api/v2/dollar?monitor=bcv", {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      // v2 returns { price: number, last_update: string } or nested { monitors: { bcv: { price } } }
      const price = data?.price || data?.monitors?.bcv?.price;
      if (price && price > 0) {
        const rate: BCVRate = {
          date: new Date().toISOString().split("T")[0],
          usd_to_bs: price,
          eur_to_bs: 0,
          source: "pydolarve_v2",
          updated_at: data?.last_update || new Date().toISOString(),
        };
        _cache = { rate, ts: Date.now() };
        return rate;
      }
    }
  } catch (err) {
    console.warn("[BCV] pydolarve v2 failed:", err instanceof Error ? err.message : err);
  }

  // --- Try 2: pydolarve v1 ---
  try {
    const res = await fetch("https://pydolarve.org/api/v1/dollar?monitor=bcv", {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const price = data?.price;
      if (price && price > 0) {
        const rate: BCVRate = {
          date: new Date().toISOString().split("T")[0],
          usd_to_bs: price,
          eur_to_bs: 0,
          source: "pydolarve_v1",
          updated_at: data?.last_update || new Date().toISOString(),
        };
        _cache = { rate, ts: Date.now() };
        return rate;
      }
    }
  } catch (err) {
    console.warn("[BCV] pydolarve v1 failed:", err instanceof Error ? err.message : err);
  }

  // --- Try 3: dolarapi.com ---
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      // Returns { promedio: number, venta: number, fechaActualizacion: string }
      const price = data?.venta || data?.promedio;
      if (price && price > 0) {
        const rate: BCVRate = {
          date: new Date().toISOString().split("T")[0],
          usd_to_bs: price,
          eur_to_bs: 0,
          source: "dolarapi",
          updated_at: data?.fechaActualizacion || new Date().toISOString(),
        };
        _cache = { rate, ts: Date.now() };
        return rate;
      }
    }
  } catch (err) {
    console.warn("[BCV] dolarapi.com failed:", err instanceof Error ? err.message : err);
  }

  // --- Fallback: hardcoded / env var ---
  console.warn("[BCV] All APIs failed, using manual rate");
  const rate: BCVRate = {
    date: new Date().toISOString().split("T")[0],
    usd_to_bs: parseFloat(process.env.BCV_MANUAL_RATE || "78.50"),
    eur_to_bs: 0,
    source: "manual",
    updated_at: new Date().toISOString(),
  };
  // Cache manual rate too (avoid hammering dead APIs)
  _cache = { rate, ts: Date.now() };
  return rate;
}

export function convertUsdToBs(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate * 100) / 100;
}

export function convertBsToUsd(amountBs: number, rate: number): number {
  return Math.round((amountBs / rate) * 100) / 100;
}
