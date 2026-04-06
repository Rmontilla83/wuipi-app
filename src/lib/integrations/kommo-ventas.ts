// ===========================================
// Kommo CRM API Client - VENTAS (wuipidrive)
// with auto token refresh
// ===========================================

const KOMMO_SUBDOMAIN = process.env.KOMMO_VENTAS_SUBDOMAIN;
const KOMMO_CLIENT_ID = process.env.KOMMO_VENTAS_CLIENT_ID;
const KOMMO_CLIENT_SECRET = process.env.KOMMO_VENTAS_CLIENT_SECRET;
const KOMMO_REDIRECT_URI = process.env.KOMMO_VENTAS_REDIRECT_URI || "https://api.wuipi.net/api/auth/kommo-ventas";

let accessToken = process.env.KOMMO_VENTAS_ACCESS_TOKEN || "";
let refreshToken = process.env.KOMMO_VENTAS_REFRESH_TOKEN || "";

function getBaseUrl(): string {
  if (!KOMMO_SUBDOMAIN) throw new Error("KOMMO_VENTAS_SUBDOMAIN not configured");
  return `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!KOMMO_CLIENT_ID || !KOMMO_CLIENT_SECRET || !refreshToken) {
    console.warn("Kommo Ventas: Cannot refresh — missing CLIENT_ID, CLIENT_SECRET, or REFRESH_TOKEN");
    return false;
  }

  try {
    const res = await fetch(`https://${KOMMO_SUBDOMAIN}.kommo.com/oauth2/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: KOMMO_CLIENT_ID,
        client_secret: KOMMO_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        redirect_uri: KOMMO_REDIRECT_URI,
      }),
    });

    if (!res.ok) {
      console.error("Kommo Ventas token refresh failed:", res.status);
      return false;
    }

    const data = await res.json();
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    console.log("Kommo Ventas: Token refreshed successfully");
    return true;
  } catch (err) {
    console.error("Kommo Ventas token refresh error:", err);
    return false;
  }
}

async function kommoFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  if (!accessToken) throw new Error("KOMMO_VENTAS_ACCESS_TOKEN not configured");

  const url = new URL(`${getBaseUrl()}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  let response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 60 },
  });

  if (response.status === 204) return {} as T;

  // Auto-refresh on 401
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        next: { revalidate: 60 },
      });
      if (response.status === 204) return {} as T;
    } else {
      throw new Error("Kommo Ventas token expired and refresh failed");
    }
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
  return !!(KOMMO_SUBDOMAIN && accessToken);
}
