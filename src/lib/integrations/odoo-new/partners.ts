// ============================================================
// res.partner — clientes
// ============================================================

import { read, searchCount, searchRead, sanitizeSearch } from "./client";
import { bool, nullable } from "./mappers";
import type { OdooPartner } from "@/types/odoo-domain";

const PARTNER_FIELDS = [
  "id",
  "name",
  "vat",
  "email",
  "mobile",
  "phone",
  "is_company",
  "country_code",
  "credit",
] as const;

interface PartnerRaw {
  id: number;
  name: string;
  vat: string | false;
  email: string | false;
  mobile: string | false;
  phone: string | false;
  is_company: boolean;
  country_code: string | false;
  credit: number;
}

function toDomain(raw: PartnerRaw): OdooPartner {
  return {
    id: raw.id,
    name: raw.name,
    vat: nullable<string>(raw.vat),
    email: nullable<string>(raw.email),
    mobile: nullable<string>(raw.mobile),
    phone: nullable<string>(raw.phone),
    isCompany: bool(raw.is_company),
    countryCode: nullable<string>(raw.country_code),
    totalReceivable: raw.credit ?? 0,
  };
}

export async function getPartner(partnerId: number): Promise<OdooPartner | null> {
  const list = await read<PartnerRaw>("res.partner", [partnerId], [...PARTNER_FIELDS]);
  if (list.length === 0) return null;
  return toDomain(list[0]);
}

export interface ListPartnersOptions {
  limit?: number;
  offset?: number;
  search?: string;
  /** Si true, filtra a customer_rank > 0 (excluye proveedores y empleados). */
  customersOnly?: boolean;
}

export async function listPartners(
  opts: ListPartnersOptions = {},
): Promise<{ items: OdooPartner[]; total: number }> {
  const { limit = 50, offset = 0, search, customersOnly = true } = opts;
  const domain: unknown[] = [];
  if (customersOnly) {
    domain.push(["customer_rank", ">", 0]);
  }
  const cleanedSearch = sanitizeSearch(search);
  if (cleanedSearch) {
    domain.push(
      "|",
      "|",
      ["name", "ilike", cleanedSearch],
      ["vat", "ilike", cleanedSearch],
      ["email", "ilike", cleanedSearch],
    );
  }
  const [total, rows] = await Promise.all([
    searchCount("res.partner", domain),
    searchRead<PartnerRaw>("res.partner", domain, {
      fields: [...PARTNER_FIELDS],
      limit,
      offset,
      order: "name asc",
    }),
  ]);
  return { items: rows.map(toDomain), total };
}

/** Busca por email exacto. Retorna el primer match o null. */
export async function findPartnerByEmail(email: string): Promise<OdooPartner | null> {
  if (!email) return null;
  const cleaned = sanitizeSearch(email, 120);
  if (!cleaned) return null;
  const rows = await searchRead<PartnerRaw>(
    "res.partner",
    [["email", "=ilike", cleaned]],
    { fields: [...PARTNER_FIELDS], limit: 1 },
  );
  if (rows.length === 0) return null;
  return toDomain(rows[0]);
}

/** Busca por VAT (cédula/RIF sin prefijo). */
export async function findPartnerByVat(vat: string): Promise<OdooPartner | null> {
  if (!vat) return null;
  const cleaned = sanitizeSearch(vat, 40);
  if (!cleaned) return null;
  const rows = await searchRead<PartnerRaw>(
    "res.partner",
    [["vat", "=", cleaned]],
    { fields: [...PARTNER_FIELDS], limit: 1 },
  );
  if (rows.length === 0) return null;
  return toDomain(rows[0]);
}

