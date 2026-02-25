// ============================================
// BCV Exchange Rate Service
// Fetches official USD/VES rate from BCV via dolarapi.com
// Fallback: pydolarvenezuela API
// ============================================

interface BCVRate {
  rate: number;
  source: string;
  date: string;
}

// Primary: ve.dolarapi.com (free, open source, scrapes BCV)
async function fetchFromDolarApi(): Promise<BCVRate | null> {
  try {
    const res = await fetch("https://ve.dolarapi.com/v1/dolares/oficial", {
      next: { revalidate: 3600 }, // Cache 1 hour
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    
    const data = await res.json();
    // Response: { compra: number, venta: number, promedio: number, fechaActualizacion: string }
    if (data?.promedio) {
      return {
        rate: data.promedio,
        source: "BCV (dolarapi.com)",
        date: data.fechaActualizacion || new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Fallback: pydolarvenezuela API
async function fetchFromPyDolar(): Promise<BCVRate | null> {
  try {
    const res = await fetch("https://pydolarve.org/api/v1/dollar/unit/bcv", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    // Response varies, try to extract BCV rate
    const price = data?.price || data?.value || data?.monitors?.bcv?.price;
    if (price) {
      return {
        rate: typeof price === "string" ? parseFloat(price.replace(",", ".")) : price,
        source: "BCV (pydolarve.org)",
        date: data?.last_update || new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Main function: try all sources
export async function fetchBCVRate(): Promise<BCVRate | null> {
  // Try primary
  const primary = await fetchFromDolarApi();
  if (primary && primary.rate > 0) return primary;

  // Try fallback
  const fallback = await fetchFromPyDolar();
  if (fallback && fallback.rate > 0) return fallback;

  return null;
}
