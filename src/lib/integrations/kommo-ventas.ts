// ===========================================
// Kommo CRM API Client - VENTAS (wuipidrive)
// ===========================================

const KOMMO_SUBDOMAIN = process.env.KOMMO_VENTAS_SUBDOMAIN;
const KOMMO_ACCESS_TOKEN = process.env.KOMMO_VENTAS_ACCESS_TOKEN;

function getBaseUrl(): string {
  if (!KOMMO_SUBDOMAIN) throw new Error("KOMMO_VENTAS_SUBDOMAIN not configured");
  return `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
}

async function kommoFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  if (!KOMMO_ACCESS_TOKEN) throw new Error("KOMMO_VENTAS_ACCESS_TOKEN not configured");

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

  if (response.status === 204) return {} as T;
  
  if (response.status === 401) {
    throw new Error("Kommo Ventas token expired - needs refresh");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Kommo Ventas API error: ${response.status} ${response.statusText} - ${text.slice(0, 200)}`);
  }

  return response.json();
}

// --- API Methods ---

export async function getPipelines() {
  return kommoFetch<any>("/leads/pipelines");
}

export async function getLeads(page: number = 1, limit: number = 250, filter?: Record<string, string>) {
  const params: Record<string, string> = {
    page: page.toString(),
    limit: limit.toString(),
    with: "contacts",
  };
  if (filter) Object.assign(params, filter);
  return kommoFetch<any>("/leads", params);
}

export async function getAllLeads(options?: { from?: number; to?: number }): Promise<any[]> {
  const allLeads: any[] = [];
  let page = 1;
  const maxPages = 40;

  while (page <= maxPages) {
    const filter: Record<string, string> = {};
    if (options?.from) filter["filter[created_at][from]"] = options.from.toString();
    if (options?.to) filter["filter[created_at][to]"] = options.to.toString();

    const data = await getLeads(page, 250, filter);
    const leads = data?._embedded?.leads || [];
    if (leads.length === 0) break;
    allLeads.push(...leads);
    if (!data._links?.next) break;
    page++;
  }

  return allLeads;
}

export async function getUsers() {
  return kommoFetch<any>("/users");
}

export async function getContacts(page: number = 1) {
  return kommoFetch<any>("/contacts", { page: page.toString(), limit: "250" });
}

export function isConfigured(): boolean {
  return !!(KOMMO_SUBDOMAIN && KOMMO_ACCESS_TOKEN);
}
