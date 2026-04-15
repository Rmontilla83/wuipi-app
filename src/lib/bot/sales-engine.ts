// ===========================================
// Sales Bot — Motor de conversación
// ===========================================

import { createAdminSupabase } from "@/lib/supabase/server";
import * as kommo from "@/lib/integrations/kommo-ventas";
import { buildSystemPrompt, buildMessages } from "./sales-prompts";
import {
  PIPELINE_ID,
  STAGE_NAMES,
  CRM_STAGE_DISPLAY_NAMES,
  type BotResponse,
  type ConversationMessage,
} from "./types";
import {
  getConversation as getInboxConversation,
  getMessages as getInboxMessages,
  createMessage as createInboxMessage,
  updateConversation as updateInboxConversation,
} from "@/lib/dal/inbox";
import { createLead, moveLead, updateLead } from "@/lib/dal/crm-ventas";

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// IDs de los campos custom del bot en Kommo
const CF_BOT_INPUT = 1157965;
const CF_BOT_OUTPUT = 1157967;
const CF_BOT_DONE = 1157969;
const CF_BOT_STATUS = 1157971;

// --- Main Handler ---
// Llamado por el webhook del Salesbot (send_hook trigger).
// Lee el mensaje del campo bot_input, genera respuesta con Claude,
// escribe la respuesta en bot_output y marca bot_done = true.
// El Salesbot se encarga de enviar el mensaje al cliente.

export async function handleSalesbotTrigger(leadId: number): Promise<void> {
  const supabase = createAdminSupabase();

  try {
    // 1. Obtener datos del lead (etapa + campo bot_input)
    const lead = await kommo.getLead(leadId);
    if (!lead) {
      console.error("[Bot] Lead no encontrado:", leadId);
      await setBotResponse(leadId, "Lead no encontrado", "error");
      return;
    }

    // 2. Verificar que está en nuestro pipeline
    if (lead.pipeline_id !== PIPELINE_ID) {
      console.log("[Bot] Lead no está en VENTAS 2.0, ignorando:", leadId);
      return;
    }

    // 3. Leer el mensaje del campo bot_input
    const inputField = lead.custom_fields_values?.find(
      (f: any) => f.field_id === CF_BOT_INPUT
    );
    const messageText = inputField?.values?.[0]?.value || "";

    if (!messageText.trim()) {
      console.log("[Bot] bot_input vacío, ignorando");
      await setBotResponse(leadId, "Sin mensaje", "error");
      return;
    }

    console.log("[Bot] Procesando lead:", leadId, "Mensaje:", messageText.slice(0, 100));

    // 4. Buscar o crear conversación en Supabase
    const conversation = await getOrCreateConversation(supabase, {
      leadId: leadId.toString(),
      contactId: lead._embedded?.contacts?.[0]?.id?.toString() || "",
    });

    // 5. Si está atendida por humano, no intervenir
    if (conversation.attended_by === "human") {
      console.log("[Bot] Conversación atendida por humano, ignorando");
      return;
    }

    // 6. Cargar historial y guardar mensaje del cliente
    const history = await getConversationHistory(supabase, conversation.id);
    await saveMessage(supabase, conversation.id, "user", messageText);

    // 7. Generar respuesta con Claude
    const currentStageName = STAGE_NAMES[lead.status_id] || "Desconocida";
    const botResponse = await generateResponse(currentStageName, history, messageText);

    // 8. Escribir respuesta en campo custom + marcar done
    await setBotResponse(leadId, botResponse.reply, "ok");
    console.log("[Bot] Respuesta escrita:", botResponse.reply.slice(0, 100));

    // 9. Guardar respuesta en Supabase
    await saveMessage(supabase, conversation.id, "assistant", botResponse.reply, {
      intent: botResponse.intent,
      temperature: botResponse.temperature,
      needsHuman: botResponse.needsHuman,
      fieldsDetected: botResponse.fieldsDetected,
    });

    // 10. Mover lead de etapa si aplica
    if (botResponse.moveToStage && botResponse.moveToStage !== lead.status_id) {
      try {
        await kommo.updateLead(leadId, {
          status_id: botResponse.moveToStage,
          pipeline_id: PIPELINE_ID,
        });
        console.log("[Bot] Lead movido a:", STAGE_NAMES[botResponse.moveToStage]);
      } catch (err: any) {
        console.error("[Bot] Error moviendo lead:", err.message);
      }
    }

    // 11. Actualizar datos recopilados en Supabase
    if (Object.keys(botResponse.fieldsDetected).length > 0) {
      await updateConversationFields(supabase, conversation.id, botResponse);
    }

    // 12. Si necesita humano, agregar nota
    if (botResponse.needsHuman) {
      try {
        await kommo.addNoteToLead(
          leadId,
          `Bot: El cliente necesita atencion humana.\nMotivo: ${botResponse.intent}\nMensaje: "${messageText.slice(0, 200)}"`
        );
      } catch (err: any) {
        console.error("[Bot] Error agregando nota:", err.message);
      }
    }

    // 13. Actualizar conversación
    await supabase
      .from("bot_sales_conversations")
      .update({
        messages_count: (conversation.messages_count || 0) + 2,
        last_message_at: new Date().toISOString(),
        temperature: botResponse.temperature,
        classification: botResponse.intent,
        needs_human: botResponse.needsHuman,
      })
      .eq("id", conversation.id);

  } catch (err: any) {
    console.error("[Bot] Error fatal:", err.message);
    // Intentar escribir error para que el Salesbot muestre mensaje genérico
    try {
      await setBotResponse(leadId, err.message, "error");
    } catch {
      // Si ni esto funciona, ya no podemos hacer nada
    }
  }
}

