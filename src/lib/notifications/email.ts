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
