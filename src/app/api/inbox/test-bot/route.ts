// TEMPORAL — Eliminar después de las pruebas
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/check-permission";
import {
  findContactByChannel,
  createContact,
  getOrCreateConversation,
  createMessage,
  getConversation,
} from "@/lib/dal/inbox";
import { handleInboxMessage } from "@/lib/bot/sales-engine";
import type { InboxChannel } from "@/types/inbox";

interface TestCase {
  id: string;
  description: string;
  contact_name: string;
  phone: string;
  channel: InboxChannel;
  messages: string[];
}

const TEST_CASES: TestCase[] = [
  {
    id: "wa-residencial",
    description: "WhatsApp — Cliente residencial pregunta por planes",
    contact_name: "María González",
    phone: "+584241234567",
    channel: "whatsapp",
    messages: [
      "Hola buenas tardes, quiero saber qué planes de internet tienen disponibles para mi casa en Valencia",
    ],
  },
  {
    id: "ig-curioso",
    description: "Instagram — Joven pregunta precios sin dar muchos datos",
    contact_name: "Carlos Pérez",
    phone: "+584121112233",
    channel: "instagram",
    messages: [
      "ey cuanto sale el internet?? tienen fibra?",
    ],
  },
  {
    id: "fb-negocio",
    description: "Facebook — Negocio necesita internet empresarial",
    contact_name: "Panadería La Estrella",
    phone: "+584141009988",
    channel: "facebook",
    messages: [
      "Buenos días, somos una panadería en San Diego y necesitamos internet para el negocio, algo estable para punto de venta y cámaras de seguridad",
    ],
  },
  {
    id: "wa-datos-completos",
    description: "WhatsApp — Cliente da todos los datos de una vez",
    contact_name: "José Rodríguez",
    phone: "+584161234999",
    channel: "whatsapp",
    messages: [
      "Hola quiero contratar internet, mi nombre es José Rodríguez, cédula V-12345678, vivo en Naguanagua calle 3 casa 15, mi número es este mismo 04161234999, quiero el plan de 100 megas",
    ],
  },
  {
    id: "wa-competencia",
    description: "WhatsApp — Cliente compara con la competencia",
    contact_name: "Ana Martínez",
    phone: "+584241009876",
    channel: "whatsapp",
    messages: [
      "Hola, tengo Inter y me anda muy mal. Cuanto cobran ustedes? Tienen mejor precio? Inter me cobra 20 dólares por 50 megas",
    ],
  },
  {
    id: "ig-zona-cobertura",
    description: "Instagram — Pregunta por cobertura en zona específica",
    contact_name: "Luis Hernández",
    phone: "+584261557788",
    channel: "instagram",
    messages: [
      "Hola tienen cobertura en Guacara? Estoy en la urbanización Los Jardines",
    ],
  },
];

export async function GET() {
  try {
    const caller = await requirePermission("ventas", "create");
    if (!caller) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const results: any[] = [];

    for (const test of TEST_CASES) {
      const testResult: any = {
        id: test.id,
        description: test.description,
        channel: test.channel,
        contact_name: test.contact_name,
        steps: [],
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
          testResult.steps.push("Contacto creado: " + contact.id);
        } else {
          testResult.steps.push("Contacto existente: " + contact.id);
        }
        testResult.contact_id = contact.id;

        // 2. Get or create conversation
        const conversation = await getOrCreateConversation(contact.id, test.channel);
        testResult.conversation_id = conversation.id;
        testResult.steps.push("Conversación: " + conversation.id);

        // 3. Send each message and get bot response
        for (const msg of test.messages) {
          await createMessage({
            conversation_id: conversation.id,
            direction: "inbound",
            sender_type: "contact",
            content: msg,
            status: "simulated",
          });
          testResult.steps.push("Mensaje enviado: " + msg.slice(0, 60) + "...");

          // Trigger bot
          await handleInboxMessage(conversation.id);
          testResult.steps.push("Bot procesó mensaje");
        }

        // 4. Reload conversation to check lead
        const updated = await getConversation(conversation.id);
        testResult.lead_id = updated?.lead_id || null;
        testResult.lead_stage = (updated as any)?.crm_leads?.stage || null;
        testResult.lead_code = (updated as any)?.crm_leads?.code || null;
        testResult.lead_name = (updated as any)?.crm_leads?.name || null;
        testResult.bot_fields = (updated as any)?.bot_fields || null;
        testResult.temperature = (updated as any)?.temperature || null;
        testResult.status = "OK";
      } catch (err: any) {
        testResult.status = "ERROR";
        testResult.error = err.message;
      }

      results.push(testResult);
    }

    // Summary
    const summary = {
      total: results.length,
      ok: results.filter(r => r.status === "OK").length,
      errors: results.filter(r => r.status === "ERROR").length,
      leads_created: results.filter(r => r.lead_id).length,
    };

    return NextResponse.json({ summary, results }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
