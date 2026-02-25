import { NextResponse } from "next/server";

const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;
const KOMMO_ACCESS_TOKEN = process.env.KOMMO_ACCESS_TOKEN;

export async function GET() {
  try {
    // Fetch recent leads WITH tags
    const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads?limit=50&with=contacts&filter[pipe]=12115128&order[updated_at]=desc`;
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${KOMMO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    const leads = data?._embedded?.leads || [];

    // Extract tag info from each lead
    const leadTags = leads.map((lead: any) => ({
      id: lead.id,
      name: lead.name,
      tags: lead._embedded?.tags || [],
      custom_fields: lead.custom_fields_values?.map((cf: any) => ({
        field_id: cf.field_id,
        field_name: cf.field_name,
        values: cf.values,
      })) || [],
    }));

    // Also fetch available tags for leads entity
    const tagsUrl = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/leads/tags?limit=250`;
    const tagsResponse = await fetch(tagsUrl, {
      headers: {
        Authorization: `Bearer ${KOMMO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    
    let availableTags: any[] = [];
    if (tagsResponse.ok) {
      const tagsData = await tagsResponse.json();
      availableTags = tagsData?._embedded?.tags || [];
    }

    return NextResponse.json({
      total_leads_checked: leads.length,
      available_tags: availableTags,
      leads_with_tags: leadTags,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
