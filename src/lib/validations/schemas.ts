import { z } from "zod";

// ============================================
// CLIENT SCHEMAS
// ============================================
export const clientCreateSchema = z.object({
  legal_name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(255),
  trade_name: z.string().max(255).optional().nullable(),
  document_type: z.enum(["V", "J", "E", "G", "P"], { message: "Tipo de documento inválido" }),
  document_number: z.string().min(3, "Número de documento inválido").max(20),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  phone_alt: z.string().max(30).optional().nullable(),
  contact_person: z.string().max(255).optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  sector: z.string().max(100).optional().nullable(),
  nodo: z.string().max(50).optional().nullable(),
  plan_id: z.string().uuid("Plan inválido").optional().nullable(),
  service_status: z.enum(["active", "suspended", "pending", "cancelled"]).default("pending"),
  installation_date: z.string().optional().nullable(),
  billing_currency: z.enum(["USD", "VES"]).default("USD"),
  billing_day: z.number().int().min(1).max(28).default(1),
  notes: z.string().optional().nullable(),
});

export const clientUpdateSchema = clientCreateSchema.partial();

export const clientStatusSchema = z.object({
  service_status: z.enum(["active", "suspended", "pending", "cancelled"]),
});

// ============================================
// INVOICE SCHEMAS
// ============================================
export const invoiceCreateSchema = z.object({
  client_id: z.string().uuid("Cliente inválido"),
  invoice_type: z.enum(["invoice", "credit_note", "debit_note"]).default("invoice"),
  issue_date: z.string().min(1, "Fecha de emisión requerida"),
  due_date: z.string().min(1, "Fecha de vencimiento requerida"),
  currency: z.enum(["USD", "VES"]).default("USD"),
  period_start: z.string().optional().nullable(),
  period_end: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tax_iva_pct: z.number().min(0).max(100).default(16),
  tax_igtf_pct: z.number().min(0).max(100).default(0),
  discount_pct: z.number().min(0).max(100).default(0),
});

export const invoiceItemSchema = z.object({
  invoice_id: z.string().uuid(),
  description: z.string().min(1, "Descripción requerida"),
  quantity: z.number().positive("Cantidad debe ser mayor a 0"),
  unit_price: z.number().min(0, "Precio no puede ser negativo"),
  plan_id: z.string().uuid().optional().nullable(),
  service_id: z.string().uuid().optional().nullable(),
});

