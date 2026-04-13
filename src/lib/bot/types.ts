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
  contacto_inicial: "Contacto Inicial",
  info_enviada: "Información Enviada",
  en_instalacion: "En Instalación",
  no_factible: "No Factible",
  no_concretado: "No Concretado",
  no_clasificado: "No Clasificado",
  retirado_reactivacion: "Retirado / Reactivación",
  prueba_actualizacion: "Prueba / Actualización",
  ganado: "Ganado",
};

/** Mapeo inverso: nombre legible → stage key del CRM */
export const CRM_STAGE_FROM_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(CRM_STAGE_DISPLAY_NAMES).map(([k, v]) => [v.toLowerCase(), k])
);

/** Catálogo de planes */
export const PLANES_CATALOGO = [
  { code: "BM025", name: "Beam 25", speed: "25 Mbps simétrico", price: 20, tech: "Fibra Óptica" },
  { code: "BM050", name: "Beam 50", speed: "50 Mbps simétrico", price: 30, tech: "Fibra Óptica" },
  { code: "BM100", name: "Beam 100", speed: "100 Mbps simétrico", price: 45, tech: "Fibra Óptica" },
  { code: "BM200", name: "Beam 200", speed: "200 Mbps simétrico", price: 65, tech: "Fibra Óptica" },
  { code: "BM300", name: "Beam 300", speed: "300/150 Mbps", price: 85, tech: "Fibra Óptica" },
  { code: "WL025", name: "Wireless 25", speed: "25 Mbps", price: 18, tech: "Inalámbrico" },
  { code: "WL050", name: "Wireless 50", speed: "50 Mbps", price: 28, tech: "Inalámbrico" },
] as const;

/** Ciudades con cobertura */
export const CIUDADES_COBERTURA = ["lechería", "barcelona", "puerto la cruz", "guanta"];

/** Horario de atención ventas */
export const OFFICE_HOURS = {
  start: 8,  // 8:00 AM
  end: 17,   // 5:00 PM
  timezone: "America/Caracas",
  days: [1, 2, 3, 4, 5], // Lun-Vie
};
