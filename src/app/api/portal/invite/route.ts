// POST /api/portal/invite
//
// Admin-only endpoint that sends a portal invitation to a customer via the
// channels they have on file (WhatsApp and/or Email). The invitation contains
// a permanent portal-invite token (HMAC); the customer clicks the button and
// /portal/invite/[token] handles the rest (Magic Link generation + session).
//
// Body:
//   {
//     partnerId: number,                       // Odoo res.partner id
//     channels?: ('whatsapp'|'email')[],       // defaults to both
//     phoneOverride?: string,                  // override Odoo phone (testing)
//     emailOverride?: string,                  // override Odoo email (testing)
//   }
//
// Behavior:
//   - Hard requirement: partner must have a valid email on file (or override).
//     Otherwise 400 — by policy, the invite is not sent because the customer
//     would land on the login screen and have to type their email anyway,
//     defeating the "one click" promise.
//   - WhatsApp is best-effort: if phone is missing or fails, we still try email.
//   - Returns per-channel result so the UI can show "WA enviado, email falló" etc.

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";
import { requirePermission, getCallerProfile } from "@/lib/auth/check-permission";
import { searchRead, isOdooConfigured } from "@/lib/integrations/odoo";
import { generatePortalInviteToken } from "@/lib/utils/portal-invite-token";
import { sendCobranzasWA } from "@/lib/cobranzas/wa-cobranzas";
import { sendPortalInviteEmail } from "@/lib/notifications/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://api.wuipi.net";

interface InviteBody {
  partnerId?: number;
  channels?: Array<"whatsapp" | "email">;
  phoneOverride?: string;
  emailOverride?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Permission: this is sent from the admin's "Invitar al portal" button
    // in the cliente detail page. Reusing cobranzas:send keeps RBAC consistent
    // with the existing "Enviar por WA" button right next to it.
    let caller = await requirePermission("cobranzas", "send");
    if (!caller) {
      caller = await requirePermission("cobranzas", "update");
    }
    // Last fallback: any authenticated admin (e.g. super_admin not explicitly
    // in cobranzas:send). The dashboard-side validation in the modal already
    // restricts this UI to staff users.
    if (!caller) {
      const profile = await getCallerProfile();
      if (!profile || profile.role === "cliente") {
        return apiError("Sin permisos", 403);
      }
      caller = profile;
    }

    if (!isOdooConfigured()) {
      return apiError("Odoo no esta configurado", 503);
    }

    const body = (await request.json().catch(() => ({}))) as InviteBody;
    const partnerId = Number(body.partnerId);
    if (!partnerId || partnerId <= 0) {
      return apiError("partnerId invalido", 400);
    }

    const channels = Array.isArray(body.channels) && body.channels.length > 0
      ? body.channels.filter((c) => c === "whatsapp" || c === "email")
      : (["whatsapp", "email"] as const);

    // Lookup partner from Odoo (single source of truth for contact info).
    const partners = await searchRead("res.partner", [
      ["id", "=", partnerId],
    ], {
      fields: ["id", "name", "mobile", "phone", "email", "total_due"],
      limit: 1,
    });
    const partner = partners[0];
    if (!partner) {
      return apiError("Cliente no encontrado en Odoo", 404);
    }

    const email = (body.emailOverride || partner.email || "").toString().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Hard fail: por politica no enviamos invitacion sin email valido.
      return apiError(
        "Este cliente no tiene email registrado en Odoo. Pedile el correo y cargalo en su ficha antes de invitarlo al portal.",
        400
      );
    }

    const phone = (body.phoneOverride || partner.mobile || partner.phone || "").toString().trim();
    const phoneValid = phone && phone.replace(/\D/g, "").length >= 10;
    const customerName = (partner.name || "Cliente").toString();
    const totalDueUsd = Number(partner.total_due) > 0 ? Number(partner.total_due) : undefined;

    // Generate the permanent invite token. Embedded in WA button URL and
    // email CTA. The customer never sees this string directly — it's all
    // hidden behind the button label.
    const inviteToken = generatePortalInviteToken(partnerId);
    const inviteUrl = `${APP_URL}/portal/invite/${inviteToken}`;

    const result: {
      partnerId: number;
      email_used: string;
      phone_used: string | null;
      invite_url: string;
      whatsapp: { attempted: boolean; ok: boolean; outbox_id?: string; status?: string; error?: string; dry_run?: boolean } | null;
      email: { attempted: boolean; ok: boolean; id?: string; error?: string } | null;
    } = {
      partnerId,
      email_used: email,
      phone_used: phoneValid ? phone : null,
      invite_url: inviteUrl,
      whatsapp: null,
      email: null,
    };

    // ---- WhatsApp ----
    if (channels.includes("whatsapp")) {
      if (!phoneValid) {
        result.whatsapp = {
          attempted: false,
          ok: false,
          error: "Cliente sin telefono valido en Odoo",
        };
      } else {
        const wa = await sendCobranzasWA({
          phone,
          customerName,
          template: "invitacion_portal",
          params: {
            "1": customerName,
            // Used by the fallback text only — never sent to Meta as a body param
            // because buildMetaPayload filters non-numeric keys.
            portal_url: inviteUrl,
          },
          buttonUrlParams: [inviteToken],
          triggerEvent: "portal_invite",
          // Transactional: siempre real, independiente de COBRANZAS_WA_DRY_RUN.
          // El riel masivo de cobranzas sigue su propio rollout cuando vos
          // cambies la env global; la invitacion al portal no espera por eso.
          forceLive: true,
        });
        result.whatsapp = {
          attempted: true,
          ok: wa.ok,
          outbox_id: wa.outboxId,
          status: wa.status,
          error: wa.error,
          dry_run: wa.dryRun,
        };
      }
    }

    // ---- Email ----
    if (channels.includes("email")) {
      const em = await sendPortalInviteEmail({
        email,
        customerName,
        inviteUrl,
        totalDueUsd,
      });
      result.email = {
        attempted: true,
        ok: em.ok,
        id: em.id,
        error: em.error,
      };
    }

    return apiSuccess(result);
  } catch (err) {
    return apiServerError(err);
  }
}
