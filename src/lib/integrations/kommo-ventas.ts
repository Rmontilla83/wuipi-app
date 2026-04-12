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

async function kommoFetch<T>(
  endpoint: string,
  options?: {
    params?: Record<string, string>;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: any;
  }
): Promise<T> {
  if (!accessToken) throw new Error("KOMMO_VENTAS_ACCESS_TOKEN not configured");

  const method = options?.method || "GET";
  const url = new URL(`${getBaseUrl()}${endpoint}`);
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const fetchOptions: RequestInit & { next?: any } = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };

  if (method === "GET") {
    fetchOptions.next = { revalidate: 60 };
  }

  if (options?.body && method !== "GET") {
    fetchOptions.body = JSON.stringify(options.body);
  }

  let response = await fetch(url.toString(), fetchOptions);

  if (response.status === 204) return {} as T;

  // Auto-refresh on 401
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      fetchOptions.headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      };
      response = await fetch(url.toString(), fetchOptions);
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

// --- READ Methods ---

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
  return kommoFetch<any>("/leads", { params });
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

export async function getLead(id: number) {
  return kommoFetch<any>(`/leads/${id}`, { params: { with: "contacts" } });
}

export async function getUsers() {
  return kommoFetch<any>("/users");
}

export async function getContacts(page: number = 1) {
  return kommoFetch<any>("/contacts", { params: { page: page.toString(), limit: "250" } });
}

export async function getContact(id: number) {
  return kommoFetch<any>(`/contacts/${id}`);
}

// --- WRITE Methods ---

/** Actualizar un lead (mover etapa, cambiar precio, campos custom, etc.) */
export async function updateLead(
  id: number,
  data: {
    status_id?: number;
    pipeline_id?: number;
    price?: number;
    responsible_user_id?: number;
    custom_fields_values?: Array<{
      field_id: number;
      values: Array<{ value: string | number | boolean }>;
    }>;
  }
) {
  return kommoFetch<any>(`/leads/${id}`, {
    method: "PATCH",
    body: data,
  });
}

/** Crear un lead nuevo */
export async function createLead(data: {
  name: string;
  pipeline_id: number;
  status_id?: number;
  price?: number;
  responsible_user_id?: number;
  custom_fields_values?: Array<{
    field_id: number;
    values: Array<{ value: string | number | boolean }>;
  }>;
  _embedded?: {
    contacts?: Array<{ id: number }>;
  };
}) {
  return kommoFetch<any>("/leads", {
    method: "POST",
    body: [data],
  });
}

/** Agregar nota a un lead (registro de interacción del bot) */
export async function addNoteToLead(
  leadId: number,
  text: string,
  noteType: "common" | "service_message" = "common"
) {
  return kommoFetch<any>(`/leads/${leadId}/notes`, {
    method: "POST",
    body: [
      {
        note_type: noteType,
        params: { text },
      },
    ],
  });
}

/** Agregar nota a un contacto */
export async function addNoteToContact(contactId: number, text: string) {
  return kommoFetch<any>(`/contacts/${contactId}/notes`, {
    method: "POST",
    body: [
      {
        note_type: "common",
        params: { text },
      },
    ],
  });
}

/** Actualizar un contacto (enriquecer con datos recopilados) */
export async function updateContact(
  id: number,
  data: {
    name?: string;
    first_name?: string;
    last_name?: string;
    custom_fields_values?: Array<{
      field_id: number;
      values: Array<{ value: string | number | boolean; enum_id?: number }>;
    }>;
  }
) {
  return kommoFetch<any>(`/contacts/${id}`, {
    method: "PATCH",
    body: data,
  });
}

// --- CHAT / Messaging Methods ---

/**
 * Enviar mensaje al cliente via la API de chat de Kommo.
 * Requiere el chat_id del webhook (message[add][0][chat_id]).
 * Docs: POST /api/v4/chats/{chat_id}/messages
 */
export async function sendChatMessage(chatId: string, text: string) {
  if (!accessToken || !KOMMO_SUBDOMAIN) {
    throw new Error("Kommo Ventas not configured for chat");
  }

  const url = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4/chats/${chatId}/messages`;

  let response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      type: "text",
    }),
  });

  // Auto-refresh on 401
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          type: "text",
        }),
      });
    } else {
      throw new Error("Kommo Ventas token expired and refresh failed");
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Kommo chat message error: ${response.status} - ${errText.slice(0, 200)}`);
  }

  return response.json();
}

// --- Utility ---

export function isConfigured(): boolean {
  return !!(KOMMO_SUBDOMAIN && accessToken);
}

/**
 * Parsear el payload del webhook de Kommo (form-urlencoded)
 * a un objeto estructurado más fácil de usar.
 */
export function parseWebhookPayload(raw: Record<string, string>) {
  return {
    account: {
      subdomain: raw["account[subdomain]"] || "",
      id: raw["account[id]"] || "",
    },
    message: {
      id: raw["message[add][0][id]"] || "",
      chatId: raw["message[add][0][chat_id]"] || "",
      talkId: raw["message[add][0][talk_id]"] || "",
      contactId: raw["message[add][0][contact_id]"] || "",
      text: raw["message[add][0][text]"] || "",
      createdAt: parseInt(raw["message[add][0][created_at]"] || "0"),
      elementId: raw["message[add][0][element_id]"] || "",
      entityId: raw["message[add][0][entity_id]"] || "",
      type: raw["message[add][0][type]"] as "incoming" | "outgoing" || "incoming",
      author: {
        id: raw["message[add][0][author][id]"] || "",
        type: raw["message[add][0][author][type]"] || "",
        name: raw["message[add][0][author][name]"] || "",
      },
      origin: raw["message[add][0][origin]"] || "", // waba, instagram, facebook, etc.
    },
  };
}