/** Escribe la respuesta del bot en los campos custom del lead */
async function setBotResponse(leadId: number, reply: string, status: string) {
  await kommo.updateLead(leadId, {
    custom_fields_values: [
      { field_id: CF_BOT_OUTPUT, values: [{ value: reply }] },
      { field_id: CF_BOT_STATUS, values: [{ value: status }] },
      { field_id: CF_BOT_DONE, values: [{ value: true }] },
    ],
  });
}

// --- Claude API ---

export async function generateResponse(
  currentStage: string,
  history: ConversationMessage[],
  newMessage: string,
  options?: { channel?: string; useCrmStages?: boolean }
): Promise<BotResponse> {
  if (!CLAUDE_API_KEY) {
    console.error("[Bot] ANTHROPIC_API_KEY no configurada");
    return fallbackResponse();
  }

  try {
    const systemPrompt = buildSystemPrompt(currentStage, options);
    const messages = buildMessages(history, newMessage);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Bot] Claude API error:", response.status, errText.slice(0, 200));
      return fallbackResponse();
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || "";

    // Parsear JSON de la respuesta de Claude
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Bot] Claude no devolvió JSON válido:", content.slice(0, 200));
      return fallbackResponse();
    }

    const parsed = JSON.parse(jsonMatch[0]) as BotResponse;

    // Validar campos obligatorios
    if (!parsed.reply) {
      return fallbackResponse();
    }

    return {
      reply: parsed.reply,
      intent: parsed.intent || "otro",
      moveToStage: parsed.moveToStage || null,
      fieldsDetected: parsed.fieldsDetected || {},
      temperature: parsed.temperature || "frio",
      needsHuman: parsed.needsHuman || false,
    };
  } catch (err: any) {
    console.error("[Bot] Error generando respuesta:", err.message);
    return fallbackResponse();
  }
}

function fallbackResponse(): BotResponse {
  return {
    reply: "¡Hola! Gracias por escribirnos. En este momento no puedo procesar tu mensaje, pero un asesor te contactará pronto. 😊",
    intent: "error",
    moveToStage: null,
    fieldsDetected: {},
    temperature: "frio",
    needsHuman: true,
  };
}

// --- Supabase Helpers ---

async function getOrCreateConversation(
  supabase: any,
  info: { leadId: string; contactId: string }
) {
  // Buscar conversación activa por lead
  const { data: existing } = await supabase
    .from("bot_sales_conversations")
    .select("*")
    .eq("kommo_lead_id", info.leadId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) return existing;

  // Crear nueva conversación
  const { data: created, error } = await supabase
    .from("bot_sales_conversations")
    .insert({
      kommo_lead_id: info.leadId,
      kommo_contact_id: info.contactId,
      kommo_chat_id: "",
      kommo_talk_id: "",
      phone: "",
      channel: "Salesbot",
      status: "active",
      attended_by: "bot",
      messages_count: 0,
      temperature: "frio",
    })
    .select()
    .single();

  if (error) {
    console.error("[Bot] Error creando conversación:", error.message);
    throw error;
  }

  return created;
}

