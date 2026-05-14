/**
 * Normaliza el `vat` de un res.partner de Odoo a formato compacto Mercantil:
 * `<LETRA><DÍGITOS>` (ej: V17123456, J411567710, G20009990991, E12345678,
 * P12345678). Mercantil exige este formato exacto en `issuerCustomerId`
 * de transfer-search; el prefijo varía según tipo de documento del emisor
 * (confirmado por soporte Mercantil 2026-05-14).
 *
 * - Si `vat` trae prefijo de letra (V/J/G/E/P, en cualquier capitalización
 *   y con/sin guiones, espacios, puntos), preserva la letra.
 * - Si `vat` viene como solo dígitos, infiere la letra desde `is_company`:
 *   `true` → 'J' (jurídico), `false` → 'V' (venezolano natural).
 *   Esta inferencia es defensiva — el dato correcto debe venir desde Odoo.
 * - Si `vat` está vacío o no hay dígitos, devuelve `odoo_<partnerId>` como
 *   placeholder único (no se usa para transfer-search; sólo cumple el
 *   constraint UNIQUE de la columna en collection_items).
 */
export function normalizeOdooVatToCedula(
  vat: string | undefined | null,
  isCompany: boolean | undefined,
  partnerId: number,
): string {
  const raw = (vat ?? '').trim();
  if (!raw) return `odoo_${partnerId}`;

  const letterAtStart = raw.match(/^[VEJGPvejgp]/)?.[0]?.toUpperCase();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return `odoo_${partnerId}`;

  const letter = letterAtStart ?? (isCompany ? 'J' : 'V');
  return letter + digits;
}
