# Odoo NUEVO — Discovery Report
> Generado: 2026-05-23T10:56:29.016Z
> Server / DB / User: redactados por seguridad — ver variables de entorno (`ODOO_*`) en Vercel/`.env.local`.
> Solo lectura. Sin escritura. Sin tocar Odoo viejo.

## 1. Server

| | |
|---|---|
| Versión | `18.0-20260504` (`18.0`) |
| Build | `18.0.0.final.0.` |
| UID autenticado | `6` |
| Protocolo | `1` |

## 2. Inventario de datos (counts)

| Modelo | Total |
|---|---:|
| `res.partner` (todos) | 24 |
| `res.partner` (customer_rank > 0) | 11 |
| `account.move` (out_invoice total) | 16 |
| `account.move` (out_invoice draft) | 3 |
| `account.move` (out_invoice posted) | 13 |
| `account.payment` (total) | 5 |
| `product.template` (sale_ok) | 54 |

> ✓ Hay datos cargados.

## 3. Currencies relevantes

| ID | Name | Symbol | Active | Rate |
|---|---|---|---|---|
| 126 | EUR | € | true | 1 |
| 1 | USD | $ | true | 0.0018980035659690996 |
| 171 | VED | Bs. | true | 1 |

> Comparar con Odoo viejo: `VED=166, USD=1` (de memoria). En el nuevo **los IDs serán distintos** — hay que mapear en el cliente.

## 4. Journals (diarios bancarios + pasarelas)

Total: **24**

| ID | Code | Name | Type | Currency |
|---|---|---|---|---|
| 6 | `BNK1` | Bank | bank | — |
| 9 | `BNK2` | Banco Banesco 1730 | bank | — |
| 10 | `BNK3` | Banco de Venezuela 8937 | bank | — |
| 11 | `BNK4` | Banco Nacional de Credito (BNC) 5214 | bank | — |
| 12 | `BNK5` | Banco del Tesoro 9877 | bank | — |
| 13 | `BNK6` | Banco Mercantil 9021 | bank | USD |
| 14 | `BNK7` | Banco Mercantil 9048 | bank | EUR |
| 15 | `BNK8` | Pagos Electronicos | bank | USD |
| 16 | `BNK9` | Bancamiga 1945 | bank | — |
| 17 | `MIG01` | Diario de Migracion (Saldos Previos) | bank | — |
| 7 | `CSH1` | Cash | cash | — |
| 18 | `CSH2` | Retenciones | cash | — |
| 5 | `CABA` | Cash Basis Taxes | general | — |
| 4 | `EXCH` | Exchange Difference | general | — |
| 19 | `IGTF` | IGTF | general | — |
| 3 | `MISC` | Miscellaneous Operations | general | — |
| 20 | `STJ` | Inventory Valuation | general | — |
| 21 | `BILL` | Facturas de Proveedor | purchase | — |
| 23 | `GAS` | Gasto No Deducible | purchase | — |
| 22 | `NDE` | Nota de Entrega (Materiales) | purchase | — |
| 1 | `INV` | Customer Invoices | sale | — |
| 24 | `REC` | Recibos Suscripciones | sale | — |
| 25 | `REC1` | Facturas Historicas | sale | — |
| 8 | `REMP` | Recibos USD Empleados | sale | USD |

> En el viejo había 12 journals (Mercantil Bs/USD/EUR, Banesco, BdV, BNC, Tesoro, Cash, BNK1-8). Hay que comparar 1 a 1 con el nuevo.

## 5. Modelos de SUSCRIPCIÓN detectados

> ⚠️ **No se detectó ningún modelo con "subscription" en el nombre**. Si el módulo custom usa otro naming (ej. `wuipi.service`, `x_contract`), decime cómo se llama. Si todavía no instalaste el módulo de suscripciones, ese es el siguiente paso antes de seguir.

## 6. Modelos custom (prefijo `x_*`)

> _Ninguno detectado._

## 7. Custom fields en `res.partner`

> _Ninguno detectado._ (En el viejo había varios: `vat` con cedula sin prefijo, `mobile` con formato "58 414-XXX", etc.)

## 8. Custom fields en `account.move`

> _Ninguno detectado._ (En el viejo había `custom_month_billed`, etc.)

## 9. Custom fields en `sale.order`

> _Ninguno detectado._

## 10. Payment providers (pasarelas)

| ID | Code | Name | State |
|---|---|---|---|
| 13 | `none` | SEPA Direct Debit | disabled |
| 15 | `none` | Wire Transfer | disabled |
| 6 | `none` | Demo | disabled |
| 1 | `none` | Adyen | disabled |
| 2 | `none` | Amazon Payment Services | disabled |
| 3 | `none` | Asiapay | disabled |
| 4 | `none` | Authorize.net | disabled |
| 5 | `none` | Buckaroo | disabled |
| 7 | `none` | Flutterwave | disabled |
| 8 | `none` | Mercado Pago | disabled |
| 9 | `none` | Mollie | disabled |
| 10 | `none` | Nuvei | disabled |
| 11 | `none` | PayPal | disabled |
| 12 | `none` | Razorpay | disabled |
| 14 | `none` | Stripe | disabled |
| 16 | `none` | Worldline | disabled |
| 17 | `none` | Xendit | disabled |

