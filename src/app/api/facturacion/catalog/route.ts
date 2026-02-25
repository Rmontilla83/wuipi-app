import { NextRequest, NextResponse } from "next/server";
import { getPlans, getServices, getPaymentMethods, createPlan, createService, updatePlan, updateService } from "@/lib/dal/facturacion";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";

    const result: any = {};
    if (type === "all" || type === "plans") result.plans = await getPlans();
    if (type === "all" || type === "services") result.services = await getServices();
    if (type === "all" || type === "payment_methods") result.payment_methods = await getPaymentMethods();

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, ...data } = body;

    if (type === "plan") {
      const plan = await createPlan(data);
      return NextResponse.json(plan, { status: 201 });
    }
    if (type === "service") {
      const service = await createService(data);
      return NextResponse.json(service, { status: 201 });
    }

    return NextResponse.json({ error: "type must be 'plan' or 'service'" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, id, ...data } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    if (type === "plan") {
      const plan = await updatePlan(id, data);
      return NextResponse.json(plan);
    }
    if (type === "service") {
      const service = await updateService(id, data);
      return NextResponse.json(service);
    }

    return NextResponse.json({ error: "type must be 'plan' or 'service'" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
