// ============================================================
// Traducción de códigos/mensajes técnicos de pasarela a español
// plano más sugerencia de acción para el agente de cobranzas.
//
// Se consume desde el drawer de detalle de transacción y desde el
// endpoint /api/cobranzas/panel/transactions/[id].
// No tiene efectos colaterales — solo lookup.
// ============================================================

export type DiagnosticHint = {
  /** Razón en español plano. NO usar jerga técnica. */
  reason: string;
  /** Acción concreta que el agente puede tomar con el cliente. */
  action: string;
  /** Severidad para color del badge. */
  severity: "info" | "warn" | "error";
};

const MERCANTIL: Record<string, DiagnosticHint> = {
  "00": {
    reason: "Operación aprobada por el banco.",
    action: "No requiere acción — el pago fue exitoso.",
    severity: "info",
  },
  "4025": {
    reason:
      "El switch interbancario rechazó la operación (Débito Inmediato Mercantil→Mercantil bloqueado por límite de tope intra-banco).",
    action:
      "Pide al cliente intentar con C2P, transferencia P2P o tarjeta de otro banco.",
    severity: "warn",
  },
  "821": {
    reason: "El cliente no está afiliado al servicio de Clave de Pago (C2P) en su banco.",
    action:
      "Indícale al cliente que debe afiliarse al servicio C2P desde su banca en línea antes de reintentar.",
    severity: "warn",
  },
  "99999": {
    reason: "Error genérico del switch — Mercantil no especificó motivo.",
    action: "Reintentar la operación. Si persiste, escalar a soporte Mercantil.",
    severity: "error",
  },
  "12": {
    reason: "Transacción inválida — datos enviados al banco son incorrectos.",
    action:
      "Revisa que la cédula esté con prefijo correcto (V/J/E/G/P) y el monto sea positivo.",
    severity: "error",
  },
  "14": {
    reason: "Tarjeta o cuenta no válida según el banco emisor.",
    action: "Pide al cliente verificar el número de tarjeta o usar otro método.",
    severity: "warn",
  },
  "51": {
    reason: "Fondos insuficientes en la cuenta del cliente.",
    action:
      "Espera al próximo depósito del cliente o sugiérele pagar en cuotas menores.",
    severity: "warn",
  },
  "54": {
    reason: "Tarjeta vencida según el banco emisor.",
    action: "Pide al cliente actualizar su tarjeta y reintentar.",
    severity: "warn",
  },
  "55": {
    reason: "Clave incorrecta ingresada por el cliente.",
    action: "Pide al cliente verificar la clave y reintentar.",
    severity: "info",
  },
  "57": {
    reason: "Transacción no permitida al titular de la cuenta.",
    action: "Cliente debe contactar a su banco para habilitar débitos en línea.",
    severity: "warn",
  },
  "61": {
    reason: "Excede el límite de monto del cliente con su banco.",
    action: "Sugiere pagar el monto en varias operaciones o subir el límite con el banco.",
    severity: "warn",
  },
  "75": {
    reason: "Excedió el número de intentos de clave incorrecta.",
    action:
      "Cliente debe esperar 24h o desbloquear su tarjeta con su banco antes de reintentar.",
    severity: "warn",
  },
  "91": {
    reason: "Banco emisor temporalmente fuera de servicio.",
    action: "Reintenta en 15-30 minutos.",
    severity: "info",
  },
};

const STRIPE: Record<string, DiagnosticHint> = {
  card_declined: {
    reason: "El banco emisor rechazó la tarjeta del cliente.",
    action: "Pide al cliente otra tarjeta o usar transferencia P2P.",
    severity: "warn",
  },
  insufficient_funds: {
    reason: "Tarjeta sin fondos suficientes.",
    action: "Espera al próximo depósito o sugiere monto parcial.",
    severity: "warn",
  },
  expired_card: {
    reason: "Tarjeta vencida.",
    action: "Pide al cliente actualizar su tarjeta.",
    severity: "warn",
  },
  incorrect_cvc: {
    reason: "Código de seguridad (CVC) incorrecto.",
    action: "Pide al cliente verificar los 3 dígitos al reverso de la tarjeta.",
    severity: "info",
  },
  processing_error: {
    reason: "Stripe no pudo procesar la operación en este momento.",
    action: "Reintenta en unos minutos.",
    severity: "info",
  },
  authentication_required: {
    reason: "El banco pidió autenticación 3D Secure y el cliente no la completó.",
    action: "Reintenta y pide al cliente completar el SMS o app del banco.",
    severity: "info",
  },
  generic_decline: {
    reason: "El banco emisor rechazó sin dar motivo específico.",
    action: "Pide al cliente otra tarjeta. Si insiste, debe llamar a su banco.",
    severity: "warn",
  },
};

const PAYPAL: Record<string, DiagnosticHint> = {
  INSTRUMENT_DECLINED: {
    reason: "PayPal rechazó la tarjeta o cuenta del cliente.",
    action: "Pide al cliente probar otro método dentro de PayPal o usar Stripe/Mercantil.",
    severity: "warn",
  },
  PAYER_ACCOUNT_RESTRICTED: {
    reason: "La cuenta del cliente en PayPal tiene restricciones.",
    action: "Cliente debe resolver las restricciones en su cuenta PayPal o usar otro método.",
    severity: "warn",
  },
  TRANSACTION_REFUSED: {
    reason: "PayPal rechazó la transacción por reglas de riesgo.",
    action: "Reintenta o sugiere otro método.",
    severity: "warn",
  },
  ORDER_NOT_APPROVED: {
    reason: "El cliente no aprobó el pago dentro de PayPal (cerró la ventana o canceló).",
    action: "Reintenta y pide al cliente completar el flujo en PayPal.",
    severity: "info",
  },
};

