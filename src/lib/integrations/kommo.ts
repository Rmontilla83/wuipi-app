// ===========================================
// Kommo CRM API Client
// ===========================================

const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;
const KOMMO_ACCESS_TOKEN = process.env.KOMMO_ACCESS_TOKEN;

function getBaseUrl(): string {
  if (!KOMMO_SUBDOMAIN) throw new Error("KOMMO_SUBDOMAIN not configured");
  // Some Kommo accounts use api-X.kommo.com instead of subdomain.kommo.com
  // The subdomain-based URL handles both cases via Kommo's routing
  return `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
}

async function kommoFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  if (!KOMMO_ACCESS_TOKEN) throw new Error("KOMMO_ACCESS_TOKEN not configured");

  const url = new URL(`${getBaseUrl()}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${KOMMO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 60 },
  });

  if (response.status === 401) {
    throw new Error("Kommo token expired - needs refresh");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Kommo API error: ${response.status} ${response.statusText} - ${text.slice(0, 200)}`);
  }

  return response.json();
}

// --- API Methods ---

export async function getLeads(page: number = 1, limit: number = 250, filter?: Record<string, string>) {
  const params: Record<string, string> = {
    page: page.toString(),
    limit: limit.toString(),
    with: "contacts",
  };
  if (filter) Object.assign(params, filter);
  return kommoFetch<any>("/leads", params);
}

export async function getLeadsByPipeline(pipelineId: number, page: number = 1, limit: number = 250) {
  return kommoFetch<any>("/leads", {
    page: page.toString(),
    limit: limit.toString(),
    with: "contacts",
    "filter[pipe]": pipelineId.toString(),
  });
}

export async function getLeadsByStatus(pipelineId: number, statusId: number, page: number = 1) {
  return kommoFetch<any>("/leads", {
    page: page.toString(),
    limit: "250",
    with: "contacts",
    "filter[statuses][0][pipeline_id]": pipelineId.toString(),
    "filter[statuses][0][status_id]": statusId.toString(),
  });
}

export async function getLead(id: number) {
  return kommoFetch<any>(`/leads/${id}`, { with: "contacts" });
}

export async function getContacts(page: number = 1) {
  return kommoFetch<any>("/contacts", {
    page: page.toString(),
    limit: "250",
  });
}

export async function getContact(id: number) {
  return kommoFetch<any>(`/contacts/${id}`);
}

export async function getPipelines() {
  return kommoFetch<any>("/leads/pipelines");
}

export async function getUsers() {
  return kommoFetch<any>("/users");
}

export async function getTasks(page: number = 1) {
  return kommoFetch<any>("/tasks", {
    page: page.toString(),
    limit: "250",
  });
}

// Fetch ALL leads from a pipeline (paginated)
export async function getAllLeadsByPipeline(pipelineId: number): Promise<any[]> {
  const allLeads: any[] = [];
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    try {
      // Fetch all leads, filter by pipeline_id in code
      const data = await getLeads(page, 250);
      const leads = data?._embedded?.leads || [];
      if (leads.length === 0) break;
      // Filter by pipeline
      const filtered = leads.filter((l: any) => l.pipeline_id === pipelineId);
      allLeads.push(...filtered);
      if (!data._links?.next) break;
      page++;
    } catch {
      break;
    }
  }

  return allLeads;
}

export function isConfigured(): boolean {
  return !!(KOMMO_SUBDOMAIN && KOMMO_ACCESS_TOKEN);
}
