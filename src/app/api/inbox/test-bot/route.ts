// TEMPORAL — Eliminar después de las pruebas
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import {
  findContactByChannel,
  createContact,
  getOrCreateConversation,
  createMessage,
  getConversation,
  getMessages,
} from "@/lib/dal/inbox";
import { handleInboxMessage } from "@/lib/bot/sales-engine";
import type { InboxChannel } from "@/types/inbox";

interface TestCase {
  id: string;
  description: string;
  contact_name: string;
  phone: string;
  channel: InboxChannel;
  messages: string[]; // Multi-turn: each string is a client message, bot responds between each
}

const TEST_CASES: TestCase[] = [
  {
    id: "flujo-completo-residencial",
    description: "WA — Flujo completo: saludo → calificación → propuesta → datos → listo",
    contact_name: "María González",
    phone: "+584241234567",
    channel: "whatsapp",
    messages: [
      "Hola buenas tardes, quiero saber qué planes de internet tienen para mi casa",
      "Estoy en Puerto La Cruz, zona centro, es para mi hogar",
      "Me interesa el plan de 100 megas, cuánto cuesta?",
      "Ok quiero ese plan. Mi nombre es María González, cédula V-19876543, mi teléfono es 04241234567 y vivo en la Av Principal de Puerto La Cruz, casa 22",
    ],
  },
  {
    id: "zona-ambigua-escala",
    description: "IG — Zona fuera de cobertura → bot verifica → escala a humano",
    contact_name: "Carlos Pérez",
    phone: "+584121112233",
    channel: "instagram",
    messages: [
      "tienen internet en san diego?",
      "San Diego de Carabobo, cerca del centro",
    ],
  },
  {
    id: "negocio-pyme",
    description: "FB — Negocio consulta → bot califica → propone plan empresarial",
    contact_name: "Panadería La Estrella",
    phone: "+584141009988",
    channel: "facebook",
    messages: [
      "Buenos días, somos una panadería en Barcelona y necesitamos internet estable para punto de venta y cámaras",
      "Necesitamos algo rápido y estable, cuánto cuesta el de 200 megas?",
      "Sí queremos ese, cómo hacemos para contratar?",
    ],
  },
  {
    id: "competencia-convence",
    description: "WA — Viene de la competencia → bot resalta ventajas → avanza",
    contact_name: "Ana Martínez",
    phone: "+584241009876",
    channel: "whatsapp",
    messages: [
      "Hola tengo Inter y me anda pésimo, 50 megas y pago 20 dólares",
      "Estoy en Lechería, urbanización El Morro, es para mi casa",
      "Y el de 50 megas cuánto sale? Es fibra óptica?",
    ],
  },
  {
    id: "datos-de-golpe",
    description: "WA — Cliente impaciente da todo de una vez",
    contact_name: "José Rodríguez",
    phone: "+584161234999",
    channel: "whatsapp",
    messages: [
      "Hola quiero contratar Beam 100, soy José Rodríguez V-12345678, vivo en Guanta calle 5 casa 15, mi número es 04161234999",
    ],
  },
  {
    id: "curioso-se-enfria",
    description: "IG — Pregunta precios pero no da datos → se queda en calificación",
    contact_name: "Luis Hernández",
    phone: "+584261557788",
    channel: "instagram",
    messages: [
      "cuánto sale el internet??",
      "no sé, el más barato cuánto es",
      "ah ok voy a pensarlo",
    ],
  },
];

export async function GET(request: Request) {
  try {
    const caller = await requirePermission("ventas", "create");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const caseParam = searchParams.get("case");

    // ?case=1 runs test 1 only (1-indexed), no param = list available tests
    if (!caseParam) {
      return NextResponse.json({
        usage: "Agrega ?case=N para correr un test (1-6)",
        tests: TEST_CASES.map((t, i) => ({ case: i + 1, id: t.id, description: t.description, turns: t.messages.length })),
      });
    }

    const caseIndex = parseInt(caseParam) - 1;
    if (caseIndex < 0 || caseIndex >= TEST_CASES.length) {
      return NextResponse.json({ error: `Case debe ser 1-${TEST_CASES.length}` }, { status: 400 });
    }

    const casesToRun = [TEST_CASES[caseIndex]];
    const results: any[] = [];

    for (const test of casesToRun) {
      const testResult: any = {
        id: test.id,
        description: test.description,
        channel: test.channel,
        contact_name: test.contact_name,
        turns: [],
      };

      try {
        // 1. Find or create contact
        const channelId = test.phone || test.contact_name;
        let contact = await findContactByChannel(test.channel, channelId);
        if (!contact) {
          const contactData: Record<string, string | null> = {
            display_name: test.contact_name,
            phone: test.phone,
          };
          if (test.channel === "whatsapp") contactData.wa_id = test.phone;
          if (test.channel === "instagram") contactData.ig_id = channelId;
          if (test.channel === "facebook") contactData.fb_id = channelId;
          contact = await createContact(contactData as any);
        }
        testResult.contact_id = contact.id;

        // 2. Get or create conversation
        const conversation = await getOrCreateConversation(contact.id, test.channel);
        testResult.conversation_id = conversation.id;

        // 3. Multi-turn: send each message, get bot response
        for (let i = 0; i < test.messages.length; i++) {
          const msg = test.messages[i];

          await createMessage({
            conversation_id: conversation.id,
            direction: "inbound",
            sender_type: "contact",
            content: msg,
            status: "simulated",
          });

          await handleInboxMessage(conversation.id);

          // Get the bot's reply
          const allMessages = await getMessages(conversation.id, { limit: 50 });
          const botReply = allMessages.filter(m => m.direction === "outbound").pop();

          const turnData: any = {
            turn: i + 1,
            client: msg.slice(0, 80),
            bot_reply: botReply?.content?.slice(0, 150) || "Sin respuesta",
          };

          // Parse metadata from bot reply
          if (botReply?.metadata) {
            const meta = botReply.metadata as Record<string, any>;
            turnData.intent = meta.intent;
            turnData.needsHuman = meta.needsHuman;
            if (meta.fieldsDetected && Object.keys(meta.fieldsDetected).length > 0) {
              turnData.fieldsDetected = meta.fieldsDetected;
            }
          }

          testResult.turns.push(turnData);
        }

        // 4. Final state
        const final = await getConversation(conversation.id);
        testResult.final = {
          lead_id: final?.lead_id,
          lead_code: (final as any)?.crm_leads?.code,
          lead_stage: (final as any)?.crm_leads?.stage,
          lead_name: (final as any)?.crm_leads?.name,
          temperature: (final as any)?.temperature,
          status: final?.status,
          bot_active: final?.bot_active,
          bot_fields: (final as any)?.bot_fields,
        };
        testResult.status = "OK";
      } catch (err: any) {
        testResult.status = "ERROR";
        testResult.error = err.message;
      }

      results.push(testResult);
    }

    const summary = {
      total: results.length,
      ok: results.filter(r => r.status === "OK").length,
      errors: results.filter(r => r.status === "ERROR").length,
      leads_created: results.filter(r => r.final?.lead_id).length,
      escalated_to_human: results.filter(r => r.final?.status === "waiting").length,
      stages: results.reduce((acc: Record<string, number>, r) => {
        const s = r.final?.lead_stage || "unknown";
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {}),
    };

    return NextResponse.json({ summary, results }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
