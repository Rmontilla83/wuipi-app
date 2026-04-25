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
  // Service plan fields (denormalized for quick access)
  plan_name: z.string().max(100).optional().nullable(),
  plan_type: z.string().max(50).optional().nullable(),
  plan_speed_down: z.number().int().min(0).optional().nullable(),
  plan_speed_up: z.number().int().min(0).optional().nullable(),
  monthly_rate: z.number().min(0).optional().nullable(),
  // Contract dates
  contract_start: z.string().optional().nullable(),
  contract_end: z.string().optional().nullable(),
  // Technical service fields
  service_ip: z.string().max(45).optional().nullable(),
  service_mac: z.string().max(17).optional().nullable(),
  service_node_code: z.string().max(50).optional().nullable(),
  service_technology: z.enum(["fiber", "wireless", "terragraph", "copper", "mixed"]).optional().nullable(),
  service_vlan: z.string().max(20).optional().nullable(),
  service_router: z.string().max(100).optional().nullable(),
  service_queue_name: z.string().max(100).optional().nullable(),
  // External IDs
  odoo_partner_id: z.number().int().optional().nullable(),
  bequant_subscriber_id: z.string().max(100).optional().nullable(),
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
  "incoming", "calificacion", "propuesta_enviada", "datos_contratacion",
  "instalacion_programada", "ganado", "no_concretado",
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
  description: z.string().min(1, "La descripción es requerida").max(5000),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
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
  description: z.string().min(1, "La descripción es requerida").max(5000),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
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
// COLLECTION CAMPAIGNS SCHEMAS (Cobros Masivos)
// ============================================

export const collectionCampaignCreateSchema = z.object({
  name: z.string().min(2, "El nombre de la campaña es requerido").max(255),
  description: z.string().max(500).optional().nullable(),
});

export const collectionUploadRowSchema = z.object({
  nombre_cliente: z.string().min(1, "Nombre del cliente requerido"),
  cedula_rif: z.string().min(1, "Cédula/RIF requerido"),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  telefono: z.string().optional().nullable().or(z.literal("")),
  monto_usd: z.number().positive("El monto debe ser mayor a 0"),
  concepto: z.string().optional().nullable().or(z.literal("")),
  numero_factura: z.string().optional().nullable().or(z.literal("")),
  // Campos informativos del Excel Odoo (opcionales, solo para vista previa)
  fecha: z.string().optional().nullable().or(z.literal("")),
  subtotal: z.number().optional().nullable(),
  impuesto: z.number().optional().nullable(),
  total: z.number().optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
});

export const collectionUploadSchema = z.object({
  campaign_name: z.string().min(2, "Nombre de campaña requerido"),
  description: z.string().optional().nullable(),
  rows: z.array(collectionUploadRowSchema).min(1, "Debe incluir al menos un registro"),
});

// Venezuelan bank codes — Mercantil 4-digit SUDEBAN codes.
const VENEZUELAN_BANK_CODES = [
  "0102","0104","0105","0108","0114","0115","0116","0128","0134",
  "0137","0138","0146","0151","0156","0157","0163","0166","0168",
  "0169","0171","0172","0173","0174","0175","0177","0191",
] as const;

export const collectionPaySchema = z.object({
  token: z.string().regex(/^wpy_[a-f0-9]{16,64}$/, "Token de pago inválido"),
  method: z.enum(["debito_inmediato", "transferencia", "stripe", "paypal", "c2p"], { message: "Método de pago inválido" }),
  // Solo requeridos cuando method === "c2p" (paso 1: solicitar clave OTP)
  c2p: z.object({
    cedula: z.string().regex(/^\d{6,9}$/, "Cédula debe tener 6-9 dígitos"),
    phone: z.string().regex(/^04\d{9}$/, "Teléfono debe tener formato 04XXXXXXXXX"),
    bankCode: z.enum(VENEZUELAN_BANK_CODES, { message: "Banco inválido" }),
  }).optional(),
});

export const collectionC2PConfirmSchema = z.object({
  token: z.string().regex(/^wpy_[a-f0-9]{16,64}$/, "Token de pago inválido"),
  cedula: z.string().regex(/^\d{6,9}$/, "Cédula debe tener 6-9 dígitos"),
  phone: z.string().regex(/^04\d{9}$/, "Teléfono debe tener formato 04XXXXXXXXX"),
  bankCode: z.enum(VENEZUELAN_BANK_CODES, { message: "Banco inválido" }),
  otp: z.string().regex(/^\d{4,8}$/, "Clave OTP debe ser numérica de 4-8 dígitos"),
});

export const collectionConfirmTransferSchema = z.object({
  token: z.string().regex(/^wpy_[a-f0-9]{16,64}$/, "Token de pago inválido"),
  reference: z.string().min(1, "Referencia requerida").max(50, "Referencia muy larga"),
  /**
   * Origin bank code (SUDEBAN). Optional so existing clients that confirm
   * without bank selection still work (fall back to manual conciliation).
   * When provided, server attempts automated verification via Mercantil
   * transfer-search.
   */
  bankCode: z.enum(VENEZUELAN_BANK_CODES).optional(),
});

