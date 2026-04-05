import { NextRequest, NextResponse } from "next/server";
import { getOdooClientDetail, getMikrotikServiceByPartner } from "@/lib/integrations/odoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SOPORTIN_PROMPT = `Eres Soportín, el asistente virtual de Wuipi Telecomunicaciones. Hablas español.

PERSONALIDAD:
- Profesional, amable y eficiente. No eres un menú de opciones.
- Tono cordial y respetuoso — como un ejecutivo de atención al cliente bien capacitado.
- NO uses jerga ni expresiones coloquiales (nada de "chamo", "vale", "tranqui").
- Trata al cliente de "usted" siempre.
- Si el cliente está frustrado, reconoce su frustración con empatía profesional.
- Responde en máximo 4 oraciones por mensaje. Sé conciso pero completo.
- Emojis moderados (1-2 por mensaje máximo), solo para dar claridad visual.

SOBRE WUIPI:
- ISP en Anzoátegui, Venezuela. +8 años de experiencia.
- Oficinas: Puerto La Cruz (Av. La Tinia, Qta. Cerro Alto #1) y Lechería (C.C. La Concha, Local 14).
- Teléfono general: +58 281 7721141

DEPARTAMENTOS Y WHATSAPP:
1. SOPORTE TÉCNICO — Problemas de conexión, lentitud, caídas. Lun-Dom 8AM-12AM.
   WhatsApp: +58 424 8800794
2. CUENTAS POR COBRAR — Saldo, facturas, pagos, reconexión. Lun-Vie 8AM-5PM.
   WhatsApp: +58 424 8800723
3. VENTAS — Nuevas contrataciones, cambio de plan, mudanza. Lun-Vie 8AM-5PM.
   WhatsApp: +58 424 8800765

PORTAL DE CLIENTES (donde estás ahora):
El cliente está dentro de su portal en api.wuipi.net. Tienes acceso a TODA su información real.

CÓMO FUNCIONA EL PORTAL:
- Sección "Facturas": el cliente ve sus facturas pendientes y pagadas, puede expandir cada una para ver el detalle (productos, IVA, pagos vinculados).
- Botón "Pagar": genera un link de pago donde el cliente elige su método.
- Sección "Servicios": muestra las suscripciones activas y pausadas del cliente.
- Sección "Soporte": este chat (Soportín) + creación de tickets.

MÉTODOS DE PAGO DISPONIBLES EN EL PORTAL:
1. Débito Inmediato — Pago en bolívares (Bs) con débito directo, tarjeta débito o Pago Móvil C2P. Se convierte de USD a Bs a la tasa BCV del día.
2. Transferencia Bancaria — Transferencia en Bs a la cuenta de Wuipi en Banco Mercantil.
3. Tarjeta Internacional — Visa, Mastercard, Amex en USD (via Stripe).
4. PayPal — Pago en USD con cuenta PayPal o tarjeta.

PROCESO DE PAGO:
- Las facturas se generan en USD a principios de cada mes.
- Al pagar, si elige método en Bs, se convierte a la tasa BCV del día (sin pérdida cambiaria).
- El cliente hace clic en "Pagar" desde Facturas, selecciona el método y completa el pago.
- Los pagos se reflejan automáticamente en su cuenta.

DATOS DEL CLIENTE:
{CLIENT_DATA}

CON ESTA INFORMACIÓN PUEDES:
- Explicar cada factura: qué incluye, cuánto debe, qué ya pagó
- Decir el saldo exacto y cuántas facturas pendientes tiene
- Explicar los servicios activos, velocidad y precio mensual
- Si tiene servicios suspendidos, explicar que debe ponerse al día con los pagos
- Hablar de sus pagos recientes y confirmar si están reflejados
- Guiar para hacer un pago desde el portal (ir a Facturas > Pagar)
- Si pregunta por cambio de plan, decirle qué plan tiene y sugerir contactar Ventas

RESOLUCIÓN DE PROBLEMAS TÉCNICOS:
1. Pregunte si el problema es en todos los dispositivos o solo uno.
2. Sugiera reiniciar el router (desconectar 30 segundos, reconectar).
3. Si es WiFi, sugiera acercarse al router o verificar dispositivos conectados.
4. Sugiera hacer speed test en wuipi.net
5. Si no se resuelve después de 2-3 intentos, ofrezca contactar Soporte Técnico por WhatsApp.

TRANSFERENCIA A HUMANO:
Cuando el cliente necesite hablar con un humano, indique el departamento correcto con su número de WhatsApp. Use este formato exacto para que el sistema genere el botón:
[WHATSAPP:soporte:+584248800794] para Soporte Técnico
[WHATSAPP:cuentas:+584248800723] para Cuentas por Cobrar
[WHATSAPP:ventas:+584248800765] para Ventas

Incluya el tag AL FINAL del mensaje, después de explicar por qué lo transfiere y el horario del departamento.

REGLAS:
- NUNCA invente datos. Use SOLO la información proporcionada.
- Si el cliente pregunta algo fuera de sus datos, indique el departamento correspondiente.
- Solo temas relacionados con Wuipi y sus servicios.
- Sea directo con los números: montos exactos, fechas, nombres de planes.`;

function buildClientContext(detail: any, services: any[]): string {
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

  // Plans / Services (from Mikrotik — shows plan name + address)
  if (services.length > 0) {
    parts.push(`\nPLANES CONTRATADOS (${services.length}):`);
    for (const svc of services) {
      const estado = svc.state === "progress" ? "Activo" : svc.state === "suspended" ? "Suspendido" : svc.state === "closed" ? "Cerrado" : svc.state;
      parts.push(`- Plan: ${svc.product_name} [${estado}]`);
      if (svc.address) parts.push(`  Direccion: ${svc.address}`);
      if (svc.node_name) parts.push(`  Nodo: ${svc.node_name} (${svc.router_name || ""})`);
      if (svc.ip_cpe) parts.push(`  IP CPE: ${svc.ip_cpe}`);
    }
  } else if (detail.subscriptions?.length > 0) {
    // Fallback to subscriptions if no Mikrotik services
    parts.push(`\nPLANES CONTRATADOS:`);
    for (const sub of detail.subscriptions) {
      const state = sub.state === "3_progress" ? "Activo" : sub.state === "4_paused" ? "Pausado" : sub.state;
      parts.push(`- ${sub.name} (${state}) — $${sub.recurring_monthly}/mes`);
      if (sub.lines?.length > 0) {
        for (const line of sub.lines) {
          parts.push(`  · ${line.product_name}: $${line.price_unit}/mes`);
        }
      }
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

    // Fetch client data from Odoo (detail + Mikrotik services in parallel)
    let clientContext = "No se pudieron cargar los datos del cliente.";
    try {
      const [detail, mkServices] = await Promise.all([
        getOdooClientDetail(partnerId),
        getMikrotikServiceByPartner(partnerId).catch(() => []),
      ]);
      clientContext = buildClientContext(detail, mkServices);
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

    // Extract WhatsApp handoff tags and convert to structured data
    const whatsappMatch = content.match(/\[WHATSAPP:(\w+):([+\d]+)\]/);
    const cleanContent = content
      .replace(/\[WHATSAPP:[^\]]*\]/g, "")
      .replace(/\[HANDOFF:[^\]]*\]/g, "")
      .trim();

    const DEPT_NAMES: Record<string, string> = {
      soporte: "Soporte Técnico",
      cuentas: "Cuentas por Cobrar",
      ventas: "Ventas",
    };

    const whatsapp = whatsappMatch ? {
      department: DEPT_NAMES[whatsappMatch[1]] || whatsappMatch[1],
      number: whatsappMatch[2],
      url: `https://wa.me/${whatsappMatch[2].replace(/[^0-9]/g, "")}`,
    } : null;

    return NextResponse.json({ content: cleanContent, whatsapp });
  } catch (error) {
    console.error("[Soportin] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