// ============================================
// PAYMENT SCHEMAS
// ============================================
export const paymentCreateSchema = z.object({
  client_id: z.string().uuid("Cliente inválido"),
  invoice_id: z.string().uuid().optional().nullable(),
  payment_method_id: z.string().uuid("Método de pago inválido"),
  amount: z.number().positive("El monto debe ser mayor a 0"),
  currency: z.enum(["USD", "VES"]).default("USD"),
  payment_date: z.string().min(1, "Fecha de pago requerida"),
  reference_number: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ============================================
// PLAN SCHEMAS
// ============================================
export const planSchema = z.object({
  name: z.string().min(2, "Nombre del plan requerido").max(100),
  price_usd: z.number().min(0, "Precio no puede ser negativo"),
  speed_down: z.number().int().min(1).optional().nullable(),
  speed_up: z.number().int().min(1).optional().nullable(),
  technology: z.string().max(50).optional().nullable(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
});

// ============================================
// CRM VENTAS SCHEMAS
// ============================================

const CRM_STAGES = [
  "incoming", "contacto_inicial", "info_enviada", "en_instalacion",
  "no_factible", "no_concretado", "no_clasificado",
  "retirado_reactivacion", "prueba_actualizacion", "ganado",
] as const;

const CRM_SOURCES = ["whatsapp", "web", "referido", "social", "other"] as const;
const CRM_ACTIVITY_TYPES = ["note", "call", "visit", "stage_change", "assignment", "email", "system"] as const;

export const crmLeadCreateSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(255),
  phone: z.string().max(30).optional().nullable(),
  phone_alt: z.string().max(30).optional().nullable(),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  sector: z.string().max(100).optional().nullable(),
  nodo: z.string().max(50).optional().nullable(),
  document_type: z.enum(["V", "J", "E", "G", "P"]).optional().nullable(),
  document_number: z.string().max(20).optional().nullable(),
  stage: z.enum(CRM_STAGES).default("incoming"),
  product_id: z.string().uuid("Producto inválido").optional().nullable(),
  salesperson_id: z.string().uuid("Vendedor inválido").optional().nullable(),
  source: z.enum(CRM_SOURCES).default("other"),
  value: z.number().min(0, "El valor no puede ser negativo").default(0),
  notes: z.string().optional().nullable(),
});

export const crmLeadUpdateSchema = crmLeadCreateSchema.partial();

export const crmLeadMoveSchema = z.object({
  stage: z.enum(CRM_STAGES, { message: "Etapa inválida" }),
});

export const crmActivityCreateSchema = z.object({
  lead_id: z.string().uuid("Lead inválido"),
  type: z.enum(CRM_ACTIVITY_TYPES, { message: "Tipo de actividad inválido" }),
  description: z.string().min(1, "La descripción es requerida"),
  metadata: z.any().optional().nullable(),
  created_by: z.string().optional(),
});

export const crmSalespersonSchema = z.object({
  full_name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(255),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  type: z.enum(["internal", "external"]).default("internal"),
  is_active: z.boolean().default(true),
  profile_id: z.string().uuid().optional().nullable(),
});

export const crmQuotaSchema = z.object({
  salesperson_id: z.string().uuid("Vendedor inválido"),
  month: z.string().min(1, "El mes es requerido"),
  target_count: z.number().int().min(0, "La meta no puede ser negativa").default(0),
  target_amount: z.number().min(0, "El monto no puede ser negativo").default(0),
});

// ============================================
// CRM COBRANZAS SCHEMAS
// ============================================

const CRM_COLLECTION_STAGES = [
  "leads_entrantes", "contacto_inicial", "info_enviada", "no_clasificado",
  "gestion_suspendidos", "gestion_pre_retiro", "gestion_cobranza",
  "recuperado", "retirado_definitivo",
] as const;

const CRM_COLLECTION_SOURCES = ["internal", "system", "kommo"] as const;
const CRM_COLLECTION_ACTIVITY_TYPES = ["note", "call", "visit", "stage_change", "payment_promise", "payment_received", "assignment", "system"] as const;

export const crmCollectionCreateSchema = z.object({
  client_id: z.string().uuid("Cliente inválido"),
  client_name: z.string().min(2, "El nombre del cliente es requerido").max(255),
  client_phone: z.string().max(30).optional().nullable(),
  client_email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  stage: z.enum(CRM_COLLECTION_STAGES).default("leads_entrantes"),
  collector_id: z.string().uuid("Cobrador inválido").optional().nullable(),
  amount_due: z.number().min(0, "El monto no puede ser negativo").default(0),
  amount_paid: z.number().min(0, "El monto no puede ser negativo").default(0),
  currency: z.enum(["USD", "VES"]).default("USD"),
  days_overdue: z.number().int().min(0).default(0),
  last_payment_date: z.string().optional().nullable(),
  months_overdue: z.number().int().min(0).default(0),
  plan_name: z.string().max(100).optional().nullable(),
  source: z.enum(CRM_COLLECTION_SOURCES).default("internal"),
  notes: z.string().optional().nullable(),
});

export const crmCollectionUpdateSchema = crmCollectionCreateSchema.partial();

export const crmCollectionMoveSchema = z.object({
  stage: z.enum(CRM_COLLECTION_STAGES, { message: "Etapa inválida" }),
});

export const crmCollectionActivityCreateSchema = z.object({
  collection_id: z.string().uuid("Caso inválido"),
  type: z.enum(CRM_COLLECTION_ACTIVITY_TYPES, { message: "Tipo de actividad inválido" }),
  description: z.string().min(1, "La descripción es requerida"),
  metadata: z.any().optional().nullable(),
  created_by: z.string().optional(),
});

export const crmCollectorSchema = z.object({
  full_name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(255),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  phone: z.string().max(30).optional().nullable(),
  type: z.enum(["internal", "external"]).default("internal"),
  is_active: z.boolean().default(true),
  profile_id: z.string().uuid().optional().nullable(),
});

export const crmCollectionQuotaSchema = z.object({
  collector_id: z.string().uuid("Cobrador inválido"),
  month: z.string().min(1, "El mes es requerido"),
  target_count: z.number().int().min(0, "La meta no puede ser negativa").default(0),
  target_amount: z.number().min(0, "El monto no puede ser negativo").default(0),
});

// ============================================
// HELPER: validate and return typed data or error
// ============================================
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string; details: z.ZodIssue[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0]?.message || "Datos inválidos";
  return { success: false, error: firstError, details: result.error.issues };
}