/**
 * In-office cash payment. Admin marks an item as paid when the customer
 * pays with physical cash (USD or Bs) at Puerto La Cruz or Lecheria.
 * Triggers WhatsApp + email "pago recibido" on success.
 */
export const markCashSchema = z.object({
  item_id: z.string().uuid("item_id debe ser UUID"),
  paid_currency: z.enum(["USD", "VES"], { message: "Moneda debe ser USD o VES" }),
  paid_amount: z.number().positive("Monto debe ser positivo").max(100000, "Monto demasiado alto"),
  location: z.enum(["PLC", "Lecheria", "Other"], { message: "Oficina inválida" }),
  notes: z.string().max(200, "Notas muy largas").optional(),
});

// ============================================
// BEQUANT CONFIG SCHEMAS
// ============================================
// Host allowlist: only BQN interfaces permitted. Overridable via BEQUANT_ALLOWED_HOSTS env
// (comma-separated) to add DR/staging hosts without code change.
const BEQUANT_DEFAULT_ALLOWED_HOSTS = ["45.181.124.128", "10.7.37.2"];
const ipv4Regex = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;

export function isAllowedBequantHost(host: string): boolean {
  const extra = (process.env.BEQUANT_ALLOWED_HOSTS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const allowed = new Set([...BEQUANT_DEFAULT_ALLOWED_HOSTS, ...extra]);
  return allowed.has(host);
}

export const bequantConfigSchema = z.object({
  label: z.string().min(1, "Etiqueta requerida").max(100),
  host: z.string().regex(ipv4Regex, "Host debe ser una IPv4 válida")
    .refine(isAllowedBequantHost, "Host no está en la lista permitida (BEQUANT_ALLOWED_HOSTS)"),
  port: z.number().int().min(1).max(65535).default(7343),
  username: z.string().min(1, "Usuario requerido").max(100),
  password: z.string().min(1, "Contraseña requerida").max(255),
  ssl_verify: z.boolean().default(false),
  enabled: z.boolean().default(true),
  notes: z.string().max(500).optional().nullable(),
});

export const bequantConfigUpdateSchema = bequantConfigSchema.partial().extend({
  password: z.string().max(255).optional(),
});

export const bequantTestConnectionSchema = z.object({
  host: z.string().regex(ipv4Regex, "Host debe ser una IPv4 válida")
    .refine(isAllowedBequantHost, "Host no está en la lista permitida"),
  port: z.number().int().min(1).max(65535).default(7343),
  username: z.string().min(1, "Usuario requerido"),
  password: z.string().min(1, "Contraseña requerida"),
  configId: z.string().uuid().optional(),
});

/** IP validation for dynamic route params */
export const bequantIpParamSchema = z.object({
  ip: z.string().regex(ipv4Regex, "IP inválida"),
});

// ============================================
// INBOX MULTI-CANAL
// ============================================

const INBOX_CHANNELS = ["whatsapp", "instagram", "facebook", "web", "manual"] as const;
const INBOX_CONV_STATUSES = ["active", "bot", "waiting", "resolved", "expired"] as const;
const MSG_DIRECTIONS = ["inbound", "outbound"] as const;
const MSG_SENDER_TYPES = ["contact", "agent", "bot", "system"] as const;

export const inboxContactCreateSchema = z.object({
  display_name: z.string().min(1, "Nombre requerido").max(255),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email("Email inválido").optional().nullable().or(z.literal("")),
  wa_id: z.string().max(50).optional().nullable(),
  ig_id: z.string().max(100).optional().nullable(),
  fb_id: z.string().max(100).optional().nullable(),
});

export const inboxContactUpdateSchema = inboxContactCreateSchema.partial();

export const inboxConversationCreateSchema = z.object({
  contact_id: z.string().uuid("ID de contacto inválido"),
  lead_id: z.string().uuid().optional().nullable(),
  channel: z.enum(INBOX_CHANNELS, { errorMap: () => ({ message: "Canal inválido" }) }),
  assigned_to: z.string().uuid().optional().nullable(),
  bot_active: z.boolean().default(true),
});

export const inboxConversationUpdateSchema = z.object({
  status: z.enum(INBOX_CONV_STATUSES).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  bot_active: z.boolean().optional(),
  lead_id: z.string().uuid().optional().nullable(),
});

export const inboxMessageCreateSchema = z.object({
  conversation_id: z.string().uuid("ID de conversación inválido"),
  direction: z.enum(MSG_DIRECTIONS),
  sender_type: z.enum(MSG_SENDER_TYPES).default("agent"),
  content: z.string().min(1, "Mensaje requerido").max(10000),
  content_type: z.enum(["text", "image", "video", "audio", "document", "location", "system"]).default("text"),
});

export const inboxSimulateInboundSchema = z.object({
  contact_name: z.string().min(1, "Nombre del contacto requerido").max(255),
  phone: z.string().max(30).optional().nullable(),
  channel: z.enum(INBOX_CHANNELS).default("whatsapp"),
  message: z.string().min(1, "Mensaje requerido").max(10000),
  lead_id: z.string().uuid().optional().nullable(),
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