## 11. Módulos relevantes Wuipi/ISP (heurística)

- `contract` — Recurring - Contracts Management · author: Tecnativa, ACSONE SA/NV, Odoo Community Association (OCA)
- `hr_calendar` — Display Working Hours in Calendar · author: Odoo S.A.
- `wuipi_billing` — WUIPI - Billing Automation · author: WUIPI TECH C.A.
- `wuipi_branding` — WUIPI Branding · author: WUIPI Telecomunicaciones
- `wuipi_campaigns` — WUIPI - Campañas multi-canal · author: WUIPI TECH C.A.
- `wuipi_crm` — WUIPI CRM · author: WUIPI Telecomunicaciones
- `wuipi_crm_bot` — WUIPI CRM Bot (Meta multi-channel) · author: WUIPI Telecomunicaciones
- `wuipi_employee_receipts_journal` — WUIPI Employee Receipts Journal · author: WUIPI Telecomunicaciones
- `wuipi_internal_admins` — WUIPI Internal Admins · author: WUIPI Telecomunicaciones
- `wuipi_isp` — WUIPI - ISP Core · author: WUIPI Telecomunicaciones
- `wuipi_l10n_ve_bcv` — WUIPI Localización VE — BCV Provider · author: WUIPI TECH C.A.
- `wuipi_l10n_ve_libros` — WUIPI Localización VE - Libros SENIAT · author: WUIPI Telecomunicaciones
- `wuipi_l10n_ve_retentions` — WUIPI - Localización VE - Retentions · author: WUIPI TECH C.A.
- `wuipi_l10n_ve_taxes` — WUIPI - Localización VE - Taxes & Fiscal Positions · author: WUIPI TECH C.A.
- `wuipi_migration_helpers` — WUIPI Migration Helpers · author: WUIPI Telecomunicaciones
- `wuipi_partner_acl` — WUIPI res.partner ACL restore · author: WUIPI Telecomunicaciones
- `wuipi_partner_subscription` — WUIPI - Partner Subscription tab + nomenclature · author: WUIPI Telecomunicaciones
- `wuipi_purchase_ve` — WUIPI - Localización VE - Purchase · author: WUIPI TECH C.A.
- `wuipi_sale_ve` — WUIPI - Localización VE - Sale · author: WUIPI TECH C.A.
- `wuipi_stock_ve` — WUIPI - Localización VE - Stock · author: WUIPI TECH C.A.
- `wuipi_subscription_isp` — WUIPI - Subscription ISP · author: WUIPI TECH C.A.
- `wuipi_unidigital` — WUIPI Unidigital — Facturación Electrónica SENIAT · author: WUIPI TECH C.A.

## 12. Lista completa de módulos instalados (109)

<details>
<summary>Expandir lista completa</summary>

