// ===========================================
// Sales Bot — Motor de conversación
// ===========================================

import { createAdminSupabase } from "@/lib/supabase/server";
import * as kommo from "@/lib/integrations/kommo-ventas";
import { buildSystemPrompt, buildMessages } from "./sales-prompts";
import {
  PIPELINE_ID,
  STAGES,
  STAGE_NAMES,
  CHANNEL_MAP,
  type BotIncomingMessage,
  type BotResponse,
  type ConversationMessage,
} from "./types";

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// --- Main Handler ---

export async function handleIncomingMessage(msg: BotIncomingMessage): Promise<void> {
  const supabase = createAdminSupabase();

  // 1. Buscar o crear conversación
  const conversation = await getOrCreateConversation(supabase, msg);

  // 2. Si está marcada como atendida por humano, no intervenir
  if (conversation.attended_by === "human") {
    console.log("[Bot] Conversación atendida por humano, ignorando");
    return;
  }

  // 3. Obtener etapa actual del lead en Kommo
  const currentStageId = await getLeadStage(msg.leadId);

  // 4. Verificar que el lead está en nuestro pipeline (VENTAS 2.0)
  // Si no está, podría ser del pipeline viejo — ignorar
  if (currentStageId === null) {
    console.log("[Bot] Lead no encontrado o no está en pipeline VENTAS 2.0, ignorando");
    return;
  }

  // 5. Cargar historial de conversación
  const history = await getConversationHistory(supabase, conversation.id);

  // 6. Guardar mensaje del cliente
  await saveMessage(supabase, conversation.id, "user", msg.text);

  // 7. Generar respuesta con Claude
  const currentStageName = STAGE_NAMES[currentStageId] || "Desconocida";
  const botResponse = await generateResponse(currentStageName, history, msg.text);

  // 8. Enviar respuesta al cliente via Kommo
  try {
    await kommo.sendChatMessage(msg.chatId, botResponse.reply);
    console.log("[Bot] Respuesta enviada:", botResponse.reply.slice(0, 100));
  } catch (err: any) {
    console.error("[Bot] Error enviando mensaje:", err.message);
    // Guardar el error pero no crashear
    await saveMessage(supabase, conversation.id, "assistant", botResponse.reply, {
      error: err.message,
      sent: false,
    });
    return;
  }

  // 9. Guardar respuesta del bot
  await saveMessage(supabase, conversation.id, "assistant", botResponse.reply, {
    intent: botResponse.intent,
    temperature: botResponse.temperature,
    needsHuman: botResponse.needsHuman,
    fieldsDetected: botResponse.fieldsDetected,
  });

  // 10. Mover lead de etapa si aplica
  if (botResponse.moveToStage && botResponse.moveToStage !== currentStageId) {
    try {
      await kommo.updateLead(parseInt(msg.leadId), {
        status_id: botResponse.moveToStage,
        pipeline_id: PIPELINE_ID,
      });
      console.log("[Bot] Lead movido a:", STAGE_NAMES[botResponse.moveToStage]);
    } catch (err: any) {
      console.error("[Bot] Error moviendo lead:", err.message);
    }
  }

  // 11. Actualizar campos del lead si se detectaron datos
  if (Object.keys(botResponse.fieldsDetected).length > 0) {
    await updateConversationFields(supabase, conversation.id, botResponse);
  }

  // 12. Si necesita humano, agregar nota al lead
  if (botResponse.needsHuman) {
    try {
      await kommo.addNoteToLead(
        parseInt(msg.leadId),
        `🤖 Bot: El cliente necesita atención humana.\nMotivo: ${botResponse.intent}\nÚltimo mensaje: "${msg.text.slice(0, 200)}"`
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
}

// --- Claude API ---

async function generateResponse(
  currentStage: string,
  history: ConversationMessage[],
  newMessage: string
): Promise<BotResponse> {
  if (!CLAUDE_API_KEY) {
    console.error("[Bot] ANTHROPIC_API_KEY no configurada");
    return fallbackResponse();
  }

  try {
    const systemPrompt = buildSystemPrompt(currentStage);
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

async function getOrCreateConversation(supabase: any, msg: BotIncomingMessage) {
  // Buscar conversación activa por lead
  const { data: existing } = await supabase
    .from("bot_sales_conversations")
    .select("*")
    .eq("kommo_lead_id", msg.leadId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) return existing;

  // Crear nueva conversación
  const { data: created, error } = await supabase
    .from("bot_sales_conversations")
    .insert({
      kommo_lead_id: msg.leadId,
      kommo_contact_id: msg.contactId,
      kommo_chat_id: msg.chatId,
      kommo_talk_id: msg.talkId,
      phone: "",
      channel: CHANNEL_MAP[msg.origin] || msg.origin,
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

// --- Kommo Helpers ---

async function getLeadStage(leadId: string): Promise<number | null> {
  try {
    const lead = await kommo.getLead(parseInt(leadId));
    if (!lead || lead.pipeline_id !== PIPELINE_ID) {
      return null;
    }
    return lead.status_id;
  } catch (err: any) {
    console.error("[Bot] Error obteniendo lead:", err.message);
    return null;
  }
}
