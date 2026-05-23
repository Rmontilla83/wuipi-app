// ============================================================
// Odoo NEW — public surface
// Import desde:  @/lib/integrations/odoo-new
// ============================================================

export { isConfigured, authenticate, getServerInfo } from "./client";
export {
  NEW_ODOO_DB,
  CURRENCY_IDS,
  JOURNAL_IDS,
  SUBSCRIPTION_STATE,
  LIFECYCLE_STATE,
  PAYMENT_METHOD_TO_JOURNAL,
  currencyCodeFromId,
} from "./config";

export {
  getPartner,
  listPartners,
  findPartnerByEmail,
  findPartnerByVat,
} from "./partners";

export {
  getInvoice,
  listInvoices,
  listPendingInvoicesForPartner,
} from "./invoices";

export {
  getSubscription,
  getSubscriptionByReference,
  listSubscriptionsForPartner,
  findActiveSubscriptionForPartner,
  listContractLines,
  type ContractLine,
} from "./subscriptions";

export {
  getService,
  listServicesForPartner,
  listServicesForSubscription,
} from "./services";