async function getConversationHistory(
  supabase: any,
  conversationId: string
): Promise<ConversationMessage[]> {
  const { data } = await supabase
    .from("bot_sales_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  return (data || []).map((m: any) => ({
    role: m.role,
    content: m.content,
    timestamp: new Date(m.created_at).getTime() / 1000,
  }));
}

async function saveMessage(
  supabase: any,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: Record<string, any>
) {
  await supabase.from("bot_sales_messages").insert({
    conversation_id: conversationId,
    role,
    content,
    metadata: metadata || null,
  });
}

async function updateConversationFields(
  supabase: any,
  conversationId: string,
  response: BotResponse
) {
  const fields = response.fieldsDetected;
  const update: Record<string, any> = {};

  if (fields.ciudad) update.ciudad = fields.ciudad;
  if (fields.zona) update.zona = fields.zona;
  if (fields.tipoServicio) update.tipo_servicio = fields.tipoServicio;
  if (fields.planInteres) update.plan_interes = fields.planInteres;
  if (fields.nombre) update.nombre_cliente = fields.nombre;
  if (fields.cedula) update.cedula = fields.cedula;
  if (fields.telefono) update.telefono = fields.telefono;
  if (fields.direccion) update.direccion = fields.direccion;

  if (Object.keys(update).length > 0) {
    await supabase
      .from("bot_sales_conversations")
      .update(update)
      .eq("id", conversationId);
  }
}

// ===========================================
// INBOX BOT HANDLER (desacoplado de Kommo)
// ===========================================
// Lee/escribe directamente en inbox_messages y inbox_conversations.
// Llamado por /api/inbox/simulate y (futuro) por el webhook de Meta.

// Mapeo canal → source para crm_leads
const CHANNEL_TO_SOURCE: Record<string, string> = {
  whatsapp: "whatsapp",
  instagram: "social",
  facebook: "social",
  web: "web",
  manual: "other",
};

export async function handleInboxMessage(conversationId: string): Promise<void> {
  const sb = createAdminSupabase();

  try {
    // 1. Cargar conversación con contact + lead
    let conversation = await getInboxConversation(conversationId);
    if (!conversation) {
      console.error("[InboxBot] Conversación no encontrada:", conversationId);
      return;
    }

    if (!conversation.bot_active) {
      console.log("[InboxBot] Bot desactivado para conversación:", conversationId);
      return;
    }

    // 2. Auto-crear lead si no tiene uno vinculado
    let leadId = conversation.lead_id;
    if (!leadId) {
      leadId = await ensureLeadForConversation(sb, conversation);
      if (leadId) {
        // Re-cargar conversación para tener el join actualizado
        conversation = (await getInboxConversation(conversationId))!;
      }
    }

    // 3. Cargar últimos mensajes
    const recentMessages = await getInboxMessages(conversationId, { limit: 20 });
    if (recentMessages.length === 0) return;

    const lastMessage = recentMessages[recentMessages.length - 1];
    if (lastMessage.direction !== "inbound") return; // Solo responder a mensajes del contacto

    // 4. Determinar etapa actual
    const crmStage = conversation.crm_leads?.stage || "incoming";
    const stageName = CRM_STAGE_DISPLAY_NAMES[crmStage] || "Leads Entrantes";

    // 5. Convertir historial al formato del bot
    const history: ConversationMessage[] = recentMessages.slice(0, -1).map((m) => ({
      role: m.direction === "inbound" ? "user" as const : "assistant" as const,
      content: m.content,
      timestamp: new Date(m.created_at).getTime() / 1000,
    }));

    // 6. Generar respuesta con Claude
    console.log("[InboxBot] Procesando conversación:", conversationId, "Stage:", stageName, "Lead:", leadId || "ninguno");
    const botResponse = await generateResponse(stageName, history, lastMessage.content, {
      channel: conversation.channel,
      useCrmStages: true,
    });

    // 7. Guardar respuesta en inbox_messages
    await createInboxMessage({
      conversation_id: conversationId,
      direction: "outbound",
      sender_type: "bot",
      content: botResponse.reply,
      status: "simulated",
      metadata: {
        intent: botResponse.intent,
        temperature: botResponse.temperature,
        needsHuman: botResponse.needsHuman,
        fieldsDetected: botResponse.fieldsDetected,
      },
    });

    // 8. Actualizar conversación (temperatura, campos, etc.)
    const convUpdate: Record<string, any> = {
      temperature: botResponse.temperature,
    };

    // Merge bot_fields
    if (Object.keys(botResponse.fieldsDetected).length > 0) {
      const existingFields = (conversation.bot_fields || {}) as Record<string, unknown>;
      convUpdate.bot_fields = { ...existingFields, ...botResponse.fieldsDetected };
    }

    // 9. Mover lead de etapa si Claude lo indica
    if (botResponse.moveToStage && leadId) {
      const targetStage = typeof botResponse.moveToStage === "string"
        ? botResponse.moveToStage
        : null;
      if (targetStage && targetStage !== crmStage) {
        try {
          await moveLead(leadId, targetStage, "Bot IA");
          console.log("[InboxBot] Lead movido a:", targetStage);
        } catch (err: any) {
          console.error("[InboxBot] Error moviendo lead:", err.message);
        }
      }
    }

    // 10. Actualizar datos del lead con campos detectados
    if (leadId && Object.keys(botResponse.fieldsDetected).length > 0) {
      await syncLeadFields(leadId, botResponse.fieldsDetected);
    }

    // 11. Si necesita humano, desactivar bot
    if (botResponse.needsHuman) {
      convUpdate.status = "waiting";
      convUpdate.bot_active = false;
    }

    await updateInboxConversation(conversationId, convUpdate);
    console.log("[InboxBot] Respuesta enviada:", botResponse.reply.slice(0, 80));

  } catch (err: any) {
    console.error("[InboxBot] Error fatal:", err.message);
    // Escribir mensaje de error como respuesta del sistema
    try {
      await createInboxMessage({
        conversation_id: conversationId,
        direction: "outbound",
        sender_type: "system",
        content: "Error procesando mensaje. Un asesor te contactará pronto.",
        content_type: "system",
        status: "simulated",
      });
      await updateInboxConversation(conversationId, {
        status: "waiting",
        bot_active: false,
      });
    } catch {
      // Si ni esto funciona, ya no podemos hacer nada
    }
  }
}

