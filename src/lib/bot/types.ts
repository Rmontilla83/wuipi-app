// ===========================================
// Sales Bot — Types
// ===========================================

/** Pipeline VENTAS 2.0 en Kommo */
export const PIPELINE_ID = 13527492;

export const STAGES = {
  LEADS_ENTRANTES: 104369460,
  CALIFICACION: 104369464,
  PROPUESTA_ENVIADA: 104369468,
  DATOS_CONTRATACION: 104369472,
  INSTALACION_PROGRAMADA: 104371260,
  GANADO: 142,
  NO_CONCRETADO: 143,
} as const;

export const STAGE_NAMES: Record<number, string> = {
  [STAGES.LEADS_ENTRANTES]: "Leads Entrantes",
  [STAGES.CALIFICACION]: "Calificación",
  [STAGES.PROPUESTA_ENVIADA]: "Propuesta Enviada",
  [STAGES.DATOS_CONTRATACION]: "Datos de Contratación",
  [STAGES.INSTALACION_PROGRAMADA]: "Instalación Programada",
  [STAGES.GANADO]: "Logrado con Éxito",
  [STAGES.NO_CONCRETADO]: "No Concretado",
};

/** Canales de origen detectados por el campo origin del webhook */
export const CHANNEL_MAP: Record<string, string> = {
  waba: "WhatsApp",
  instagram: "Instagram DM",
  facebook: "Facebook DM",
  // Kommo puede enviar otros valores para comentarios
};

/** Mensaje parseado del webhook */
export interface BotIncomingMessage {
  messageId: string;
  chatId: string;
  talkId: string;
  contactId: string;
  leadId: string;
  text: string;
  authorName: string;
  authorType: string; // "external" = cliente
  origin: string;     // "waba", "instagram", "facebook"
  createdAt: number;
}

/** Historial de conversación para contexto de Claude */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/** Resultado del análisis de Claude */
export interface BotResponse {
  reply: string;
  intent: string;
  moveToStage: number | null;
  fieldsDetected: {
    ciudad?: string;
    zona?: string;
    tipoServicio?: string;
    planInteres?: string;
    nombre?: string;
    cedula?: string;
    telefono?: string;
    direccion?: string;
    comoNosConocio?: string;
  };
  temperature: "frio" | "tibio" | "caliente";
  needsHuman: boolean;
}

/** Mapeo de stages del CRM interno a nombres legibles (para el prompt del bot) */
export const CRM_STAGE_DISPLAY_NAMES: Record<string, string> = {
  incoming: "Leads Entrantes",
  calificacion: "Calificación",
  propuesta_enviada: "Propuesta Enviada",
  datos_contratacion: "Datos de Contratación",
  instalacion_programada: "Instalación Programada",
  ganado: "Ganado",
  no_concretado: "No Concretado",
};

/** Mapeo inverso: nombre legible → stage key del CRM */
export const CRM_STAGE_FROM_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(CRM_STAGE_DISPLAY_NAMES).map(([k, v]) => [v.toLowerCase(), k])
);

/** Catálogo de planes — Residenciales */
export const PLANES_CATALOGO = [
  // Fibra Óptica (prioridad en recomendación)
  { code: "FO200", name: "Fibra 200", speed: "200 Mbps simétrico", price: 31, tech: "Fibra Óptica", notes: "Ancho de banda compartido, 70% garantía en hora pico" },
  { code: "FO300", name: "Fibra 300", speed: "300 Mbps simétrico", price: 43, tech: "Fibra Óptica", notes: "Más popular. Compartido, 70% garantía en hora pico" },
  { code: "FO600", name: "Fibra 600", speed: "600 Mbps simétrico", price: 76, tech: "Fibra Óptica", notes: "Máxima velocidad. Compartido, 70% garantía en hora pico" },
  // Inalámbrico (Carrier Class — solo si no hay fibra en la zona)
  { code: "WL030", name: "Wireless 30", speed: "30 Mbps simétrico", price: 31, tech: "Inalámbrico", notes: "Carrier Class. Compartido, 70% garantía en hora pico" },
  { code: "WL050", name: "Wireless 50", speed: "50 Mbps simétrico", price: 43, tech: "Inalámbrico", notes: "Carrier Class, más popular. Compartido, 70% garantía" },
  { code: "WL100", name: "Wireless 100", speed: "100 Mbps simétrico", price: 76, tech: "Inalámbrico", notes: "Carrier Class, máxima velocidad. Compartido, 70% garantía" },
] as const;

/** Ciudades con cobertura */
export const CIUDADES_COBERTURA = ["lechería", "barcelona", "puerto la cruz", "guanta", "el rincón"];

/** Horario de atención ventas */
export const OFFICE_HOURS = {
  start: 8,  // 8:00 AM
  end: 17,   // 5:00 PM
  timezone: "America/Caracas",
  days: [1, 2, 3, 4, 5], // Lun-Vie
};