- `account` — Invoicing
- `account_add_gln` — Add Partner GLN
- `account_debit_note` — Debit Notes
- `account_edi_ubl_cii` — Import/Export electronic invoices with UBL/CII
- `account_payment` — Payment - Account
- `analytic` — Analytic Accounting
- `auth_signup` — Signup
- `auth_totp` — Two-Factor Authentication (TOTP)
- `auth_totp_mail` — 2FA Invite mail
- `auth_totp_portal` — TOTPortal
- `barcodes` — Barcode
- `barcodes_gs1_nomenclature` — Barcode - GS1 Nomenclature
- `base` — Base
- `base_import` — Base import
- `base_import_module` — Base import module
- `base_install_request` — Base - Module Install Request
- `base_setup` — Initial Setup Tools
- `bus` — IM Bus
- `calendar` — Calendar
- `calendar_sms` — Calendar - SMS
- `contacts` — Contacts
- `contract` — Recurring - Contracts Management
- `crm` — CRM
- `crm_iap_enrich` — Lead Enrichment
- `crm_iap_mine` — Lead Generation
- `crm_sms` — SMS in CRM
- `currency_rate_update` — Currency Rate Update
- `digest` — KPI Digests
- `google_gmail` — Google Gmail
- `hr` — Employees
- `hr_calendar` — Display Working Hours in Calendar
- `hr_org_chart` — HR Org Chart
- `hr_skills` — Skills Management
- `html_editor` — HTML Editor
- `http_routing` — Web Routing
- `iap` — In-App Purchases
- `iap_crm` — IAP / CRM
- `iap_mail` — IAP / Mail
- `l10n_ve` — Venezuela - Accounting
- `mail` — Discuss
- `mail_bot` — OdooBot
- `mail_bot_hr` — OdooBot - HR
- `mrp` — Manufacturing
- `mrp_account` — Accounting - MRP
- `onboarding` — Onboarding Toolbox
- `partner_autocomplete` — Partner Autocomplete
- `payment` — Payment Engine
- `phone_validation` — Phone Numbers Validation
- `portal` — Customer Portal
- `privacy_lookup` — Privacy
- `product` — Products & Pricelists
- `purchase` — Purchase
- `purchase_edi_ubl_bis3` — Import/Export electronic orders with UBL
- `purchase_mrp` — Purchase and MRP Management
- `purchase_stock` — Purchase Stock
- `resource` — Resource
- `resource_mail` — Resource Mail
- `sale` — Sales
- `sale_async_emails` — Sales - Async Emails
- `sale_crm` — Opportunity to Quotation
- `sale_edi_ubl` — Import electronic orders with UBL
- `sale_management` — Sales
- `sale_mrp` — Sales and MRP Management
- `sale_pdf_quote_builder` — Sales PDF Quotation Builder
- `sale_purchase` — Sale Purchase
- `sale_purchase_stock` — MTO Sale <-> Purchase
- `sale_sms` — Sale - SMS
- `sale_stock` — Sales and Warehouse Management
- `sales_team` — Sales Teams
- `sms` — SMS gateway
- `snailmail` — Snail Mail
- `snailmail_account` — Snail Mail - Account
- `spreadsheet` — Spreadsheet
- `spreadsheet_account` — Spreadsheet Accounting Formulas
- `spreadsheet_dashboard` — Spreadsheet dashboard
- `spreadsheet_dashboard_account` — Spreadsheet dashboard for accounting
- `spreadsheet_dashboard_sale` — Spreadsheet dashboard for sales
- `spreadsheet_dashboard_stock_account` — Spreadsheet dashboard for stock
- `stock` — Inventory
- `stock_account` — WMS Accounting
- `stock_sms` — Stock - SMS
- `uom` — Units of measure
- `utm` — UTM Trackers
- `web` — Web
- `web_editor` — Web Editor
- `web_hierarchy` — Web Hierarchy
- `web_responsive` — Web Responsive
- `web_tour` — Tours
- `web_unsplash` — Unsplash Image Library
- `wuipi_billing` — WUIPI - Billing Automation
- `wuipi_branding` — WUIPI Branding
- `wuipi_campaigns` — WUIPI - Campañas multi-canal
- `wuipi_crm` — WUIPI CRM
- `wuipi_crm_bot` — WUIPI CRM Bot (Meta multi-channel)
- `wuipi_employee_receipts_journal` — WUIPI Employee Receipts Journal
- `wuipi_internal_admins` — WUIPI Internal Admins
- `wuipi_isp` — WUIPI - ISP Core
- `wuipi_l10n_ve_bcv` — WUIPI Localización VE — BCV Provider
- `wuipi_l10n_ve_libros` — WUIPI Localización VE - Libros SENIAT
- `wuipi_l10n_ve_retentions` — WUIPI - Localización VE - Retentions
- `wuipi_l10n_ve_taxes` — WUIPI - Localización VE - Taxes & Fiscal Positions
- `wuipi_migration_helpers` — WUIPI Migration Helpers
- `wuipi_partner_acl` — WUIPI res.partner ACL restore
- `wuipi_partner_subscription` — WUIPI - Partner Subscription tab + nomenclature
- `wuipi_purchase_ve` — WUIPI - Localización VE - Purchase
- `wuipi_sale_ve` — WUIPI - Localización VE - Sale
- `wuipi_stock_ve` — WUIPI - Localización VE - Stock
- `wuipi_subscription_isp` — WUIPI - Subscription ISP
- `wuipi_unidigital` — WUIPI Unidigital — Facturación Electrónica SENIAT

</details>

---

## Próximas decisiones a cerrar (orden sugerido)

1. **Nombre del modelo de suscripciones custom** — ⚠️ NO detectado automáticamente. Confirmar cómo se llama o instalar primero.
2. **Campos clave de la suscripción** — equivalentes a: `partner_id`, `recurring_next_date`, `state` (in_progress/closed), `recurring_total`, `pricelist_id`, `code`/identificador.
3. **Mapeo de currencies** — anotar IDs del nuevo (VED=171, USD=1) y refactorizar hardcodes.
4. **Mapeo de journals** — para cada journal del viejo (Mercantil Bs/USD/EUR, Stripe, PayPal, BNK1-8…), identificar el ID equivalente en el nuevo.
5. **Custom fields a portar** — si en el viejo dependemos de `custom_month_billed`, `x_wuipi_*`, etc. y no están en el nuevo, hay que crearlos antes del switch o cambiar la lógica.
6. **Tax IDs** — IVA / IGTF / ISLR del viejo vs nuevo (no scanneado todavía; se hace en discovery 2 si querés).

## Cómo seguimos

- Si el modelo de suscripciones aparece arriba: lo abro y mapeo campos en el siguiente paso.
- Si NO aparece y el módulo todavía no está instalado: pausamos discovery hasta que esté.
- Si hay módulos custom Wuipi instalados: te los listo arriba y vemos cuáles dependen.
