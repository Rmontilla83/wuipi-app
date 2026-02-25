// ===========================================
// Kommo CRM API Client
// ===========================================

const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN;
const KOMMO_ACCESS_TOKEN = process.env.KOMMO_ACCESS_TOKEN;

function getBaseUrl(): string {
  if (!KOMMO_SUBDOMAIN) throw new Error("KOMMO_SUBDOMAIN not configured");
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
    // TODO: Implement token refresh with KOMMO_REFRESH_TOKEN
    throw new Error("Kommo token expired - needs refresh");
  }

  if (!response.ok) {
    throw new Error(`Kommo API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// --- API Methods ---

export async function getLeads(page: number = 1, limit: number = 250) {
  return kommoFetch<any>("/leads", {
    page: page.toString(),
    limit: limit.toString(),
    with: "contacts",
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

export function isConfigured(): boolean {
  return !!(KOMMO_SUBDOMAIN && KOMMO_ACCESS_TOKEN);
}