/**
 * Busca un lead activo del mismo contacto o crea uno nuevo.
 * Retorna el lead_id y vincula la conversación.
 */
async function ensureLeadForConversation(
  sb: ReturnType<typeof createAdminSupabase>,
  conversation: any
): Promise<string | null> {
  const contactId = conversation.contact_id;
  if (!contactId) return null;

  const contact = conversation.crm_contacts;
  const contactName = contact?.display_name || "Lead sin nombre";

  try {
    // Buscar lead activo existente para este contacto (evitar duplicados)
    const { data: existingLead } = await sb
      .from("crm_leads")
      .select("id")
      .eq("contact_id", contactId)
      .eq("is_deleted", false)
      .not("stage", "in", '("ganado","no_concretado")')
      .limit(1)
      .maybeSingle();

    let leadId: string;

    if (existingLead) {
      leadId = existingLead.id;
      console.log("[InboxBot] Lead existente encontrado:", leadId);
    } else {
      // Crear lead nuevo
      const source = CHANNEL_TO_SOURCE[conversation.channel] || "other";
      const newLead = await createLead({
        name: contactName,
        phone: contact?.phone || null,
        email: contact?.email || null,
        source,
        contact_id: contactId,
        notes: `Creado automáticamente desde conversación ${conversation.channel}`,
      });
      leadId = newLead.id;
      console.log("[InboxBot] Lead creado:", leadId, "Code:", newLead.code);
    }

    // Vincular lead a la conversación
    await updateInboxConversation(conversation.id, { lead_id: leadId });

    return leadId;
  } catch (err: any) {
    console.error("[InboxBot] Error creando/vinculando lead:", err.message);
    return null;
  }
}

/**
 * Sincroniza campos detectados por el bot al lead en crm_leads.
 */
async function syncLeadFields(
  leadId: string,
  fields: Record<string, any>
): Promise<void> {
  const updates: Record<string, any> = {};

  if (fields.nombre) updates.name = fields.nombre;
  if (fields.telefono) updates.phone = fields.telefono;
  if (fields.ciudad) updates.city = fields.ciudad;
  if (fields.zona) updates.sector = fields.zona;
  if (fields.cedula) updates.document_number = fields.cedula;
  if (fields.direccion) updates.address = fields.direccion;
  // tipoServicio y planInteres no tienen columna directa en crm_leads,
  // se guardan en bot_fields de la conversación

  if (Object.keys(updates).length > 0) {
    try {
      await updateLead(leadId, updates);
      console.log("[InboxBot] Lead actualizado con campos:", Object.keys(updates).join(", "));
    } catch (err: any) {
      console.error("[InboxBot] Error actualizando lead:", err.message);
    }
  }
}

