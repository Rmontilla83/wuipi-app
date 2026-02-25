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
