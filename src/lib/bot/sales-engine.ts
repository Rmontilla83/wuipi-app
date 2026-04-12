// ===========================================
// Sales Bot — Motor de conversación
// ===========================================

import { createAdminSupabase } from "@/lib/supabase/server";
import * as kommo from "@/lib/integrations/kommo-ventas";
import { buildSystemPrompt, buildMessages } from "./sales-prompts";
import {
  PIPELINE_ID,
  STAGE_NAMES,
  type BotResponse,
  type ConversationMessage,
} from "./types";

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

