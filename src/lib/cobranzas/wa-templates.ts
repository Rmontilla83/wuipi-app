// ============================================================
// Templates de WhatsApp para el riel de Cobranzas
// ============================================================
//
// IMPORTANTE: estos templates AUN NO ESTAN SOMETIDOS A META.
// El equipo humano (no Claude) los somete a Meta Business Manager para
// aprobacion. Mientras tanto, el helper `sendCobranzasWA` opera en modo
// dry-run (env COBRANZAS_WA_DRY_RUN=true) y solo registra que SE HABRIA
// enviado en `cobranzas_wa_outbox`.
//
// El fallback_text se usa cuando el template falla en Meta (errores 132xxx)
// y se envia como mensaje libre. El cliente lo ve igual.
//
// Variables: orden importa (Meta los matchea posicionalmente {{1}}, {{2}}, ...)

export interface WATemplateDef {
  name: string;
  lang: "es";
  category: "utility" | "marketing";
  description: string;
  /** Texto de cuerpo con placeholders {{1}}, {{2}}, ... */
  body: string;
  /** Botones interactivos si aplica (Meta los pide en el template approval) */
  buttons?: Array<{ type: "url" | "quick_reply"; text: string; url?: string }>;
  /** Texto de fallback como mensaje libre cuando el template falla */
  fallback: (params: Record<string, string>) => string;
}

// ----- Calendario mensual del riel ----------------------------

