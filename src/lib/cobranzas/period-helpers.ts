// Helpers para convertir el filtro "Período" (hoy, 7d, 30d, mes,
// personalizado) en un rango [from, to] en UTC, respetando el huso
// horario de Caracas (UTC-04:00).
//
// La app vive en Venezuela. Cuando el agente filtra "Hoy", quiere ver
// pagos desde las 00:00 de Caracas hasta las 23:59 de Caracas — no UTC.

const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000;

export type Period = "hoy" | "7d" | "30d" | "mes" | "custom";

export type Range = {
  from: string;
  to: string;
};

/**
 * Devuelve el rango ISO UTC para un período dado. Si period="custom",
 * usa los strings `customFrom`/`customTo` (YYYY-MM-DD en hora Caracas).
 */
export function rangeForPeriod(
  period: Period,
  customFrom?: string | null,
  customTo?: string | null,
): Range {
  const nowCaracas = new Date(Date.now() - CARACAS_OFFSET_MS);

  const todayStartCaracasUTC = new Date(
    Date.UTC(
      nowCaracas.getUTCFullYear(),
      nowCaracas.getUTCMonth(),
      nowCaracas.getUTCDate(),
      0,
      0,
      0,
    ) + CARACAS_OFFSET_MS,
  );
  const todayEndCaracasUTC = new Date(todayStartCaracasUTC.getTime() + 24 * 60 * 60 * 1000);

  switch (period) {
    case "hoy":
      return { from: todayStartCaracasUTC.toISOString(), to: todayEndCaracasUTC.toISOString() };

    case "7d": {
      const from = new Date(todayStartCaracasUTC.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: todayEndCaracasUTC.toISOString() };
    }

    case "30d": {
      const from = new Date(todayStartCaracasUTC.getTime() - 29 * 24 * 60 * 60 * 1000);
      return { from: from.toISOString(), to: todayEndCaracasUTC.toISOString() };
    }

    case "mes": {
      const monthStartCaracas = new Date(
        Date.UTC(nowCaracas.getUTCFullYear(), nowCaracas.getUTCMonth(), 1) + CARACAS_OFFSET_MS,
      );
      return { from: monthStartCaracas.toISOString(), to: todayEndCaracasUTC.toISOString() };
    }

    case "custom": {
      if (!customFrom || !customTo) {
        return { from: todayStartCaracasUTC.toISOString(), to: todayEndCaracasUTC.toISOString() };
      }
      const from = new Date(`${customFrom}T00:00:00.000-04:00`);
      const to = new Date(`${customTo}T23:59:59.999-04:00`);
      return { from: from.toISOString(), to: to.toISOString() };
    }
  }
}

/**
 * Devuelve el rango equivalente del período anterior (para calcular
 * deltas vs ayer/semana pasada/mes pasado en los KPIs).
 */
export function previousRange(range: Range): Range {
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  const span = to - from;
  return {
    from: new Date(from - span).toISOString(),
    to: new Date(from).toISOString(),
  };
}

/** Formatea un ISO UTC a hora de Caracas como "YYYY-MM-DD HH:mm" (apto para tablas). */
export function formatCaracas(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("sv-SE", { timeZone: "America/Caracas" }).slice(0, 16);
}

/**
 * Duración entre dos timestamps en español natural.
 * Ejemplos: "hace 5 min", "hace 3 h", "hace 2 d", "hace 1 mes".
 * Si la diferencia es negativa o inválida, devuelve "—".
 */
export function formatRelative(
  iso: string | null | undefined,
  fromNow = Date.now(),
): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diffMs = fromNow - t;
  if (diffMs < 0) return "hace instantes";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "hace instantes";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `hace ${day} ${day === 1 ? "día" : "días"}`;
  const month = Math.floor(day / 30);
  if (month < 12) return `hace ${month} ${month === 1 ? "mes" : "meses"}`;
  const year = Math.floor(day / 365);
  return `hace ${year} ${year === 1 ? "año" : "años"}`;
}

/** Horas transcurridas desde un ISO. Útil para lógica de diagnóstico. */
export function hoursSince(iso: string | null | undefined, fromNow = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, (fromNow - t) / (1000 * 60 * 60));
}
