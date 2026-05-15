// ============================================================
// Email Notifications — Resend
// Plantillas HTML para cobranzas WUIPI
// ============================================================

import { Resend } from "resend";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "cobros@wuipi.net";
const LOGO_URL = "https://api.wuipi.net/img/wuipi-logo.png";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

interface SendEmailParams {
  email: string;
  customerName: string;
  amountUsd: number;
  concept: string;
  invoiceNumber?: string;
  paymentUrl: string;
  isReminder?: boolean;
  reminderType?: "initial" | "48h" | "urgent";
}

// ── Shared fragments ──

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function headerBlock(gradient: string): string {
  return `
  <tr>
    <td align="center" style="background:${gradient};padding:40px 20px 32px;">
      <!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;"><v:fill type="gradient" color="#03318C" color2="#041a5e"/><v:textbox inset="0,0,0,0"><![endif]-->
      <table cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr>
          <td align="center">
            <img src="${LOGO_URL}" alt="WUIPI" width="120" style="display:block;border:0;outline:none;max-width:120px;height:auto;" />
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:12px;">
            <p style="margin:0;font-family:${FONT_STACK};font-size:15px;color:rgba(255,255,255,0.75);letter-spacing:1.5px;text-transform:uppercase;">Telecomunicaciones</p>
          </td>
        </tr>
      </table>
      <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
    </td>
  </tr>`;
}

const FOOTER = `
  <!-- WhatsApp help button -->
  <tr>
    <td style="padding:0 40px 28px;" class="inner-pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center">
          <a href="https://wa.me/584248800723" target="_blank" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-family:${FONT_STACK};font-size:13px;font-weight:600;">
            &#9742; &iquest;Necesitas ayuda? Escr&iacute;benos por WhatsApp
          </a>
        </td></tr>
      </table>
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e5e7eb;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
        <tr><td align="center">
          <p style="margin:0;font-family:${FONT_STACK};font-size:12px;color:#9ca3af;">WUIPI Telecomunicaciones &mdash; wuipi.net</p>
        </td></tr>
      </table>
    </td>
  </tr>`;

