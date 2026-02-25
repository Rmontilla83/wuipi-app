import { NextResponse } from "next/server";
import { getPipelines, getUsers, getLeads, isConfigured } from "@/lib/integrations/kommo";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Kommo not configured" }, { status: 500 });
  }

  try {
    const [pipelines, users, leads] = await Promise.allSettled([
      getPipelines(),
      getUsers(),
      getLeads(1, 5),
    ]);

    return NextResponse.json({
      pipelines: pipelines.status === "fulfilled" ? pipelines.value : pipelines.reason?.message,
      users: users.status === "fulfilled" ? users.value : users.reason?.message,
      leads_sample: leads.status === "fulfilled" ? leads.value : leads.reason?.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
