// ============================================================
// Email Notifications — Resend
// ============================================================

import { Resend } from "resend";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "cobros@wuipi.net";

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
}

function buildCollectionEmailHtml(params: SendEmailParams): string {
  const { customerName, amountUsd, concept, invoiceNumber, paymentUrl, isReminder } = params;
  const subject = isReminder ? "Recordatorio de pago pendiente" : "Nuevo cobro";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject} — WUIPI</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#03318C,#060633);padding:32px 40px;text-align:center;">
              <img src="https://wuipi-app.vercel.app/img/wuipi-logo.png" alt="WUIPI" width="80" height="80" style="display:block;margin:0 auto 8px;" />
              <p style="color:rgba(255,255,255,0.8);margin:0;font-size:14px;">Telecomunicaciones</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="color:#060633;margin:0 0 8px;font-size:20px;">${isReminder ? "Recordatorio de pago" : "Tienes un cobro pendiente"}</h2>
              <p style="color:#6b7280;margin:0 0 24px;font-size:15px;">Hola ${customerName},</p>

              <!-- Amount card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="color:#6b7280;margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Monto a pagar</p>
                    <p style="color:#060633;margin:0 0 16px;font-size:32px;font-weight:700;">$${amountUsd.toFixed(2)} <span style="font-size:16px;color:#6b7280;">USD</span></p>
                    <p style="color:#374151;margin:0;font-size:14px;">📋 ${concept}</p>
                    ${invoiceNumber ? `<p style="color:#6b7280;margin:4px 0 0;font-size:13px;">Factura: ${invoiceNumber}</p>` : ""}
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${paymentUrl}" style="display:inline-block;background:#F46800;color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:-0.3px;">
                      Pagar ahora
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#6b7280;margin:0 0 8px;font-size:13px;text-align:center;">
                Aceptamos débito inmediato, transferencia bancaria y tarjeta internacional.
              </p>
              <p style="color:#9ca3af;margin:0;font-size:12px;text-align:center;">
                Si ya realizaste el pago, puedes ignorar este mensaje.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="color:#9ca3af;margin:0;font-size:12px;">
                WUIPI Telecomunicaciones — wuipi.net<br>
                Soporte: soporte@wuipi.net
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendCollectionEmail(params: SendEmailParams): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not configured, skipping send");
    return;
  }

  const subject = params.isReminder
    ? `Recordatorio: Cobro pendiente — $${params.amountUsd.toFixed(2)} USD`
    : `Cobro pendiente — $${params.amountUsd.toFixed(2)} USD — WUIPI`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: params.email,
    subject,
    html: buildCollectionEmailHtml(params),
  });
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

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#03318C,#060633);padding:32px 40px;text-align:center;">
          <img src="https://wuipi-app.vercel.app/img/wuipi-logo.png" alt="WUIPI" width="80" height="80" style="display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="padding:40px;text-align:center;">
          <div style="width:64px;height:64px;background:#10b981;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
            <span style="color:#fff;font-size:32px;">✓</span>
          </div>
          <h2 style="color:#060633;margin:0 0 8px;">¡Pago recibido!</h2>
          <p style="color:#6b7280;margin:0 0 24px;">Hola ${params.customerName},</p>
          <table width="100%" style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;margin-bottom:24px;">
            <tr><td style="padding:24px;">
              <p style="color:#6b7280;margin:0 0 4px;font-size:12px;">REFERENCIA</p>
              <p style="color:#060633;margin:0 0 12px;font-size:18px;font-weight:700;">${params.reference}</p>
              <p style="color:#374151;margin:0;font-size:14px;">Monto: ${params.amount}</p>
              <p style="color:#6b7280;margin:4px 0 0;font-size:13px;">${params.concept}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="color:#9ca3af;margin:0;font-size:12px;">WUIPI Telecomunicaciones — wuipi.net</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: params.email,
    subject: `✅ Pago confirmado — Ref: ${params.reference} — WUIPI`,
    html,
  });
}