function wrapEmail(title: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0;mso-table-rspace:0}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
    body{margin:0;padding:0;width:100%!important;min-width:100%!important;background-color:#f0f2f5}
    @media only screen and (max-width:620px){
      .wrapper{width:100%!important;padding:12px!important}
      .inner-pad{padding:28px 24px!important}
      .amount-text{font-size:28px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:${FONT_STACK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5;">
    <tr><td align="center" style="padding:32px 16px;" class="wrapper">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        ${inner}
      </table>
      <!-- Unsubscribe hint -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:20px 0 0;">
          <p style="margin:0;font-family:${FONT_STACK};font-size:11px;color:#d1d5db;">
            Este correo fue enviado a {{email}} porque tienes un servicio activo con WUIPI.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Collection email (initial + reminders) ──

function buildCollectionEmailHtml(params: SendEmailParams): string {
  const { customerName, amountUsd, concept, invoiceNumber, paymentUrl, reminderType } = params;
  const isUrgent = reminderType === "urgent";
  const isReminder = reminderType === "48h" || reminderType === "urgent" || params.isReminder;

  // Title for <title> tag
  const title = isUrgent
    ? "Ultimo aviso de pago — WUIPI"
    : isReminder
    ? "Recordatorio de pago — WUIPI"
    : "Pago pendiente — WUIPI";

  // Body text
  const bodyText = isUrgent
    ? "Tu servicio de internet se suspende autom&aacute;ticamente despu&eacute;s del d&iacute;a 8 si no se registra el pago. Realiza tu pago cuanto antes para evitar interrupciones."
    : isReminder
    ? "Te recordamos amablemente que tu pago sigue pendiente. La fecha de corte es el d&iacute;a 8 &mdash; realiza tu pago para evitar la suspensi&oacute;n autom&aacute;tica del servicio."
    : "Te informamos que tienes un pago pendiente con WUIPI Telecomunicaciones. Puedes realizarlo de forma r&aacute;pida y segura desde nuestro portal de pagos.";

  // Urgent banner
  const urgentBanner = isUrgent ? `
  <tr>
    <td style="background:#fef2f2;padding:14px 40px;border-bottom:2px solid #fca5a5;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center">
            <p style="margin:0;font-family:${FONT_STACK};font-size:14px;color:#dc2626;font-weight:700;">
              &#9888;&#65039; &Uacute;ltimo aviso antes del corte
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>` : "";

  const inner = `
    ${headerBlock("linear-gradient(180deg, #03318C 0%, #041a5e 100%)")}
    ${urgentBanner}
    <!-- Body -->
    <tr>
      <td style="padding:40px 40px 0;" class="inner-pad">
        <p style="margin:0 0 20px;font-family:${FONT_STACK};font-size:17px;color:#1f2937;line-height:1.5;">
          Hola <strong>${customerName}</strong>,
        </p>
        <p style="margin:0 0 28px;font-family:${FONT_STACK};font-size:15px;color:#4b5563;line-height:1.6;">
          ${bodyText}
        </p>
      </td>
    </tr>
    <!-- Invoice card -->
    <tr>
      <td style="padding:0 40px;" class="inner-pad">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#03318C 0%,#041a5e 100%);border-radius:12px;overflow:hidden;">
          <tr><td style="padding:28px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <!-- Amount -->
              <tr><td align="center">
                <p style="margin:0 0 2px;font-family:${FONT_STACK};font-size:11px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:1.5px;">Monto a pagar</p>
                <p style="margin:0 0 4px;font-family:${FONT_STACK};font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-1px;" class="amount-text">$${amountUsd.toFixed(2)} <span style="font-size:16px;font-weight:400;color:rgba(255,255,255,0.7);">USD</span></p>
              </td></tr>
              <!-- Divider -->
              <tr><td style="padding:16px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="border-top:1px solid rgba(255,255,255,0.15);font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
              </td></tr>
              <!-- Details -->
              <tr><td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:4px 0;font-family:${FONT_STACK};font-size:12px;color:rgba(255,255,255,0.5);width:110px;" valign="top">Concepto</td>
                    <td style="padding:4px 0;font-family:${FONT_STACK};font-size:13px;color:#ffffff;font-weight:600;" valign="top">${concept}</td>
                  </tr>
                  ${invoiceNumber ? `<tr>
                    <td style="padding:4px 0;font-family:${FONT_STACK};font-size:12px;color:rgba(255,255,255,0.5);width:110px;" valign="top">Factura</td>
                    <td style="padding:4px 0;font-family:${FONT_STACK};font-size:13px;color:#ffffff;" valign="top">${invoiceNumber}</td>
                  </tr>` : ""}
                  <tr>
                    <td style="padding:4px 0;font-family:${FONT_STACK};font-size:12px;color:rgba(255,255,255,0.5);width:110px;" valign="top">Fecha de corte</td>
                    <td style="padding:4px 0;font-family:${FONT_STACK};font-size:13px;color:#fbbf24;font-weight:600;" valign="top">D&iacute;a 8 de cada mes</td>
                  </tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>
    <!-- CTA Button -->
    <tr>
      <td style="padding:32px 40px 0;" class="inner-pad">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${paymentUrl}" style="height:52px;v-text-anchor:middle;width:280px;" arcsize="15%" fillcolor="#F46800" stroke="f"><v:textbox inset="0,0,0,0"><center style="font-size:17px;font-weight:700;color:#ffffff;font-family:sans-serif;">Pagar ahora &rarr;</center></v:textbox></v:roundrect><![endif]-->
            <!--[if !mso]><!-->
            <a href="${paymentUrl}" target="_blank" style="display:inline-block;background:#F46800;color:#ffffff;text-decoration:none;padding:16px 56px;border-radius:10px;font-family:${FONT_STACK};font-size:17px;font-weight:700;letter-spacing:-0.3px;mso-hide:all;">
              Pagar ahora &rarr;
            </a>
            <!--<![endif]-->
          </td></tr>
        </table>
      </td>
    </tr>
    <!-- Payment methods -->
    <tr>
      <td style="padding:24px 40px 0;" class="inner-pad">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <p style="margin:0;font-family:${FONT_STACK};font-size:13px;color:#6b7280;line-height:1.5;">
              M&eacute;todos disponibles: <strong>D&eacute;bito Inmediato</strong> &middot; <strong>Transferencia Bancaria</strong> &middot; <strong>Tarjeta Internacional</strong>
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
    <!-- Security badge -->
    <tr>
      <td style="padding:16px 40px 0;" class="inner-pad">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border-radius:20px;">
              <tr><td style="padding:6px 16px;">
                <p style="margin:0;font-family:${FONT_STACK};font-size:12px;color:#16a34a;">
                  &#128274; Pago seguro y encriptado
                </p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>
    <!-- Disclaimer -->
    <tr>
      <td style="padding:20px 40px 36px;" class="inner-pad">
        <p style="margin:0;font-family:${FONT_STACK};font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">
          Si ya realizaste el pago, puedes ignorar este mensaje.
        </p>
      </td>
    </tr>
    ${FOOTER}`;

  return wrapEmail(title, inner).replace("{{email}}", params.email);
}

// ── Confirmation email ──

function buildConfirmationEmailHtml(params: {
  customerName: string;
  reference: string;
  amount: string;
  concept: string;
  email: string;
}): string {
  const inner = `
    ${headerBlock("linear-gradient(180deg, #059669 0%, #047857 100%)")}
    <!-- Body -->
    <tr>
      <td style="padding:40px 40px 0;text-align:center;" class="inner-pad">
        <!-- Check circle -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
          <tr><td align="center" style="width:72px;height:72px;background:#ecfdf5;border-radius:50%;border:3px solid #a7f3d0;">
            <p style="margin:0;font-size:36px;line-height:72px;color:#059669;">&#10003;</p>
          </td></tr>
        </table>
        <h2 style="margin:20px 0 8px;font-family:${FONT_STACK};font-size:24px;color:#1f2937;font-weight:700;">
          &iexcl;Pago recibido!
        </h2>
        <p style="margin:0 0 28px;font-family:${FONT_STACK};font-size:16px;color:#6b7280;">
          Hola <strong>${params.customerName}</strong>,
        </p>
      </td>
    </tr>
    <!-- Payment details card -->
    <tr>
      <td style="padding:0 40px;" class="inner-pad">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;">
          <tr><td style="padding:24px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:4px 0;font-family:${FONT_STACK};font-size:12px;color:#6b7280;width:100px;" valign="top">Referencia</td>
                <td style="padding:4px 0;font-family:${FONT_STACK};font-size:15px;color:#1f2937;font-weight:700;" valign="top">${params.reference}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-family:${FONT_STACK};font-size:12px;color:#6b7280;width:100px;" valign="top">Monto</td>
                <td style="padding:4px 0;font-family:${FONT_STACK};font-size:15px;color:#1f2937;font-weight:600;" valign="top">${params.amount}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-family:${FONT_STACK};font-size:12px;color:#6b7280;width:100px;" valign="top">Concepto</td>
                <td style="padding:4px 0;font-family:${FONT_STACK};font-size:14px;color:#374151;" valign="top">${params.concept}</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>
    <!-- Reassurance text -->
    <tr>
      <td style="padding:28px 40px 36px;" class="inner-pad">
        <p style="margin:0;font-family:${FONT_STACK};font-size:15px;color:#4b5563;line-height:1.6;text-align:center;">
          Ya no es necesaria ninguna acci&oacute;n de tu parte.<br>
          El registro del pago en nuestro sistema puede tomar algunas horas, pero <strong>tu servicio ya est&aacute; asegurado</strong>.
        </p>
      </td>
    </tr>
    ${FOOTER}`;

  return wrapEmail("Pago confirmado — WUIPI", inner).replace("{{email}}", params.email);
}

// ── Public API ──

export async function sendCollectionEmail(params: SendEmailParams): Promise<void> {
  console.log(`[Email] sendCollectionEmail: to=${params.email} name=${params.customerName} type=${params.reminderType ?? "initial"}`);

  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY is EMPTY — skipping send.");
    return;
  }

  const isUrgent = params.reminderType === "urgent";
  const isReminder = params.reminderType === "48h" || params.isReminder;

  const subject = isUrgent
    ? `Ultimo aviso: Pago pendiente — $${params.amountUsd.toFixed(2)} USD — WUIPI`
    : isReminder
    ? `Recordatorio: Pago pendiente — $${params.amountUsd.toFixed(2)} USD — WUIPI`
    : `Pago pendiente — $${params.amountUsd.toFixed(2)} USD — WUIPI Telecomunicaciones`;

  const result = await resend.emails.send({
    from: FROM_EMAIL,
    to: params.email,
    subject,
    html: buildCollectionEmailHtml(params),
  });
  console.log(`[Email] Resend response:`, JSON.stringify(result));
}

// ── Portal invite email ──

interface SendPortalInviteEmailParams {
  email: string;
  customerName: string;
  inviteUrl: string;
  totalDueUsd?: number; // Si > 0 mostramos el balance pendiente como hook
}

function buildPortalInviteEmailHtml(params: SendPortalInviteEmailParams): string {
  const { customerName, inviteUrl, totalDueUsd } = params;
  const firstName = customerName.split(" ")[0] || customerName;
  const hasDebt = typeof totalDueUsd === "number" && totalDueUsd > 0.01;

  // Banner contextual: si el cliente tiene deuda, lo enfatizamos en el hero
  // para subir el CTR ("ya tenes algo pendiente, entra y resolvelo"). Si esta
  // al dia, mensaje neutro de bienvenida.
  const heroSubtitle = hasDebt
    ? `Tienes <strong style="color:#fbbf24;">$${totalDueUsd!.toFixed(2)} USD</strong> pendiente. Resuélvelo en un clic.`
    : `Tu cuenta, tus facturas y tu pago — todo en un solo lugar.`;

  const inner = `
    ${headerBlock("linear-gradient(135deg, #03318C 0%, #4B44D4 50%, #F46800 100%)")}
    <!-- Hero -->
    <tr>
      <td style="padding:40px 40px 16px;text-align:center;" class="inner-pad">
        <h1 style="margin:0 0 8px;font-family:${FONT_STACK};font-size:28px;color:#1f2937;font-weight:800;letter-spacing:-0.5px;">
          Hola ${firstName} &#128075;
        </h1>
        <p style="margin:0;font-family:${FONT_STACK};font-size:16px;color:#4b5563;line-height:1.55;">
          ${heroSubtitle}
        </p>
      </td>
    </tr>

    <!-- Features card -->
    <tr>
      <td style="padding:24px 40px 0;" class="inner-pad">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:14px;border:1px solid #e5e7eb;">
          <tr>
            <td style="padding:24px 28px;">
              <p style="margin:0 0 18px;font-family:${FONT_STACK};font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">
                Tu portal personal incluye
              </p>
              <!-- Feature 1 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td width="40" valign="top" style="padding-right:14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="width:36px;height:36px;background:#dbeafe;border-radius:10px;text-align:center;line-height:36px;font-size:18px;">&#128196;</td></tr>
                    </table>
                  </td>
                  <td valign="top">
                    <p style="margin:0 0 2px;font-family:${FONT_STACK};font-size:15px;color:#1f2937;font-weight:700;">
                      Facturas y servicios
                    </p>
                    <p style="margin:0;font-family:${FONT_STACK};font-size:13px;color:#6b7280;line-height:1.5;">
                      Ver lo que debes, lo que ya pagaste y el detalle de cada cobro.
                    </p>
                  </td>
                </tr>
              </table>
              <!-- Feature 2 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td width="40" valign="top" style="padding-right:14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="width:36px;height:36px;background:#dcfce7;border-radius:10px;text-align:center;line-height:36px;font-size:18px;">&#128179;</td></tr>
                    </table>
                  </td>
                  <td valign="top">
                    <p style="margin:0 0 2px;font-family:${FONT_STACK};font-size:15px;color:#1f2937;font-weight:700;">
                      Pago en 1 clic
                    </p>
                    <p style="margin:0;font-family:${FONT_STACK};font-size:13px;color:#6b7280;line-height:1.5;">
                      En bolívares (Débito Inmediato, Transferencia) o en divisas (Tarjeta, PayPal).
                    </p>
                  </td>
                </tr>
              </table>
              <!-- Feature 3 -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="40" valign="top" style="padding-right:14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="width:36px;height:36px;background:#ede9fe;border-radius:10px;text-align:center;line-height:36px;font-size:18px;">&#129302;</td></tr>
                    </table>
                  </td>
                  <td valign="top">
                    <p style="margin:0 0 2px;font-family:${FONT_STACK};font-size:15px;color:#1f2937;font-weight:700;">
                      Soportín, tu asistente con IA
                    </p>
                    <p style="margin:0;font-family:${FONT_STACK};font-size:13px;color:#6b7280;line-height:1.5;">
                      Conoce tu cuenta. Pregúntale por tus facturas, plan, o problemas de conexión.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td style="padding:32px 40px 0;" class="inner-pad">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${inviteUrl}" style="height:54px;v-text-anchor:middle;width:280px;" arcsize="16%" fillcolor="#F46800" stroke="f"><v:textbox inset="0,0,0,0"><center style="font-size:17px;font-weight:700;color:#ffffff;font-family:sans-serif;">Entrar a mi portal &rarr;</center></v:textbox></v:roundrect><![endif]-->
            <!--[if !mso]><!-->
            <a href="${inviteUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#F46800 0%,#ff8534 100%);color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:12px;font-family:${FONT_STACK};font-size:17px;font-weight:700;letter-spacing:-0.3px;mso-hide:all;box-shadow:0 4px 14px rgba(244,104,0,0.35);">
              Entrar a mi portal &rarr;
            </a>
            <!--<![endif]-->
          </td></tr>
        </table>
        <p style="margin:14px 0 0;font-family:${FONT_STACK};font-size:12px;color:#9ca3af;text-align:center;line-height:1.5;">
          Sin contraseña. Sin descargar nada. El link te identifica automáticamente.
        </p>
      </td>
    </tr>

    <!-- Trust signals -->
    <tr>
      <td style="padding:32px 40px 0;" class="inner-pad">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #f1f5f9;">
          <tr><td style="padding-top:20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="33%" align="center" style="padding:0 4px;">
                  <p style="margin:0 0 4px;font-size:18px;line-height:1;">&#128274;</p>
                  <p style="margin:0;font-family:${FONT_STACK};font-size:11px;color:#6b7280;line-height:1.3;">Conexión segura</p>
                </td>
                <td width="33%" align="center" style="padding:0 4px;">
                  <p style="margin:0 0 4px;font-size:18px;line-height:1;">&#9889;</p>
                  <p style="margin:0;font-family:${FONT_STACK};font-size:11px;color:#6b7280;line-height:1.3;">Acceso inmediato</p>
                </td>
                <td width="33%" align="center" style="padding:0 4px;">
                  <p style="margin:0 0 4px;font-size:18px;line-height:1;">&#127757;</p>
                  <p style="margin:0;font-family:${FONT_STACK};font-size:11px;color:#6b7280;line-height:1.3;">Desde cualquier dispositivo</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>

    <!-- Disclaimer -->
    <tr>
      <td style="padding:24px 40px 32px;" class="inner-pad">
        <p style="margin:0;font-family:${FONT_STACK};font-size:12px;color:#9ca3af;text-align:center;line-height:1.55;">
          Este link es personal y permanente — podes guardarlo para volver cuando quieras.
        </p>
      </td>
    </tr>
    ${FOOTER}`;

  return wrapEmail("Tu Portal Wuipi te esta esperando", inner).replace("{{email}}", params.email);
}

export async function sendPortalInviteEmail(params: SendPortalInviteEmailParams): Promise<{ ok: boolean; id?: string; error?: string }> {
  console.log(`[Email] sendPortalInviteEmail: to=${params.email} name=${params.customerName}`);

  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY is EMPTY — skipping portal invite send.");
    return { ok: false, error: "Resend not configured" };
  }

  const subject = typeof params.totalDueUsd === "number" && params.totalDueUsd > 0.01
    ? `${params.customerName.split(" ")[0]}, tu Portal Wuipi te espera (saldo $${params.totalDueUsd.toFixed(2)})`
    : `Te damos la bienvenida a tu Portal Wuipi`;

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.email,
      subject,
      html: buildPortalInviteEmailHtml(params),
    });
    if (result.error) {
      console.error("[Email] sendPortalInviteEmail Resend error:", result.error);
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[Email] sendPortalInviteEmail exception:", msg);
    return { ok: false, error: msg };
  }
}

export async function sendPaymentConfirmationEmail(params: {
  email: string;
  customerName: string;
  reference: string;
  amount: string;
  concept: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: params.email,
    subject: `Pago confirmado — Ref: ${params.reference} — WUIPI Telecomunicaciones`,
    html: buildConfirmationEmailHtml(params),
  });
}
