import { NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { nextSequence } from "@/lib/dal/facturacion";
import { apiSuccess, apiError, apiServerError } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

interface ImportClient {
  legal_name: string;
  document_type?: string;
  document_number?: string;
  email?: string;
  phone?: string;
  phone_alt?: string;
  address?: string;
  city?: string;
  state?: string;
  sector?: string;
  nodo?: string;
  service_ip?: string;
  service_mac?: string;
  service_node_code?: string;
  service_technology?: string;
  service_vlan?: string;
  service_router?: string;
  plan_name?: string;
  plan_speed_down?: number;
  plan_speed_up?: number;
  monthly_rate?: number;
  service_status?: string;
  [key: string]: any;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clients: ImportClient[] = body.clients;

    if (!Array.isArray(clients) || clients.length === 0) {
      return apiError("Se requiere un array de clientes", 400);
    }
    if (clients.length > 500) {
      return apiError("Máximo 500 clientes por importación", 400);
    }

    const supabase = createAdminSupabase();
    const results = { created: 0, updated: 0, errors: [] as Array<{ row: number; error: string }> };

    for (let i = 0; i < clients.length; i++) {
      const raw = clients[i];

      // Validate required field
      if (!raw.legal_name || !raw.legal_name.trim()) {
        results.errors.push({ row: i + 1, error: "Nombre (legal_name) es obligatorio" });
        continue;
      }

      // Clean nullish values
      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) {
        cleaned[k] = v === "" || v === undefined ? null : v;
      }

      // Defaults
      cleaned.document_type = cleaned.document_type || "V";
      cleaned.document_number = cleaned.document_number || "000";
      cleaned.service_status = cleaned.service_status || "active";
      cleaned.billing_currency = cleaned.billing_currency || "USD";
      cleaned.billing_day = cleaned.billing_day || 1;
      cleaned.is_deleted = false;

      // Numeric conversions
      if (cleaned.plan_speed_down) cleaned.plan_speed_down = Number(cleaned.plan_speed_down) || null;
      if (cleaned.plan_speed_up) cleaned.plan_speed_up = Number(cleaned.plan_speed_up) || null;
      if (cleaned.monthly_rate) cleaned.monthly_rate = Number(cleaned.monthly_rate) || null;

      try {
        // Check if document_number exists (for upsert)
        if (cleaned.document_number && cleaned.document_number !== "000") {
          const { data: existing } = await supabase
            .from("clients")
            .select("id")
            .eq("document_number", cleaned.document_number)
            .eq("document_type", cleaned.document_type)
            .eq("is_deleted", false)
            .maybeSingle();

          if (existing) {
            // Update existing
            const { id: _id, code: _code, created_at: _ca, ...updateData } = cleaned;
            const { error } = await supabase
              .from("clients")
              .update(updateData)
              .eq("id", existing.id);
            if (error) throw new Error(error.message);
            results.updated++;
            continue;
          }
        }

        // Create new
        const code = await nextSequence("client");
        const { error } = await supabase
          .from("clients")
          .insert({ ...cleaned, code });
        if (error) throw new Error(error.message);
        results.created++;
      } catch (err: any) {
        results.errors.push({ row: i + 1, error: err.message });
      }
    }

    return apiSuccess(results);
  } catch (error) {
    return apiServerError(error);
  }
}
