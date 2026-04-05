import { NextRequest, NextResponse } from "next/server";
import { getOdooClientDetail } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SOPORTIN_PROMPT = `Eres Soportín, el asistente virtual de Wuipi Telecomunicaciones. Hablas español de Venezuela.

PERSONALIDAD:
- Servicial, empático y conversador. No eres un menú de opciones.
- Tono cercano y amigable como un vecino que sabe de tecnología.
- Puedes usar expresiones venezolanas ocasionalmente (vale, chamo, dale, tranqui).
- Si el cliente está frustrado, reconoce su frustración PRIMERO.
- Responde en máximo 4 oraciones por mensaje. Sé conciso pero cálido.
- Emojis moderados (1-2 por mensaje máximo).

SOBRE WUIPI:
- ISP en Anzoátegui, Venezuela. +8 años de experiencia.
- Oficinas: Puerto La Cruz (Av. La Tinia, Qta. Cerro Alto #1) y Lechería (C.C. La Concha, Local 14).
- Teléfono: +58 281 7721141

DEPARTAMENTOS:
1. SOPORTE TÉCNICO (+58 424 8800794) — Problemas de conexión, lentitud. Lun-Dom 8AM-12AM.
2. CUENTAS POR COBRAR (+58 424 8800723) — Saldo, facturas, pagos. Lun-Vie 8AM-5PM.
3. VENTAS (+58 424 8800765) — Nuevas contrataciones, cambio de plan. Lun-Vie 8AM-5PM.

CONTEXTO ESPECIAL — PORTAL DE CLIENTES:
Estás dentro del portal de clientes de Wuipi. El cliente YA está autenticado y tienes acceso a TODA su información real. Usa estos datos para responder con precision:

{CLIENT_DATA}

CON ESTA INFORMACIÓN PUEDES:
- Explicar cada factura: qué incluye, cuánto debe, qué ya pagó
- Decir el saldo exacto y cuántas facturas pendientes tiene
- Explicar los servicios activos, su velocidad y precio
- Si tiene servicios suspendidos, explicar por qué y qué hacer
- Hablar de sus pagos recientes y si están reflejados
- Si pregunta por cambio de plan, decirle qué plan tiene ahora y las opciones

REGLAS:
- NUNCA inventes datos. Usa SOLO la información del cliente proporcionada.
- Si el cliente pregunta algo que no ves en sus datos, dile que contacte al departamento correspondiente.
- Para problemas técnicos: intenta ayudar primero (reiniciar router, etc.), luego ofrece WhatsApp de soporte.
- No muestres tags [HANDOFF] al cliente.
- Solo temas de Wuipi. Si preguntan otra cosa, redirige amablemente.

TRANSFERENCIA A HUMANO:
Si el cliente necesita hablar con un humano, dale el número de WhatsApp del departamento correcto:
- Problemas técnicos → Soporte: +58 424 8800794
- Facturas/pagos → Cuentas: +58 424 8800723
- Cambio de plan/nueva contratación → Ventas: +58 424 8800765`;

function buildClientContext(detail: any): string {
  const parts: string[] = [];

  // Basic info
  parts.push(`CLIENTE: ${detail.name}`);
  if (detail.email) parts.push(`Email: ${detail.email}`);
  if (detail.mobile || detail.phone) parts.push(`Telefono: ${detail.mobile || detail.phone}`);
  if (detail.city) parts.push(`Ubicacion: ${detail.city}${detail.state ? `, ${detail.state}` : ""}`);

  // Balance
  parts.push(`\nSALDO:`);
  parts.push(`- Deuda total: $${detail.total_due || 0} USD`);
  if (detail.credit < 0) parts.push(`- Saldo a favor: Bs ${Math.abs(detail.credit).toFixed(2)}`);

  // Subscriptions / Services
  if (detail.subscriptions?.length > 0) {
    parts.push(`\nSERVICIOS (${detail.subscriptions.length} suscripcion${detail.subscriptions.length > 1 ? "es" : ""}):`);
    for (const sub of detail.subscriptions) {
      const state = sub.state === "3_progress" ? "Activo" : sub.state === "4_paused" ? "Pausado" : sub.state;
      parts.push(`- ${sub.name} (${state})`);
      if (sub.lines?.length > 0) {
        for (const line of sub.lines) {
          parts.push(`  · ${line.product_name}: $${line.price_unit}/mes${line.service_state === "suspended" ? " [SUSPENDIDO]" : ""}`);
        }
      }
      parts.push(`  Recurrente mensual: $${sub.recurring_monthly}`);
      if (sub.next_invoice_date) parts.push(`  Proxima factura: ${sub.next_invoice_date}`);
    }
  }

  // Pending invoices
  const pendingInvoices = detail.invoices?.filter((i: any) => i.amount_due > 0) || [];
  if (pendingInvoices.length > 0) {
    parts.push(`\nFACTURAS PENDIENTES (${pendingInvoices.length}):`);
    for (const inv of pendingInvoices.slice(0, 10)) {
      const products = inv.products?.join(", ") || inv.lines?.map((l: any) => l.product_name).join(", ") || "";
      parts.push(`- ${inv.invoice_number}: $${inv.amount_due} ${inv.currency} — vence ${inv.due_date}${products ? ` (${products})` : ""}`);
    }
  }

  // Paid invoices (recent)
  const paidInvoices = detail.invoices?.filter((i: any) => i.amount_due === 0 || i.payment_state === "paid") || [];
  if (paidInvoices.length > 0) {
    parts.push(`\nFACTURAS PAGADAS (ultimas ${Math.min(paidInvoices.length, 5)}):`);
    for (const inv of paidInvoices.slice(0, 5)) {
      parts.push(`- ${inv.invoice_number}: $${inv.total} ${inv.currency} — ${inv.invoice_date}`);
    }
  }

  // Recent payments
  if (detail.payments?.length > 0) {
    parts.push(`\nPAGOS RECIENTES (ultimos ${Math.min(detail.payments.length, 5)}):`);
    for (const pay of detail.payments.slice(0, 5)) {
      parts.push(`- ${pay.date}: ${pay.currency === "USD" ? "$" : "Bs "}${pay.amount} via ${pay.journal}${pay.ref ? ` (ref: ${pay.ref})` : ""}`);
    }
  }

  return parts.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const { message, history, partnerId } = await request.json();

    if (!message || !partnerId) {
      return NextResponse.json({ error: "message and partnerId required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    // Fetch client data from Odoo
    let clientContext = "No se pudieron cargar los datos del cliente.";
    try {
      const detail = await getOdooClientDetail(partnerId);
      clientContext = buildClientContext(detail);
    } catch (err) {
      console.error("[Soportin] Error fetching client data:", err);
    }

    // Build system prompt with client data
    const systemPrompt = SOPORTIN_PROMPT.replace("{CLIENT_DATA}", clientContext);

    // Build messages
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (history?.length) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role === "user" ? "user" : "assistant", content: msg.content });
      }
    }
    messages.push({ role: "user", content: message });

    // Call Claude
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Soportin] Claude ${res.status}:`, errText.slice(0, 200));
      return NextResponse.json({ error: "Error del asistente" }, { status: 500 });
    }

    const data = await res.json();
    const content = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    // Strip any [HANDOFF:...] tags from visible response
    const cleanContent = content.replace(/\[HANDOFF:[^\]]*\]/g, "").trim();

    return NextResponse.json({ content: cleanContent });
  } catch (error) {
    console.error("[Soportin] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