const C2P: Record<string, DiagnosticHint> = {
  C2P_NOT_AFFILIATED: {
    reason: "El cliente no está afiliado al servicio C2P en su banco.",
    action: "Cliente debe afiliarse a C2P desde su banca en línea (botón 'Clave de Pago').",
    severity: "warn",
  },
  C2P_INVALID_OTP: {
    reason: "La clave dinámica C2P ingresada no coincide con la del banco.",
    action: "Pide al cliente solicitar nueva clave y reintentar (claves expiran en 5 min).",
    severity: "info",
  },
  C2P_EXPIRED_OTP: {
    reason: "La clave dinámica C2P expiró antes de completar el pago.",
    action: "Cliente debe solicitar nueva clave y completar el pago en menos de 5 min.",
    severity: "info",
  },
};

const SYNC_ODOO: Record<string, DiagnosticHint> = {
  invoice_not_found: {
    reason:
      "La factura referenciada no existe en Odoo nuevo — probablemente quedó un ID del Odoo viejo.",
    action:
      "Revisa el partner en Odoo nuevo y concilia el pago manualmente. Bug abierto: persistencia de IDs viejos.",
    severity: "error",
  },
  already_paid: {
    reason:
      "Odoo dice que la factura ya está en payment_state=paid — probablemente auto-conciliada por extracto bancario.",
    action:
      "Verifica que el pago haya quedado correctamente reflejado en Odoo. Si sí, marca la cola como resuelta manual.",
    severity: "info",
  },
  odoo_timeout: {
    reason: "Odoo no respondió a tiempo durante el intento de sync.",
    action: "El cron volverá a intentar automáticamente con backoff.",
    severity: "info",
  },
  custom_month_billed_required: {
    reason:
      "Odoo bloqueó action_post porque falta el campo custom_month_billed_text en la factura.",
    action: "Verifica que el draft tenga el origen correcto. Sino, completa el mes manualmente en Odoo.",
    severity: "warn",
  },
};

const DEFAULT_BY_GATEWAY: Record<string, DiagnosticHint> = {
  mercantil: {
    reason: "Mercantil reportó un error no catalogado.",
    action: "Revisa el código de respuesta en la pestaña Pasarela y consulta con soporte Mercantil si persiste.",
    severity: "warn",
  },
  c2p: {
    reason: "Operación C2P falló sin código conocido.",
    action: "Pide al cliente reintentar con clave nueva.",
    severity: "info",
  },
  stripe: {
    reason: "Stripe rechazó el pago sin código conocido.",
    action: "Revisa el detalle del error en la pestaña Pasarela.",
    severity: "warn",
  },
  paypal: {
    reason: "PayPal rechazó el pago sin código conocido.",
    action: "Revisa el detalle del error en la pestaña Pasarela.",
    severity: "warn",
  },
  transferencia: {
    reason: "La búsqueda de transferencia en Mercantil falló.",
    action: "Pide al cliente verificar que envió a la cuenta correcta (termina en 3031) y reintenta búsqueda.",
    severity: "info",
  },
};

/**
 * Traduce un código/mensaje técnico a algo accionable para cobranzas.
 *
 * Orden de prioridad:
 *   1. Match exacto por código de respuesta dentro del gateway
 *   2. Match parcial por palabra clave en el mensaje
 *   3. Default por gateway
 */
export function translateGatewayError(
  gateway: string,
  code: string | null | undefined,
  message: string | null | undefined,
): DiagnosticHint | null {
  const g = (gateway || "").toLowerCase().trim();
  const c = (code || "").trim();
  const m = (message || "").toLowerCase();

  const table: Record<string, DiagnosticHint> | undefined = (() => {
    if (g === "mercantil") return MERCANTIL;
    if (g === "c2p") return C2P;
    if (g === "stripe") return STRIPE;
    if (g === "paypal") return PAYPAL;
    return undefined;
  })();

  if (table && c && table[c]) return table[c];
  if (table) {
    for (const [k, hint] of Object.entries(table)) {
      if (m && (m.includes(k.toLowerCase()) || k.toLowerCase().includes(m))) {
        return hint;
      }
    }
  }

  if (g && DEFAULT_BY_GATEWAY[g]) return DEFAULT_BY_GATEWAY[g];
  return null;
}

/**
 * Traduce un error de la cola de sync Odoo (last_error de odoo_sync_queue).
 * El mensaje viene en español ya, esto solo lo categoriza.
 */
export function translateSyncError(lastError: string | null | undefined): DiagnosticHint | null {
  if (!lastError) return null;
  const msg = lastError.toLowerCase();

  if (msg.includes("payment_state") && msg.includes("paid")) {
    return SYNC_ODOO.already_paid;
  }
  if (msg.includes("no encontró") || msg.includes("not found") || msg.includes("does not exist")) {
    return SYNC_ODOO.invoice_not_found;
  }
  if (msg.includes("timeout") || msg.includes("etimedout")) {
    return SYNC_ODOO.odoo_timeout;
  }
  if (msg.includes("custom_month_billed") || msg.includes("month_billed")) {
    return SYNC_ODOO.custom_month_billed_required;
  }
  return {
    reason: lastError.slice(0, 200),
    action: "Revisa el log de Odoo en la pestaña Sync Odoo para más detalle.",
    severity: "warn",
  };
}
