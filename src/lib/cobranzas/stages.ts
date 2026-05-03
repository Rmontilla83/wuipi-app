// ============================================================
// Stages del kanban de Cobranzas — fuente unica de verdad
// ============================================================
//
// Estas 8 stages son las definidas en cobranzas-instruction.md (doc del
// proyecto) y aplican a partir de Stream A4 (2026-05-03). Reemplazan al
// modelo viejo de "leads_entrantes / contacto_inicial / ..." que el kanban
// nunca uso (0 rows en produccion).
//
// El flujo de un caso:
//   falla_pasarela           ← entry automatico (fallo de pago)
//   requiere_primer_contacto ← entry para casos no-automaticos
//        ↓
//   en_conversacion          ← agente toma el caso, escribe por WA
//        ↓
//   negociando_plan          ← discute opciones
//        ↓
//   compromiso_pago          ← cliente prometio (deadline = dia 20 default)
//        ↓
//   verificando_pago         ← cliente reporto pago, falta confirmar
//        ↓
//   resuelto                 ← cierra OK (closed_at se llena)
//
// Escalacion paralela:
//   ultima_oportunidad       ← dia 38, atencion senior
//
// Reflejo automatico de cambios externos:
//   - Cuando collection_item.status pasa a 'paid', el sistema cierra el
//     caso vinculado (resuelto + closed_at) sin intervencion del agente.

export const COBRANZAS_STAGES = [
  {
    key: "falla_pasarela",
    label: "Falla Pasarela",
    color: "#dc2626",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    phase: "accion",
    entry: "auto",  // se crea automaticamente desde fallo de pago
  },
  {
    key: "requiere_primer_contacto",
    label: "Requiere Primer Contacto",
    color: "#f97316",
    bg: "bg-orange-400/10",
    border: "border-orange-400/30",
    text: "text-orange-400",
    phase: "accion",
    entry: "manual",
  },
  {
    key: "en_conversacion",
    label: "En Conversación",
    color: "#fb923c",
    bg: "bg-orange-300/10",
    border: "border-orange-300/30",
    text: "text-orange-300",
    phase: "accion",
    entry: null,
  },
  {
    key: "negociando_plan",
    label: "Negociando Plan",
    color: "#f59e0b",
    bg: "bg-amber-400/10",
    border: "border-amber-400/30",
    text: "text-amber-400",
    phase: "accion",
    entry: null,
  },
  {
    key: "compromiso_pago",
    label: "Compromiso de Pago",
    color: "#eab308",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/30",
    text: "text-yellow-400",
    phase: "espera",
    entry: null,
  },
  {
    key: "verificando_pago",
    label: "Verificando Pago",
    color: "#84cc16",
    bg: "bg-lime-400/10",
    border: "border-lime-400/30",
    text: "text-lime-400",
    phase: "espera",
    entry: null,
  },
  {
    key: "resuelto",
    label: "Resuelto",
    color: "#10b981",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/30",
    text: "text-emerald-400",
    phase: "cerrado",
    entry: null,
  },
  {
    key: "ultima_oportunidad",
    label: "Última Oportunidad",
    color: "#8b5cf6",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    text: "text-violet-400",
    phase: "cerrado",
    entry: null,
  },
] as const;

export type CobranzasStageKey = typeof COBRANZAS_STAGES[number]["key"];

export const COBRANZAS_STAGE_MAP: Record<string, typeof COBRANZAS_STAGES[number]> =
  Object.fromEntries(COBRANZAS_STAGES.map(s => [s.key, s]));

export const COBRANZAS_STAGE_KEYS = COBRANZAS_STAGES.map(s => s.key) as readonly string[];

// Phases (para agrupar visualmente en el kanban)
export const COBRANZAS_PHASES = [
  { key: "accion",  label: "Acción del Agente", color: "#dc2626" },
  { key: "espera",  label: "En Espera",          color: "#f59e0b" },
  { key: "cerrado", label: "Cerrado",            color: "#6b7280" },
] as const;

// Source values aceptados por crm_collections.source (matcheado con CHECK constraint)
export const COBRANZAS_SOURCES = [
  "internal",          // creado manualmente por agente
  "system",            // creado por sistema (cron, etc.)
  "kommo",             // legacy
  "payment_failure",   // auto desde fallo de pasarela (Stream A4)
  "auto_inbox",        // futuro: bot WA escala (Stream C3)
] as const;

export type CobranzasSource = typeof COBRANZAS_SOURCES[number];