export const WA_TEMPLATES_COBRANZAS: Record<string, WATemplateDef> = {
  // Caso especial: cliente tuvo fallo en pasarela (Stream A4)
  payment_failure_apology: {
    name: "cobranzas_falla_pasarela",
    lang: "es",
    category: "utility",
    description: "Mensaje automatico cuando el cliente intento pagar y la pasarela fallo. Le dice que un asesor lo contactara por aqui.",
    body:
      "Hola {{1}}, notamos que tu intento de pago tuvo un inconveniente {{2}}. " +
      "En breve un asesor de WUIPI Cobranzas te contactara por aqui mismo para ayudarte a completarlo. " +
      "Si prefieres reintentar ahora con otro metodo: {{3}}",
    fallback: (p) =>
      `Hola ${p["1"]},\n\n` +
      `Notamos que tu intento de pago tuvo un inconveniente${p["2"] ? ` ${p["2"]}` : ""}.\n` +
      `En breve un asesor te contactara por aqui mismo para ayudarte a completarlo.\n\n` +
      `Si quieres reintentar ahora con otro metodo, ingresa a: ${p["3"]}\n\n` +
      `WUIPI Telecomunicaciones`,
  },

  // Calendario mensual — orquestado por crons (Stream C2, no implementado aun)

  d27_aviso_factura_generada: {
    name: "cobranzas_d27_aviso_factura",
    lang: "es",
    category: "utility",
    description: "Dia 27 del mes anterior — aviso de factura nueva con link de pago.",
    body:
      "Hola {{1}}, ya esta lista tu factura de {{2}} por {{3}}. " +
      "Recuerda que tu plan WUIPI es prepago: por favor realizala dentro de los primeros 8 dias para mantener tu servicio activo. " +
      "Paga facil aqui: {{4}}",
    fallback: (p) =>
      `Hola ${p["1"]},\n\n` +
      `Ya esta lista tu factura de ${p["2"]} por ${p["3"]}.\n` +
      `Recuerda que tu plan WUIPI es prepago — paga dentro de los primeros 8 dias del mes para mantener el servicio activo.\n\n` +
      `Paga facil: ${p["4"]}\n\nWUIPI Telecomunicaciones`,
  },

  d1_recordatorio_inicio_mes: {
    name: "cobranzas_d1_inicio_mes",
    lang: "es",
    category: "utility",
    description: "Dia 1 — solo a no pagados. Recordatorio amable de inicio de mes.",
    body:
      "Hola {{1}}, ya inicio el mes y aun no recibimos tu pago. " +
      "Tu factura es por {{2}}. Paga aqui: {{3}}",
    fallback: (p) =>
      `Hola ${p["1"]},\n\n` +
      `Ya inicio el mes y aun no recibimos tu pago. Tu factura es por ${p["2"]}.\n` +
      `Paga facil: ${p["3"]}`,
  },

  d3_recordatorio_suave: {
    name: "cobranzas_d3_suave",
    lang: "es",
    category: "utility",
    description: "Dia 3 — recordatorio suave.",
    body:
      "Hola {{1}}, recuerda que tienes una factura pendiente por {{2}}. " +
      "Pagala aqui: {{3}}",
    fallback: (p) => `Hola ${p["1"]},\n\nRecuerda que tienes una factura pendiente por ${p["2"]}.\nPagala: ${p["3"]}`,
  },

  d5_recordatorio_firme: {
    name: "cobranzas_d5_firme",
    lang: "es",
    category: "utility",
    description: "Dia 5 — recordatorio firme, faltan 3 dias para el corte.",
    body:
      "Hola {{1}}, en 3 dias se cumple el plazo de pago. " +
      "Tu factura es por {{2}}. Paga aqui para evitar la suspension: {{3}}",
    fallback: (p) =>
      `Hola ${p["1"]},\n\nEn 3 dias se cumple el plazo de pago. Tu factura es por ${p["2"]}.\n` +
      `Paga aqui para evitar la suspension de servicio: ${p["3"]}`,
  },

  d7_urgente: {
    name: "cobranzas_d7_urgente",
    lang: "es",
    category: "utility",
    description: "Dia 7 — URGENTE con 2 botones interactivos: [Pagar] / [Situacion especial].",
    body:
      "Hola {{1}}, manana es el ultimo dia para pagar tu factura de {{2}}. " +
      "Por favor regularizala para mantener tu servicio activo. " +
      "Si tienes alguna situacion especial, escribenos para ayudarte.",
    buttons: [
      { type: "url", text: "Pagar ahora", url: "{{3}}" },
      { type: "quick_reply", text: "Tengo una situacion especial" },
    ],
    fallback: (p) =>
      `Hola ${p["1"]},\n\nMANANA es el ultimo dia para pagar tu factura de ${p["2"]}.\n` +
      `Pagala aqui: ${p["3"]}\n\nSi tienes una situacion especial, respondenos a este mensaje y un asesor te contactara.`,
  },

  d8_post_corte: {
    name: "cobranzas_d8_post_corte",
    lang: "es",
    category: "utility",
    description: "Dia 8 — disparado por evento Odoo `cliente_suspendido`. Notifica el corte.",
    body:
      "Hola {{1}}, lamentamos informarte que tu servicio fue suspendido por falta de pago. " +
      "Para reactivarlo, paga tu factura pendiente de {{2}} aqui: {{3}}. " +
      "La reactivacion es automatica una vez verificado el pago.",
    fallback: (p) =>
      `Hola ${p["1"]},\n\nTu servicio fue suspendido por falta de pago.\n` +
      `Paga tu factura pendiente de ${p["2"]} aqui: ${p["3"]}.\nLa reactivacion es automatica.`,
  },

  d15_consulta_post_suspension: {
    name: "cobranzas_d15_consulta",
    lang: "es",
    category: "utility",
    description: "Dia 15 — consulta a aun-suspendidos con 3 botones.",
    body:
      "Hola {{1}}, queremos ayudarte a reactivar tu servicio WUIPI. " +
      "Tu factura pendiente es por {{2}}.",
    buttons: [
      { type: "url", text: "Pagar", url: "{{3}}" },
      { type: "quick_reply", text: "Hablar con un agente" },
      { type: "quick_reply", text: "No me interesa" },
    ],
    fallback: (p) =>
      `Hola ${p["1"]},\n\nQueremos ayudarte a reactivar tu servicio WUIPI. Tu factura pendiente es por ${p["2"]}.\n\n` +
      `Paga: ${p["3"]}\nO respondenos para hablar con un agente.`,
  },

  d20_promesa_rota: {
    name: "cobranzas_d20_promesa_rota",
    lang: "es",
    category: "utility",
    description: "Dia 20 — disparado cuando Odoo suspende por promesa rota.",
    body:
      "Hola {{1}}, no logramos verificar el pago acordado y tu servicio fue suspendido nuevamente. " +
      "Si necesitas mas tiempo o tienes una situacion, hablemos por aqui.",
    fallback: (p) =>
      `Hola ${p["1"]},\n\nNo logramos verificar el pago acordado y tu servicio fue suspendido nuevamente.\n` +
      `Si necesitas mas tiempo o tienes una situacion, respondenos.`,
  },

  d38_ultima_oportunidad: {
    name: "cobranzas_d38_ultima_oportunidad",
    lang: "es",
    category: "utility",
    description: "Dia 38 — ultima oportunidad. 1 boton: [Si, atiendanme].",
    body:
      "Hola {{1}}, esta es nuestra ultima oportunidad de ayudarte a recuperar tu servicio. " +
      "Si quieres que te atendamos personalmente, presiona el boton.",
    buttons: [
      { type: "quick_reply", text: "Si, atiendanme" },
    ],
    fallback: (p) =>
      `Hola ${p["1"]},\n\nEsta es nuestra ultima oportunidad de ayudarte a recuperar tu servicio.\n` +
      `Si quieres que te atendamos personalmente, respondenos a este mensaje.`,
  },
};

export type WATemplateName = keyof typeof WA_TEMPLATES_COBRANZAS;
