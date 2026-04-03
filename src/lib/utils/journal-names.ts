/**
 * Map Odoo journal names to clean display names.
 * Odoo has generic/duplicate names that confuse users.
 * This map is maintained here instead of modifying Odoo directly.
 */
const JOURNAL_DISPLAY_NAMES: Record<string, string> = {
  "Bank": "Banco Mercantil (Bs)",
  "Cash": "Efectivo (USD)",
  "Cash (USD)": "Efectivo (USD)",
  "Efectivo Bs": "Efectivo (Bs)",
  "Banco Banesco": "Banco Banesco",
  "Banco de Venezuela": "Banco de Venezuela",
  "Banco Nacional de Credito (BNC)": "BNC",
  "Banco del Tesoro": "Banco del Tesoro",
  "Banco Mercantil 9021": "Banco Mercantil (USD)",
  "Banco Mercantil 9021 (USD)": "Banco Mercantil (USD)",
  "Banco Mercantil 9048": "Banco Mercantil (EUR)",
  "Diario de Migracion (Saldos Previos)": "Migracion (historico)",
};

export function getJournalDisplayName(odooName: string): string {
  return JOURNAL_DISPLAY_NAMES[odooName] || odooName;
}
