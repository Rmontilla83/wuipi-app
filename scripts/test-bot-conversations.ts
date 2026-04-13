/**
 * Test de conversaciones del bot de ventas — directo contra Supabase + Claude
 *
 * Simula conversaciones multi-turno sin necesidad de dev server.
 * Usa las mismas funciones que el endpoint /api/inbox/simulate.
 *
 * Uso:
 *   npx tsx scripts/test-bot-conversations.ts          # todas
 *   npx tsx scripts/test-bot-conversations.ts 1         # solo la #1
 *   npx tsx scripts/test-bot-conversations.ts 1 --dry   # sin llamar a Claude (solo crea datos)
 *
 * Requisitos: .env.local con NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import { config } from "dotenv";
import { resolve } from "path";

// Cargar .env.local antes de cualquier import de app
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

// ============================================
// SUPABASE ADMIN (bypass de Next.js)
// ============================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ============================================
// BOT ENGINE (llamada directa a Claude)
// ============================================
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

// Importamos los prompts inline para evitar dependencias de Next.js
const PLANES_CATALOGO = [
  { code: "BM025", name: "Beam 25", speed: "25 Mbps simétrico", price: 20, tech: "Fibra Óptica" },
  { code: "BM050", name: "Beam 50", speed: "50 Mbps simétrico", price: 30, tech: "Fibra Óptica" },
  { code: "BM100", name: "Beam 100", speed: "100 Mbps simétrico", price: 45, tech: "Fibra Óptica" },
  { code: "BM200", name: "Beam 200", speed: "200 Mbps simétrico", price: 65, tech: "Fibra Óptica" },
  { code: "BM300", name: "Beam 300", speed: "300/150 Mbps", price: 85, tech: "Fibra Óptica" },
  { code: "WL025", name: "Wireless 25", speed: "25 Mbps", price: 18, tech: "Inalámbrico" },
  { code: "WL050", name: "Wireless 50", speed: "50 Mbps", price: 28, tech: "Inalámbrico" },
];

const CRM_STAGE_DISPLAY: Record<string, string> = {
  incoming: "Leads Entrantes",
  calificacion: "Calificación",
  propuesta_enviada: "Propuesta Enviada",
  datos_contratacion: "Datos de Contratación",
  instalacion_programada: "Instalación Programada",
  ganado: "Ganado",
  no_concretado: "No Concretado",
};

function buildSystemPrompt(currentStage: string, channel: string): string {
  const CATALOGO_TEXT = PLANES_CATALOGO.map(
    (p) => `- ${p.name}: ${p.speed} — $${p.price}/mes (${p.tech})`
  ).join("\n");

  const channelNote = channel === "instagram"
    ? "\nNOTA: Estás respondiendo por Instagram DM. Sé aún más conciso (2-3 oraciones máximo)."
    : channel === "facebook"
      ? "\nNOTA: Estás respondiendo por Facebook Messenger."
      : "";

  return `Eres el asesor comercial virtual de Wuipi Telecomunicaciones. Respondes por WhatsApp y redes sociales.${channelNote}

PERSONALIDAD:
- Profesional, amigable y directo. No eres un menú de opciones, eres un asesor real.
- Tono cercano pero respetuoso — tutea al cliente naturalmente.
- Respuestas CORTAS: máximo 3-4 oraciones por mensaje. Es WhatsApp, no un email.
- Usa emojis con moderación (1-2 por mensaje máximo), solo para dar calidez.
- NUNCA inventes datos ni prometas cosas que no están en tu información.

SOBRE WUIPI:
- ISP en el estado Anzoátegui, Venezuela. +8 años de experiencia.
- Cobertura: Lechería, Barcelona, Puerto La Cruz y Guanta.
- Si el cliente está en otra ciudad: "Por ahora no tenemos cobertura en esa zona, pero estamos en expansión. Te avisamos cuando lleguemos allá."
- Si está en una de las 4 ciudades: la cobertura es 80% probable. Decir que "muy probablemente tenemos cobertura en tu zona" y continuar.
- Oficinas: Puerto La Cruz (Av. La Tinia, Qta. Cerro Alto #1) y Lechería (C.C. La Concha, Local 14).

PLANES DISPONIBLES:
${CATALOGO_TEXT}

Todos los precios son en USD. El cliente puede pagar en bolívares a la tasa BCV del día.
Los planes de Fibra Óptica (Beam) son simétricos (misma velocidad de subida y bajada).

HORARIO DE ATENCIÓN:
- Ventas: Lunes a Viernes 8:00 AM a 5:00 PM.
- El bot atiende 24/7, pero para agendar instalaciones el equipo opera en horario de oficina.

ETAPA ACTUAL DEL LEAD: ${currentStage}

FLUJO DE CONVERSACIÓN — Sigue este flujo según la etapa:

1. LEADS ENTRANTES → Saluda, preséntate como asesor de Wuipi, pregunta en qué puedes ayudar.
2. CALIFICACIÓN → Pregunta en qué ciudad/zona está y si busca internet para hogar o negocio.
3. PROPUESTA ENVIADA → Ya sabes qué busca. Recomienda planes según su necesidad. Si pregunta diferencias, compara. Si pregunta precios, da el precio en USD.
4. DATOS DE CONTRATACIÓN → El cliente quiere contratar. Pide los datos UNO A UNO, no todos juntos:
   - Nombre completo
   - Cédula (V, E, J o P seguido de números)
   - Teléfono de contacto
   - Dirección exacta de instalación
   - Plan seleccionado
   Cuando tengas todos los datos, envía un resumen para que confirme.
5. INSTALACIÓN PROGRAMADA → Los datos están completos. Dile que el equipo lo contactará para agendar.

REGLAS CRÍTICAS:
- Si el cliente dice algo agresivo, grosero o se frustra → responde con calma y ofrece conectar con un asesor humano.
- Si pregunta algo técnico complejo (configuración router, IP fija, VPN) → "Te conecto con nuestro equipo técnico para que te asesoren mejor."
- Si pide descuento o promoción → "Déjame consultar con el equipo comercial y te confirmo." (marcar needsHuman)
- Si es claramente spam o no es un lead real → responder cortésmente y despedirse.
- NUNCA des información de otros clientes ni datos internos de la empresa.
- NUNCA prometas fechas de instalación — eso lo decide el equipo.

FORMATO DE RESPUESTA:
Responde ÚNICAMENTE con un JSON válido, sin markdown ni texto adicional:
{
  "reply": "Tu mensaje al cliente aquí",
  "intent": "saludo|consulta_planes|consulta_cobertura|quiere_contratar|da_datos|pregunta_tecnica|no_interesado|spam|otro",
  "moveToStage": null,
  "fieldsDetected": {},
  "temperature": "frio",
  "needsHuman": false
}

Reglas del JSON:
- "reply": El mensaje que se envía al cliente. Solo texto plano para WhatsApp.
- "intent": La intención detectada en el mensaje del cliente.
- "moveToStage": Nombre de la etapa si debe avanzar, o null. Los nombres son:
  "calificacion", "propuesta_enviada", "datos_contratacion", "instalacion_programada", "ganado", "no_concretado".
  Solo avanza si hay información suficiente para la siguiente etapa. NUNCA retrocedas de etapa.
- "fieldsDetected": Datos que el cliente proporcionó en este mensaje. Solo incluye campos que detectes:
  ciudad, zona, tipoServicio ("hogar"/"pyme"), planInteres, nombre, cedula, telefono, direccion, comoNosConocio
- "temperature": "frio" (solo curioseando), "tibio" (interesado pero con dudas), "caliente" (quiere contratar)
- "needsHuman": true si necesita intervención de un vendedor humano.`;
}

interface BotResponse {
  reply: string;
  intent: string;
  moveToStage: string | null;
  fieldsDetected: Record<string, string>;
  temperature: string;
  needsHuman: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function callClaude(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<BotResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Claude no devolvió JSON: ${text.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]) as BotResponse;
}

// ============================================
// CONVERSACIONES DE PRUEBA
// ============================================

interface TestConversation {
  name: string;
  description: string;
  contact: { name: string; phone: string };
  channel: "whatsapp" | "instagram" | "facebook";
  messages: string[];
}

const TEST_CONVERSATIONS: TestConversation[] = [
  {
    name: "Lead caliente — flujo completo hasta instalacion",
    description: "Cliente que sabe lo que quiere y da todos los datos",
    contact: { name: "Maria Garcia Test", phone: "584141111111" },
    channel: "whatsapp",
    messages: [
      "Hola buenas tardes, quiero información sobre internet",
      "Estoy en Lechería, es para mi casa",
      "Cuanto cuesta el plan de 50 megas?",
      "Ok me interesa el Beam 50, quiero contratarlo",
      "Maria Garcia",
      "V-12345678",
      "0414-1111111",
      "Av. Principal de Lechería, Residencias El Sol, Apto 4B",
      "Si, confirmo todo correcto",
    ],
  },
  {
    name: "Lead tibio — compara y pide descuento",
    description: "Cliente interesado pero con dudas, pide promoción (escala a humano)",
    contact: { name: "Carlos Rodriguez Test", phone: "584242222222" },
    channel: "whatsapp",
    messages: [
      "Buenas, cuanto cuesta el internet?",
      "Barcelona, zona centro. Es para mi negocio, una tienda",
      "Y cual es la diferencia entre el Beam 50 y el Beam 100?",
      "Y tienen alguna promocion o descuento?",
    ],
  },
  {
    name: "Lead frio — fuera de cobertura",
    description: "Cliente de Caracas, no hay cobertura",
    contact: { name: "Ana Lopez Test", phone: "584123333333" },
    channel: "instagram",
    messages: [
      "Hola! tienen internet en Caracas?",
      "Y para cuando piensan llegar?",
    ],
  },
  {
    name: "Lead tecnico — escalamiento a humano",
    description: "Pregunta técnica compleja → needsHuman",
    contact: { name: "Jose Martinez Test", phone: "584164444444" },
    channel: "whatsapp",
    messages: [
      "Buenas, necesito internet con IP fija para un servidor que tengo en casa",
      "Y puedo configurar port forwarding y abrir puertos?",
    ],
  },
  {
    name: "Lead Facebook — conversacion minima",
    description: "Conversación corta por Facebook Messenger",
    contact: { name: "Pedro Perez Test", phone: "584175555555" },
    channel: "facebook",
    messages: [
      "hola cuanto es el internet?",
      "estoy en puerto la cruz, para mi casa",
    ],
  },
];

// ============================================
// COLORES
// ============================================
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
};

function p(color: string, text: string) {
  console.log(`${color}${text}${C.reset}`);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================
// CLEANUP — eliminar datos de test anteriores
// ============================================
async function cleanup() {
  p(C.gray, "\n  Limpiando datos de tests anteriores...");

  // Borrar mensajes de conversaciones de test
  const { data: testContacts } = await supabase
    .from("crm_contacts")
    .select("id")
    .like("display_name", "%Test");

  if (testContacts && testContacts.length > 0) {
    const contactIds = testContacts.map(c => c.id);

    // Get conversations for these contacts
    const { data: convs } = await supabase
      .from("inbox_conversations")
      .select("id")
      .in("contact_id", contactIds);

    if (convs && convs.length > 0) {
      const convIds = convs.map(c => c.id);
      await supabase.from("inbox_messages").delete().in("conversation_id", convIds);
      await supabase.from("inbox_conversations").delete().in("id", convIds);
    }

    await supabase.from("crm_contacts").delete().in("id", contactIds);
    p(C.gray, `  Eliminados: ${testContacts.length} contactos, ${convs?.length || 0} conversaciones`);
  } else {
    p(C.gray, "  Sin datos de test previos");
  }
}

// ============================================
// RUNNER
// ============================================

async function runConversation(test: TestConversation, dryRun: boolean) {
  p(C.bold + C.cyan, `\n${"━".repeat(60)}`);
  p(C.bold + C.cyan, `  ${test.name}`);
  p(C.gray, `  ${test.description}`);
  p(C.gray, `  Canal: ${test.channel} | Contacto: ${test.contact.name}`);
  p(C.cyan, `${"━".repeat(60)}`);

  // 1. Crear contacto
  const channelField = test.channel === "whatsapp" ? "wa_id"
    : test.channel === "instagram" ? "ig_id" : "fb_id";

  const { data: contact, error: contactErr } = await supabase
    .from("crm_contacts")
    .insert({
      display_name: test.contact.name,
      phone: test.contact.phone,
      [channelField]: test.contact.phone,
    })
    .select()
    .single();

  if (contactErr) {
    p(C.red, `  Error creando contacto: ${contactErr.message}`);
    return;
  }

  // 2. Crear conversación
  const { data: conversation, error: convErr } = await supabase
    .from("inbox_conversations")
    .insert({
      contact_id: contact.id,
      channel: test.channel,
      bot_active: true,
      status: "bot",
    })
    .select()
    .single();

  if (convErr) {
    p(C.red, `  Error creando conversación: ${convErr.message}`);
    return;
  }

  // 3. Recorrer mensajes
  let currentStage = "Leads Entrantes";
  const chatHistory: ChatMessage[] = [];
  const fieldsCollected: Record<string, string> = {};
  let lastTemperature = "frio";
  let escalatedToHuman = false;

  for (let i = 0; i < test.messages.length; i++) {
    const msg = test.messages[i];

    p(C.yellow, `\n  ┌─ Mensaje ${i + 1}/${test.messages.length}`);
    p(C.bold + C.white, `  │ 👤 "${msg}"`);

    // Guardar mensaje del cliente en DB
    await supabase.from("inbox_messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      sender_type: "contact",
      content: msg,
      status: "simulated",
    });

    if (dryRun) {
      p(C.gray, `  │ [dry-run] Mensaje guardado, sin llamar a Claude`);
      p(C.yellow, `  └─`);
      chatHistory.push({ role: "user", content: msg });
      continue;
    }

    if (escalatedToHuman) {
      p(C.gray, `  │ [bot desactivado — requería humano]`);
      p(C.yellow, `  └─`);
      continue;
    }

    // Llamar a Claude
    try {
      const systemPrompt = buildSystemPrompt(currentStage, test.channel);
      chatHistory.push({ role: "user", content: msg });

      const t0 = Date.now();
      const botRes = await callClaude(systemPrompt, chatHistory);
      const elapsed = Date.now() - t0;

      // Mostrar respuesta
      p(C.bold + C.green, `  │ 🤖 "${botRes.reply}"`);

      // Metadata en una linea
      const meta: string[] = [];
      meta.push(`intent=${botRes.intent}`);
      meta.push(`temp=${botRes.temperature}`);
      if (botRes.moveToStage) meta.push(`→ ${C.bold}${botRes.moveToStage}${C.reset}${C.gray}`);
      if (botRes.needsHuman) meta.push(`${C.red}NECESITA HUMANO${C.gray}`);
      meta.push(`${elapsed}ms`);
      p(C.gray, `  │ [${meta.join(" | ")}]`);

      // Campos detectados
      if (Object.keys(botRes.fieldsDetected).length > 0) {
        Object.assign(fieldsCollected, botRes.fieldsDetected);
        p(C.magenta, `  │ Campos: ${JSON.stringify(botRes.fieldsDetected)}`);
      }

      // Guardar respuesta del bot en DB
      await supabase.from("inbox_messages").insert({
        conversation_id: conversation.id,
        direction: "outbound",
        sender_type: "bot",
        content: botRes.reply,
        status: "simulated",
        metadata: {
          intent: botRes.intent,
          temperature: botRes.temperature,
          needsHuman: botRes.needsHuman,
          fieldsDetected: botRes.fieldsDetected,
          moveToStage: botRes.moveToStage,
        },
      });

      // Actualizar estado
      chatHistory.push({ role: "assistant", content: botRes.reply });
      lastTemperature = botRes.temperature;

      if (botRes.moveToStage) {
        currentStage = CRM_STAGE_DISPLAY[botRes.moveToStage] || botRes.moveToStage;
      }

      if (botRes.needsHuman) {
        escalatedToHuman = true;
        await supabase.from("inbox_conversations")
          .update({ status: "waiting", bot_active: false, temperature: botRes.temperature })
          .eq("id", conversation.id);
      } else {
        await supabase.from("inbox_conversations")
          .update({ temperature: botRes.temperature })
          .eq("id", conversation.id);
      }

    } catch (err: any) {
      p(C.red, `  │ ERROR: ${err.message}`);
    }

    p(C.yellow, `  └─`);

    // Pausa entre mensajes (rate limit de Claude)
    if (i < test.messages.length - 1 && !dryRun) {
      await sleep(1500);
    }
  }

  // Resumen
  p(C.bold + C.magenta, `\n  ┌─ RESUMEN`);
  p(C.magenta, `  │ Etapa final: ${currentStage}`);
  p(C.magenta, `  │ Temperatura: ${lastTemperature}`);
  p(C.magenta, `  │ Escalado a humano: ${escalatedToHuman ? "SÍ" : "No"}`);
  if (Object.keys(fieldsCollected).length > 0) {
    p(C.magenta, `  │ Datos recopilados:`);
    for (const [k, v] of Object.entries(fieldsCollected)) {
      p(C.magenta, `  │   ${k}: ${v}`);
    }
  }
  p(C.magenta, `  └─`);
}

// ============================================
// MAIN
// ============================================

async function main() {
  p(C.bold + C.blue, "\n  ╔══════════════════════════════════════════════╗");
  p(C.bold + C.blue, "  ║   BOT DE VENTAS WUIPI — Test Conversaciones  ║");
  p(C.bold + C.blue, "  ╚══════════════════════════════════════════════╝");
  p(C.gray, `  ${new Date().toLocaleString("es-VE")}`);

  // Validar env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    p(C.red, "  ERROR: Falta NEXT_PUBLIC_SUPABASE_URL en .env.local");
    process.exit(1);
  }
  if (!CLAUDE_API_KEY) {
    p(C.red, "  ERROR: Falta ANTHROPIC_API_KEY en .env.local");
    process.exit(1);
  }
  p(C.green, "  ✓ Supabase conectado");
  p(C.green, "  ✓ Claude API key presente");

  // Args
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const numArg = args.find(a => !a.startsWith("--"));

  if (dryRun) {
    p(C.yellow, "\n  MODO DRY-RUN: solo crea datos en Supabase, no llama a Claude");
  }

  // Cleanup
  await cleanup();

  // Seleccionar conversaciones
  let conversations = TEST_CONVERSATIONS;
  if (numArg) {
    const idx = parseInt(numArg);
    if (idx >= 1 && idx <= TEST_CONVERSATIONS.length) {
      conversations = [TEST_CONVERSATIONS[idx - 1]];
      p(C.gray, `\n  Corriendo solo test #${idx}`);
    } else {
      p(C.red, `  Test #${numArg} no existe (1-${TEST_CONVERSATIONS.length})`);
      process.exit(1);
    }
  } else {
    p(C.gray, `\n  Corriendo ${conversations.length} conversaciones`);
  }

  // Correr
  for (const conv of conversations) {
    await runConversation(conv, dryRun);
    if (!dryRun) await sleep(2000);
  }

  p(C.bold + C.blue, `\n  ══════════════════════════════════════════════`);
  p(C.bold + C.blue, `  Test completado.`);
  p(C.gray, `  Los datos quedaron en Supabase — ve a /ventas > Inbox para verlos.`);
  p(C.gray, `  Para limpiar: npx tsx scripts/test-bot-conversations.ts --clean`);
  p(C.blue, `  ══════════════════════════════════════════════\n`);
}

// Flag --clean solo limpia
if (process.argv.includes("--clean")) {
  cleanup().then(() => {
    p(C.green, "  Limpieza completada.\n");
    process.exit(0);
  });
} else {
  main().catch(err => {
    console.error("Error fatal:", err);
    process.exit(1);
  });
}
