# Discovery #2 — Contracts / Subscriptions
> Generado: 2026-05-23T11:04:49.999Z
> Solo lectura.

## 1. Modelos con `contract` en el nombre

| Modelo | Nombre | Transient | Módulos |
|---|---|---|---|
| `contract.contract` | Suscripción | false | contract, wuipi_billing, wuipi_isp, wuipi_migration_helpers, wuipi_partner_subscription, wuipi_subscription_isp |
| `contract.line` | Contract Line | false | contract, wuipi_billing, wuipi_isp, wuipi_subscription_isp |
| `contract.manually.create.invoice` | Contract Manually Create Invoice Wizard | true | contract |
| `contract.modification` | Contract Modification | false | contract |
| `contract.recurring.mixin` | Contract Recurring Mixin | false | contract |
| `contract.tag` | Contract Tag | false | contract |
| `contract.template` | Plantilla de Suscripción | false | contract, wuipi_partner_subscription, wuipi_subscription_isp |
| `contract.template.line` | Contract Template Line | false | contract |

## 2. Modelos creados por módulos Wuipi (subscription / billing)

| Modelo | Nombre | Módulos |
|---|---|---|
| `_unknown` | Unknown | base |
| `account.account` | Account | account, spreadsheet_account |
| `account.account.tag` | Account Tag | account |
| `account.accrued.orders.wizard` | Accrued Orders Wizard | account |
| `account.analytic.account` | Analytic Account | account, analytic, mrp_account, purchase, stock_account |
| `account.analytic.applicability` | Analytic Plan's Applicabilities | account, analytic, mrp_account, purchase, sale |
| `account.analytic.distribution.model` | Analytic Distribution Model | account, analytic |
| `account.analytic.line` | Analytic Line | account, analytic, mrp_account, sale |
| `account.analytic.plan` | Analytic Plans | analytic, stock_account |
| `account.automatic.entry.wizard` | Create Automatic Entries | account |
| `account.autopost.bills.wizard` | Autopost Bills Wizard | account |
| `account.bank.statement` | Bank Statement | account |
| `account.bank.statement.line` | Bank Statement Line | account |
| `account.cash.rounding` | Account Cash Rounding | account |
| `account.chart.template` | Account Chart Template | account, l10n_ve, sale, stock_account |
| `account.code.mapping` | Mapping of account codes per company | account |
| `account.debit.note` | Add Debit Note wizard | account_debit_note |
| `account.edi.common` | Common functions for EDI documents: generate the data, the constraints, etc | account_edi_ubl_cii |
| `account.edi.ubl` | Base helpers for UBL | account_edi_ubl_cii |
| `account.edi.xml.cii` | Factur-x/XRechnung CII 2.2.0 | account_edi_ubl_cii |
| `account.edi.xml.ubl_20` | UBL 2.0 | account_edi_ubl_cii |
| `account.edi.xml.ubl_21` | UBL 2.1 | account_edi_ubl_cii |
| `account.edi.xml.ubl_a_nz` | A-NZ BIS Billing 3.0 | account_edi_ubl_cii |
| `account.edi.xml.ubl_bis3` | UBL BIS Billing 3.0.12 | account_edi_ubl_cii |
| `account.edi.xml.ubl_de` | BIS3 DE (XRechnung) | account_edi_ubl_cii |
| `account.edi.xml.ubl_efff` | E-FFF (BE) | account_edi_ubl_cii |
| `account.edi.xml.ubl_nl` | SI-UBL 2.0 (NLCIUS) | account_edi_ubl_cii |
| `account.edi.xml.ubl_sg` | SG BIS Billing 3.0 | account_edi_ubl_cii |
| `account.financial.year.op` | Opening Balance of Financial Year | account |
| `account.fiscal.position` | Fiscal Position | account |
| `account.fiscal.position.account` | Accounts Mapping of Fiscal Position | account |
| `account.fiscal.position.tax` | Tax Mapping of Fiscal Position | account |
| `account.full.reconcile` | Full Reconcile | account |
| `account.group` | Account Group | account |
| `account.incoterms` | Incoterms | account |
| `account.invoice.report` | Invoices Statistics | account, sale |
| `account.journal` | Journal | account, account_debit_note, account_payment, wuipi_l10n_ve_taxes, wuipi_unidigital |
| `account.journal.group` | Account Journal Group | account |
| `account.lock_exception` | Account Lock Exception | account |
| `account.merge.wizard` | Account merge wizard | account |
| `account.merge.wizard.line` | Account merge wizard line | account |
| `account.move` | Journal Entry | account, account_debit_note, account_edi_ubl_cii, account_payment, mrp_account, purchase, purchase_edi_ubl_bis3, purchase_stock, sale, sale_stock, stock_account, wuipi_billing, wuipi_l10n_ve_retentions, wuipi_l10n_ve_taxes, wuipi_unidigital |
| `account.move.line` | Journal Item | account, contract, mrp_account, purchase, purchase_mrp, purchase_stock, sale, sale_mrp, sale_stock, stock_account, wuipi_billing |
| `account.move.reversal` | Account Move Reversal | account |
| `account.move.send` | Account Move Send | account, account_edi_ubl_cii, snailmail_account |
| `account.move.send.batch.wizard` | Account Move Send Batch Wizard | account, snailmail_account |
| `account.move.send.wizard` | Account Move Send Wizard | account, account_edi_ubl_cii |
| `account.partial.reconcile` | Partial Reconcile | account |
| `account.payment` | Payments | account, account_payment, wuipi_billing, wuipi_l10n_ve_taxes |
| `account.payment.method` | Payment Methods | account, account_payment |

## 3. `contract.contract` — modelo principal

- **Count**: 15 registros existentes
- **Total de fields**: 80
- **Sample partner asociado**: `[24] Manuel Jesus Diaz Rojas` (VAT: `25687328`, mobile: `+58 414-7900503`)

### Fields agregados por módulos Wuipi a `contract.contract` (80)

| Campo | Descripción | Tipo | Required | Módulo |
|---|---|---|---|---|
| `access_token` | Security Token | char |  | contract |
| `access_url` | Portal Access URL | char |  | contract |
| `access_warning` | Access warning | text |  | contract |
| `active` | Active | boolean |  | contract |
| `activity_calendar_event_id` | Next Activity Calendar Event | many2one → `calendar.event` |  | calendar |
| `activity_date_deadline` | Next Activity Deadline | date |  | contract |
| `activity_exception_decoration` | Activity Exception Decoration | selection |  | contract |
| `activity_exception_icon` | Icon | char |  | contract |
| `activity_ids` | Activities | one2many → `mail.activity` |  | contract |
| `activity_state` | Activity State | selection |  | contract |
| `activity_summary` | Next Activity Summary | char |  | contract |
| `activity_type_icon` | Activity Type Icon | char |  | contract |
| `activity_type_id` | Next Activity Type | many2one → `mail.activity.type` |  | contract |
| `activity_user_id` | Responsible User | many2one → `res.users` |  | contract |
| `code` | Reference | char |  | contract |
| `commercial_partner_id` | Commercial Entity | many2one → `res.partner` |  | contract |
| `company_id` | Company | many2one → `res.company` |  | contract |
| `contract_line_fixed_ids` | Contract lines (fixed) | one2many → `contract.line` |  | contract |
| `contract_line_ids` | Contract lines | one2many → `contract.line` |  | contract |
| `contract_template_id` | Contract Template | many2one → `contract.template` |  | contract |
| `contract_type` | Contract Type | selection |  | contract |
| `create_date` | Created on | datetime |  | contract |
| `create_invoice_visibility` | Create Invoice Visibility | boolean |  | contract |
| `create_uid` | Created by | many2one → `res.users` |  | contract |
| `currency_id` | Currency | many2one → `res.currency` |  | contract |
| `date_end` | Date End | date |  | contract |
| `date_start` | Date Start | date |  | contract |
| `display_name` | Display Name | char |  | contract |
| `fiscal_position_id` | Fiscal Position | many2one → `account.fiscal.position` |  | contract |
| `generation_type` | Generation Type | selection |  | contract |
| `group_id` | Group | many2one → `account.analytic.account` |  | contract |
| `has_active_payment_promise` | Has Active Payment Promise | boolean |  | wuipi_billing |
| `has_message` | Has Message | boolean |  | contract |
| `id` | ID | integer |  | contract |
| `invoice_count` | Invoice Count | integer |  | contract |
| `invoice_partner_id` | Invoicing contact | many2one → `res.partner` |  | contract |
| `is_overdue` | Recurring date overdue | boolean |  | wuipi_subscription_isp |
| `journal_id` | Journal | many2one → `account.journal` |  | contract |
| `last_date_invoiced` | Last Date Invoiced | date |  | contract |
| `line_recurrence` | Recurrence at line level? | boolean |  | contract |
| `manual_currency_id` | Manual Currency | many2one → `res.currency` |  | contract |
| `message_attachment_count` | Attachment Count | integer |  | contract |
| `message_follower_ids` | Followers | one2many → `mail.followers` |  | contract |
| `message_has_error` | Message Delivery error | boolean |  | contract |
| `message_has_error_counter` | Number of errors | integer |  | contract |
| `message_has_sms_error` | SMS Delivery error | boolean |  | contract |
| `message_ids` | Messages | one2many → `mail.message` |  | contract |
| `message_is_follower` | Is Follower | boolean |  | contract |
| `message_needaction` | Action Needed | boolean |  | contract |
| `message_needaction_counter` | Number of Actions | integer |  | contract |
| `message_partner_ids` | Followers (Partners) | many2many → `res.partner` |  | contract |
| `modification_ids` | Modifications | one2many → `contract.modification` |  | contract |
| `my_activity_date_deadline` | My Activity Deadline | date |  | contract |
| `name` | Name | char |  | contract, wuipi_subscription_isp |
| `next_period_date_end` | Next Period End | date |  | contract |
| `next_period_date_start` | Next Period Start | date |  | contract |
| `note` | Notes | text |  | contract |
| `partner_id` | Partner | many2one → `res.partner` |  | contract |
| `payment_promise_ids` | Payment promises | one2many → `wuipi.payment.promise` |  | wuipi_billing |
| `payment_term_id` | Payment Terms | many2one → `account.payment.term` |  | contract |
| `pricelist_id` | Pricelist | many2one → `product.pricelist` |  | contract |
| `recurring_interval` | Invoice Every | integer |  | contract |
| `recurring_invoicing_offset` | Invoicing offset | integer |  | contract |
| `recurring_invoicing_type` | Invoicing type | selection |  | contract |
| `recurring_next_date` | Date of Next Invoice | date |  | contract |
| `recurring_next_date_fixed_day` | Recurring Next Date Fixed Day | integer |  | wuipi_subscription_isp |
| `recurring_next_date_policy` | Recurring Next Date Policy | selection |  | wuipi_subscription_isp |
| `recurring_rule_type` | Recurrence | selection |  | contract |
| `suspension_log_ids` | Suspension log | one2many → `wuipi.isp.suspension.log` |  | wuipi_billing |
| `tag_ids` | Tags | many2many → `contract.tag` |  | contract |
| `user_id` | Responsible | many2one → `res.users` |  | contract |
| `website_message_ids` | Website Messages | one2many → `mail.message` |  | contract |
| `write_date` | Last Updated on | datetime |  | contract |
| `write_uid` | Last Updated by | many2one → `res.users` |  | contract |
| `wuipi_default_fixed_day` | Día de facturación de la suscripción (1-28) | integer |  | wuipi_subscription_isp |
| `wuipi_isp_service_count` | # Servicios ISP | integer |  | wuipi_isp |
| `wuipi_isp_service_ids` | Servicios ISP | one2many → `wuipi.isp.service` |  | wuipi_isp |
| `wuipi_notes` | WUIPI migration notes | text |  | wuipi_migration_helpers |
| `wuipi_state` | WUIPI lifecycle state | selection |  | wuipi_subscription_isp |
| `wuipi_subscription_state` | Estado de la suscripción | selection |  | wuipi_subscription_isp |

### Fields relacionados con recurrencia / facturación (21)

| Campo | Descripción | Tipo | Required | Módulo |
|---|---|---|---|---|
| `activity_calendar_event_id` | Next Activity Calendar Event | many2one → `calendar.event` |  | calendar |
| `activity_date_deadline` | Next Activity Deadline | date |  | contract |
| `activity_summary` | Next Activity Summary | char |  | contract |
| `activity_type_id` | Next Activity Type | many2one → `mail.activity.type` |  | contract |
| `create_invoice_visibility` | Create Invoice Visibility | boolean |  | contract |
| `date_end` | Date End | date |  | contract |
| `date_start` | Date Start | date |  | contract |
| `invoice_count` | Invoice Count | integer |  | contract |
| `invoice_partner_id` | Invoicing contact | many2one → `res.partner` |  | contract |
| `is_overdue` | Recurring date overdue | boolean |  | wuipi_subscription_isp |
| `last_date_invoiced` | Last Date Invoiced | date |  | contract |
| `line_recurrence` | Recurrence at line level? | boolean |  | contract |
| `next_period_date_end` | Next Period End | date |  | contract |
| `next_period_date_start` | Next Period Start | date |  | contract |
| `recurring_interval` | Invoice Every | integer |  | contract |
| `recurring_invoicing_offset` | Invoicing offset | integer |  | contract |
| `recurring_invoicing_type` | Invoicing type | selection |  | contract |
| `recurring_next_date` | Date of Next Invoice | date |  | contract |
| `recurring_next_date_fixed_day` | Recurring Next Date Fixed Day | integer | ✓ | wuipi_subscription_isp |
| `recurring_next_date_policy` | Recurring Next Date Policy | selection | ✓ | wuipi_subscription_isp |
| `recurring_rule_type` | Recurrence | selection |  | contract |

### Todos los fields de `contract.contract` (80)

<details>
<summary>Expandir lista completa</summary>

| Campo | Descripción | Tipo | Required | Módulo |
|---|---|---|---|---|
| `access_token` | Security Token | char |  | contract |
| `access_url` | Portal Access URL | char |  | contract |
| `access_warning` | Access warning | text |  | contract |
| `active` | Active | boolean |  | contract |
| `activity_calendar_event_id` | Next Activity Calendar Event | many2one → `calendar.event` |  | calendar |
| `activity_date_deadline` | Next Activity Deadline | date |  | contract |
| `activity_exception_decoration` | Activity Exception Decoration | selection |  | contract |
| `activity_exception_icon` | Icon | char |  | contract |
| `activity_ids` | Activities | one2many → `mail.activity` |  | contract |
| `activity_state` | Activity State | selection |  | contract |
| `activity_summary` | Next Activity Summary | char |  | contract |
| `activity_type_icon` | Activity Type Icon | char |  | contract |
| `activity_type_id` | Next Activity Type | many2one → `mail.activity.type` |  | contract |
| `activity_user_id` | Responsible User | many2one → `res.users` |  | contract |
| `code` | Reference | char |  | contract |
| `commercial_partner_id` | Commercial Entity | many2one → `res.partner` |  | contract |
| `company_id` | Company | many2one → `res.company` | ✓ | contract |
| `contract_line_fixed_ids` | Contract lines (fixed) | one2many → `contract.line` |  | contract |
| `contract_line_ids` | Contract lines | one2many → `contract.line` |  | contract |
| `contract_template_id` | Contract Template | many2one → `contract.template` |  | contract |
| `contract_type` | Contract Type | selection |  | contract |
| `create_date` | Created on | datetime |  | contract |
| `create_invoice_visibility` | Create Invoice Visibility | boolean |  | contract |
| `create_uid` | Created by | many2one → `res.users` |  | contract |
| `currency_id` | Currency | many2one → `res.currency` |  | contract |
| `date_end` | Date End | date |  | contract |
| `date_start` | Date Start | date |  | contract |
| `display_name` | Display Name | char |  | contract |
| `fiscal_position_id` | Fiscal Position | many2one → `account.fiscal.position` |  | contract |
| `generation_type` | Generation Type | selection |  | contract |
| `group_id` | Group | many2one → `account.analytic.account` |  | contract |
| `has_active_payment_promise` | Has Active Payment Promise | boolean |  | wuipi_billing |
| `has_message` | Has Message | boolean |  | contract |
| `id` | ID | integer |  | contract |
| `invoice_count` | Invoice Count | integer |  | contract |
| `invoice_partner_id` | Invoicing contact | many2one → `res.partner` |  | contract |
| `is_overdue` | Recurring date overdue | boolean |  | wuipi_subscription_isp |
| `journal_id` | Journal | many2one → `account.journal` |  | contract |
| `last_date_invoiced` | Last Date Invoiced | date |  | contract |
| `line_recurrence` | Recurrence at line level? | boolean |  | contract |
| `manual_currency_id` | Manual Currency | many2one → `res.currency` |  | contract |
| `message_attachment_count` | Attachment Count | integer |  | contract |
| `message_follower_ids` | Followers | one2many → `mail.followers` |  | contract |
| `message_has_error` | Message Delivery error | boolean |  | contract |
| `message_has_error_counter` | Number of errors | integer |  | contract |
| `message_has_sms_error` | SMS Delivery error | boolean |  | contract |
| `message_ids` | Messages | one2many → `mail.message` |  | contract |
| `message_is_follower` | Is Follower | boolean |  | contract |
| `message_needaction` | Action Needed | boolean |  | contract |
| `message_needaction_counter` | Number of Actions | integer |  | contract |
| `message_partner_ids` | Followers (Partners) | many2many → `res.partner` |  | contract |
| `modification_ids` | Modifications | one2many → `contract.modification` |  | contract |
| `my_activity_date_deadline` | My Activity Deadline | date |  | contract |
| `name` | Name | char | ✓ | contract, wuipi_subscription_isp |
| `next_period_date_end` | Next Period End | date |  | contract |
| `next_period_date_start` | Next Period Start | date |  | contract |
| `note` | Notes | text |  | contract |
| `partner_id` | Partner | many2one → `res.partner` | ✓ | contract |
| `payment_promise_ids` | Payment promises | one2many → `wuipi.payment.promise` |  | wuipi_billing |
| `payment_term_id` | Payment Terms | many2one → `account.payment.term` |  | contract |
| `pricelist_id` | Pricelist | many2one → `product.pricelist` |  | contract |
| `recurring_interval` | Invoice Every | integer |  | contract |
| `recurring_invoicing_offset` | Invoicing offset | integer |  | contract |
| `recurring_invoicing_type` | Invoicing type | selection |  | contract |
| `recurring_next_date` | Date of Next Invoice | date |  | contract |
| `recurring_next_date_fixed_day` | Recurring Next Date Fixed Day | integer | ✓ | wuipi_subscription_isp |
| `recurring_next_date_policy` | Recurring Next Date Policy | selection | ✓ | wuipi_subscription_isp |
| `recurring_rule_type` | Recurrence | selection |  | contract |
| `suspension_log_ids` | Suspension log | one2many → `wuipi.isp.suspension.log` |  | wuipi_billing |
| `tag_ids` | Tags | many2many → `contract.tag` |  | contract |
| `user_id` | Responsible | many2one → `res.users` |  | contract |
| `website_message_ids` | Website Messages | one2many → `mail.message` |  | contract |
| `write_date` | Last Updated on | datetime |  | contract |
| `write_uid` | Last Updated by | many2one → `res.users` |  | contract |
| `wuipi_default_fixed_day` | Día de facturación de la suscripción (1-28) | integer |  | wuipi_subscription_isp |
| `wuipi_isp_service_count` | # Servicios ISP | integer |  | wuipi_isp |
| `wuipi_isp_service_ids` | Servicios ISP | one2many → `wuipi.isp.service` |  | wuipi_isp |
| `wuipi_notes` | WUIPI migration notes | text |  | wuipi_migration_helpers |
| `wuipi_state` | WUIPI lifecycle state | selection | ✓ | wuipi_subscription_isp |
| `wuipi_subscription_state` | Estado de la suscripción | selection | ✓ | wuipi_subscription_isp |

</details>

### Sample real (primer contract en la DB)

```
  id: 33
  name: "SUB-00029"
  code: false
  partner_id: "[24] Manuel Jesus Diaz Rojas"
  invoice_partner_id: "[24] Manuel Jesus Diaz Rojas"
  pricelist_id: "[2] Lista de Precios (USD)"
  payment_term_id: "[1] Immediate Payment"
  company_id: "[1] WUIPI TECH C.A."
  journal_id: "[1] Customer Invoices"
  fiscal_position_id: false
  currency_id: "[171] VED"
  date_start: "2026-05-20"
  date_end: false
  recurring_next_date: "2026-08-27"
  recurring_interval: 1
  recurring_rule_type: "monthly"
  recurring_invoicing_type: "pre-paid"
  contract_type: "sale"
  line_recurrence: false
  contract_template_id: "[20] WUIPI - Ciclo 27"
  group_id: false
  note: false
```

## 4. Líneas de contrato

- **Modelo detectado**: `contract.line`
- **Count**: 16

### Fields (41)

<details>
<summary>Expandir</summary>

| Campo | Descripción | Tipo | Required | Módulo |
|---|---|---|---|---|
| `active` | Active | boolean |  | contract |
| `analytic_distribution` | Analytic Distribution | json |  | contract |
| `analytic_precision` | Analytic Precision | integer |  | contract |
| `automatic_price` | Auto-price? | boolean |  | contract |
| `company_id` | Company | many2one → `res.company` |  | contract |
| `contract_id` | Contract | many2one → `contract.contract` | ✓ | contract |
| `create_date` | Created on | datetime |  | contract |
| `create_invoice_visibility` | Create Invoice Visibility | boolean |  | contract |
| `create_uid` | Created by | many2one → `res.users` |  | contract |
| `currency_id` | Currency | many2one → `res.currency` |  | contract |
| `date_end` | Date End | date |  | contract |
| `date_start` | Date Start | date |  | contract |
| `discount` | Discount (%) | float |  | contract |
| `display_name` | Display Name | char |  | contract |
| `display_type` | Display Type | selection |  | contract |
| `distribution_analytic_account_ids` | Distribution Analytic Account | many2many → `account.analytic.account` |  | contract |
| `id` | ID | integer |  | contract |
| `is_canceled` | Canceled | boolean |  | contract |
| `is_recurring_note` | Recurring Note | boolean |  | contract |
| `last_date_invoiced` | Last Date Invoiced | date |  | contract |
| `name` | Description | text | ✓ | contract |
| `next_period_date_end` | Next Period End | date |  | contract |
| `next_period_date_start` | Next Period Start | date |  | contract |
| `note_invoicing_mode` | Note Invoicing Mode | selection |  | contract |
| `partner_id` | Partner | many2one → `res.partner` |  | contract |
| `price_subtotal` | Sub Total | monetary |  | contract |
| `price_unit` | Unit Price | float |  | contract |
| `product_id` | Product | many2one → `product.product` |  | contract |
| `product_uom_category_id` | Category | many2one → `uom.category` |  | contract |
| `quantity` | Quantity | float | ✓ | contract |
| `recurring_interval` | Invoice Every | integer | ✓ | contract |
| `recurring_invoicing_offset` | Invoicing offset | integer |  | contract |
| `recurring_invoicing_type` | Invoicing type | selection | ✓ | contract |
| `recurring_next_date` | Date of Next Invoice | date |  | contract |
| `recurring_rule_type` | Recurrence | selection | ✓ | contract |
| `sequence` | Sequence | integer |  | contract |
| `specific_price` | Specific Price | float |  | contract |
| `uom_id` | Unit of Measure | many2one → `uom.uom` |  | contract |
| `write_date` | Last Updated on | datetime |  | contract |
| `write_uid` | Last Updated by | many2one → `res.users` |  | contract |
| `wuipi_billing_active` | Facturar en próximo ciclo | boolean |  | wuipi_billing |

</details>

### Sample (primera línea)

```
  id: 24
  contract_id: "[33] SUB-00029"
  name: "[BM100SE] WUIPI Beam 100"
  product_id: "[46] [BM100SE] WUIPI Beam 100"
  quantity: 1
  price_unit: 76
  price_subtotal: 76
  recurring_next_date: "2026-08-27"
  recurring_invoicing_type: "pre-paid"
  recurring_rule_type: "monthly"
  recurring_interval: 1
  date_start: "2026-05-20"
  date_end: false
  is_canceled: false
  display_type: false
  sequence: 10
```

## 5. Custom fields Wuipi en `res.partner` (100)

| Campo | Descripción | Tipo | Módulo |
|---|---|---|---|
| `active` | Active | boolean | base |
| `active_lang_count` | Active Lang Count | integer | base |
| `activity_calendar_event_id` | Next Activity Calendar Event | many2one → `calendar.event` | calendar |
| `activity_date_deadline` | Next Activity Deadline | date | mail |
| `activity_exception_decoration` | Activity Exception Decoration | selection | mail |
| `activity_exception_icon` | Icon | char | mail |
| `activity_ids` | Activities | one2many → `mail.activity` | mail |
| `activity_state` | Activity State | selection | mail |
| `activity_summary` | Next Activity Summary | char | mail |
| `activity_type_icon` | Activity Type Icon | char | mail |
| `activity_type_id` | Next Activity Type | many2one → `mail.activity.type` | mail |
| `activity_user_id` | Responsible User | many2one → `res.users` | mail |
| `additional_info` | Additional info | char | partner_autocomplete |
| `autopost_bills` | Auto-post bills | selection | account |
| `available_peppol_eas` | Available Peppol Eas | json | account_edi_ubl_cii |
| `avatar_1024` | Avatar 1024 | binary | base |
| `avatar_128` | Avatar 128 | binary | base |
| `avatar_1920` | Avatar | binary | base |
| `avatar_256` | Avatar 256 | binary | base |
| `avatar_512` | Avatar 512 | binary | base |
| `bank_account_count` | Bank | integer | account |
| `bank_ids` | Banks | one2many → `res.partner.bank` | base |
| `barcode` | Barcode | char | base |
| `buyer_id` | Buyer | many2one → `res.users` | purchase |
| `calendar_last_notif_ack` | Last notification marked as read from base Calendar | datetime | calendar |
| `category_id` | Tags | many2many → `res.partner.category` | base |
| `channel_ids` | Channels | many2many → `discuss.channel` | mail |
| `child_ids` | Contact | one2many → `res.partner` | base |
| `city` | City | char | base |
| `color` | Color Index | integer | base |
| `comment` | Notes | html | base |
| `commercial_company_name` | Company Name Entity | char | base |
| `commercial_partner_id` | Commercial Entity | many2one → `res.partner` | base |
| `company_id` | Company | many2one → `res.company` | base |
| `company_name` | Company Name | char | base |
| `company_registry` | Company ID | char | base |
| `company_registry_label` | Company ID Label | char | base |
| `company_type` | Company Type | selection | base |
| `complete_name` | Complete Name | char | base |
| `contact_address` | Complete Address | char | base |
| `contact_address_inline` | Inlined Complete Address | char | mail |
| `contract_ids` | Contracts | one2many → `contract.contract` | account, contract |
| `country_code` | Country Code | char | base |
| `country_id` | Country | many2one → `res.country` | base |
| `create_date` | Created on | datetime | base |
| `create_uid` | Created by | many2one → `res.users` | base |
| `credit` | Total Receivable | monetary | account |
| `credit_limit` | Credit Limit | float | account |
| `credit_to_invoice` | Credit To Invoice | monetary | account |
| `currency_id` | Currency | many2one → `res.currency` | account |
| `customer_rank` | Customer Rank | integer | account |
| `days_sales_outstanding` | Days Sales Outstanding (DSO) | float | account |
| `debit` | Total Payable | monetary | account |
| `debit_limit` | Payable Limit | monetary | account |
| `display_invoice_edi_format` | Display Invoice Edi Format | boolean | account |
| `display_invoice_template_pdf_report_id` | Display Invoice Template Pdf Report | boolean | account |
| `display_name` | Display Name | char | base |
| `duplicate_bank_partner_ids` | Duplicate Bank Partner | many2many → `res.partner` | account |
| `duplicated_bank_account_partners_count` | Duplicated Bank Account Partners Count | integer | account |
| `email` | Email | char | base, mail |
| `email_formatted` | Formatted Email | char | base |
| `email_normalized` | Normalized Email | char | mail |
| `employee` | Employee | boolean | base |
| `employee_ids` | Employees | one2many → `hr.employee` | hr |
| `employees_count` | Employees Count | integer | hr |
| `fiscal_country_codes` | Fiscal Country Codes | char | account |
| `function` | Job Position | char | base |
| `global_location_number` | GLN | char | account_add_gln |
| `has_message` | Has Message | boolean | mail, sms |
| `id` | ID | integer | base |
| `ignore_abnormal_invoice_amount` | Ignore Abnormal Invoice Amount | boolean | account |
| `ignore_abnormal_invoice_date` | Ignore Abnormal Invoice Date | boolean | account |
| `im_status` | IM Status | char | bus |
| `image_1024` | Image 1024 | binary | base |
| `image_128` | Image 128 | binary | base |
| `image_1920` | Image | binary | base |
| `image_256` | Image 256 | binary | base |
| `image_512` | Image 512 | binary | base |
| `industry_id` | Industry | many2one → `res.partner.industry` | base |
| `invoice_edi_format` | eInvoice format | selection | account, account_edi_ubl_cii |
| `invoice_edi_format_store` | Invoice Edi Format Store | char | account |
| `invoice_ids` | Invoices | one2many → `account.move` | account |
| `invoice_sending_method` | Invoice sending | selection | account, snailmail_account |
| `invoice_template_pdf_report_id` | Invoice template | many2one → `ir.actions.report` | account |
| `invoice_warn` | Invoice | selection | account |
| `invoice_warn_msg` | Message for Invoice | text | account |
| `is_blacklisted` | Blacklist | boolean | mail |
| `is_coa_installed` | Is Coa Installed | boolean | account |
| `is_company` | Is a Company | boolean | base |
| `is_peppol_edi_format` | Is Peppol Edi Format | boolean | account_edi_ubl_cii |
| `is_public` | Is Public | boolean | base |
| `is_ubl_format` | Is Ubl Format | boolean | account_edi_ubl_cii |
| `journal_item_count` | Journal Items | integer | account |
| `lang` | Language | selection | base |
| `meeting_count` | # Meetings | integer | calendar |
| `meeting_ids` | Meetings | many2many → `calendar.event` | calendar |
| `message_attachment_count` | Attachment Count | integer | mail, sms |
| `message_bounce` | Bounce | integer | mail |
| `message_follower_ids` | Followers | one2many → `mail.followers` | mail, sms |
| `message_has_error` | Message Delivery error | boolean | mail, sms |

## 6. Custom fields Wuipi en `account.move` (100)

| Campo | Descripción | Tipo | Módulo |
|---|---|---|---|
| `abnormal_amount_warning` | Abnormal Amount Warning | text | account |
| `abnormal_date_warning` | Abnormal Date Warning | text | account |
| `access_token` | Security Token | char | account |
| `access_url` | Portal Access URL | char | account |
| `access_warning` | Access warning | text | account |
| `activity_calendar_event_id` | Next Activity Calendar Event | many2one → `calendar.event` | calendar |
| `activity_date_deadline` | Next Activity Deadline | date | account |
| `activity_exception_decoration` | Activity Exception Decoration | selection | account |
| `activity_exception_icon` | Icon | char | account |
| `activity_ids` | Activities | one2many → `mail.activity` | account |
| `activity_state` | Activity State | selection | account |
| `activity_summary` | Next Activity Summary | char | account |
| `activity_type_icon` | Activity Type Icon | char | account |
| `activity_type_id` | Next Activity Type | many2one → `mail.activity.type` | account |
| `activity_user_id` | Responsible User | many2one → `res.users` | account |
| `always_tax_exigible` | Always Tax Exigible | boolean | account |
| `amount_paid` | Amount paid | monetary | account_payment |
| `amount_residual` | Amount Due | monetary | account |
| `amount_residual_signed` | Amount Due Signed | monetary | account |
| `amount_tax` | Tax | monetary | account |
| `amount_tax_signed` | Tax Signed | monetary | account |
| `amount_total` | Total | monetary | account |
| `amount_total_in_currency_signed` | Total in Currency Signed | monetary | account |
| `amount_total_signed` | Total Signed | monetary | account |
| `amount_total_words` | Amount total in words | char | account |
| `amount_untaxed` | Untaxed Amount | monetary | account |
| `amount_untaxed_in_currency_signed` | Untaxed Amount Signed Currency | monetary | account |
| `amount_untaxed_signed` | Untaxed Amount Signed | monetary | account |
| `attachment_ids` | Attachments | one2many → `ir.attachment` | account |
| `audit_trail_message_ids` | Audit Trail Messages | one2many → `mail.message` | account |
| `authorized_transaction_ids` | Authorized Transactions | many2many → `payment.transaction` | account_payment |
| `auto_post` | Auto-post | selection | account |
| `auto_post_origin_id` | First recurring entry | many2one → `account.move` | account |
| `auto_post_until` | Auto-post until | date | account |
| `bank_partner_id` | Bank Partner | many2one → `res.partner` | account |
| `campaign_id` | Campaign | many2one → `utm.campaign` | sale |
| `checked` | Checked | boolean | account |
| `commercial_partner_id` | Commercial Entity | many2one → `res.partner` | account |
| `company_currency_id` | Company Currency | many2one → `res.currency` | account |
| `company_id` | Company | many2one → `res.company` | account |
| `company_price_include` | Default Sales Price Include | selection | account |
| `country_code` | Country Code | char | account |
| `create_date` | Created on | datetime | account |
| `create_uid` | Created by | many2one → `res.users` | account |
| `currency_id` | Currency | many2one → `res.currency` | account |
| `custom_month_billed` | Mes facturado personalizado | boolean | wuipi_unidigital |
| `custom_month_billed_text` | Mes(es) facturado(s) | char | wuipi_unidigital |
| `date` | Date | date | account |
| `debit_note_count` | Number of Debit Notes | integer | account_debit_note |
| `debit_note_ids` | Debit Notes | one2many → `account.move` | account_debit_note |
| `debit_origin_id` | Original Invoice Debited | many2one → `account.move` | account_debit_note |
| `delivery_date` | Delivery Date | date | account |
| `direction_sign` | Direction Sign | integer | account |
| `display_inactive_currency_warning` | Display Inactive Currency Warning | boolean | account |
| `display_name` | Display Name | char | account |
| `display_qr_code` | Display QR-code | boolean | account |
| `duplicated_ref_ids` | Duplicated Ref | many2many → `account.move` | account |
| `expected_currency_rate` | Expected Currency Rate | float | account |
| `fiscal_position_id` | Fiscal Position | many2one → `account.fiscal.position` | account |
| `has_message` | Has Message | boolean | account |
| `has_reconciled_entries` | Has Reconciled Entries | boolean | account |
| `hide_post_button` | Hide Post Button | boolean | account |
| `highest_name` | Highest Name | char | account |
| `id` | ID | integer | account |
| `inalterable_hash` | Inalterability Hash | char | account |
| `incoterm_location` | Incoterm Location | char | account |
| `invoice_cash_rounding_id` | Cash Rounding Method | many2one → `account.cash.rounding` | account |
| `invoice_currency_rate` | Currency Rate | float | account |
| `invoice_date` | Invoice/Bill Date | date | account |
| `invoice_date_due` | Due Date | date | account |
| `invoice_filter_type_domain` | Invoice Filter Type Domain | char | account |
| `invoice_has_outstanding` | Invoice Has Outstanding | boolean | account |
| `invoice_incoterm_id` | Incoterm | many2one → `account.incoterms` | account |
| `invoice_line_ids` | Invoice lines | one2many → `account.move.line` | account |
| `invoice_origin` | Origin | char | account |
| `invoice_outstanding_credits_debits_widget` | Invoice Outstanding Credits Debits Widget | binary | account |
| `invoice_partner_display_name` | Invoice Partner Display Name | char | account |
| `invoice_payment_term_id` | Payment Terms | many2one → `account.payment.term` | account |
| `invoice_payments_widget` | Invoice Payments Widget | binary | account |
| `invoice_pdf_report_file` | PDF File | binary | account |
| `invoice_pdf_report_id` | PDF Attachment | many2one → `ir.attachment` | account |
| `invoice_source_email` | Source Email | char | account |
| `invoice_user_id` | Salesperson | many2one → `res.users` | account |
| `invoice_vendor_bill_id` | Vendor Bill | many2one → `account.move` | account |
| `is_being_sent` | Is Being Sent | boolean | account |
| `is_manually_modified` | Is Manually Modified | boolean | account |
| `is_move_sent` | Is Move Sent | boolean | account |
| `is_purchase_matched` | Is Purchase Matched | boolean | purchase |
| `is_storno` | Is Storno | boolean | account |
| `journal_group_id` | Ledger | many2one → `account.journal.group` | account |
| `journal_id` | Journal | many2one → `account.journal` | account |
| `l10n_ve_control_number` | Número de Control | char | wuipi_l10n_ve_taxes |
| `l10n_ve_invoice_date` | Fecha y hora de la factura | datetime | wuipi_l10n_ve_taxes |
| `line_ids` | Journal Items | one2many → `account.move.line` | account |
| `made_sequence_gap` | Made Sequence Gap | boolean | account |
| `matched_payment_ids` | Matched Payments | many2many → `account.payment` | account |
| `medium_id` | Medium | many2one → `utm.medium` | sale |
| `message_attachment_count` | Attachment Count | integer | account |
| `message_follower_ids` | Followers | one2many → `mail.followers` | account |
| `message_has_error` | Message Delivery error | boolean | account |

## 7. Cron jobs relevantes (billing / contract)

| ID | Nombre | Modelo | Activo | Cada |
|---|---|---|---|---|
| 21 | Generate Recurring Invoices from Contracts | Suscripción | ✓ | 1 days |
| 19 | Send invoices automatically | Journal Entry | ✓ | 1 days |
| 23 | WUIPI Billing — Expire past payment promises | WUIPI Customer payment promise | ✓ | 1 days |
| 33 | WUIPI CRM — quota lifecycle (open + lock) | WUIPI CRM — cuota mensual por vendedor | ✓ | 1 days |
| 32 | WUIPI Internal Admins — daily re-apply grants | User | ✓ | 1 days |
| 26 | wuipi_isp: MikroTik router health probe | Router | ✓ | 5 minutes |

---

## Análisis preliminar

- ✓ Hay **15 contracts** en el sistema.
- ✓ Wuipi agregó **80 campos** a `contract.contract`.
- ✓ `contract.contract.recurring_next_date` existe.
- ✓ 100 fields custom en `res.partner`.
- ✓ 100 fields custom en `account.move`.

## Próximas decisiones

1. **Lectura humana del sample de contract** — confirmá si los campos clave (recurring_next_date, partner_id, invoice_partner_id, journal_id, state) coinciden con lo que esperás.
2. **`month_billed`** — en el Odoo viejo era `custom_month_billed` en account.move. Acá no aparece. ¿Cómo se calcula/almacena en el nuevo? ¿Lo derivamos del contract en lugar de la invoice?
3. **Identificador de suscripción** — `code` o `name` del contract. Ver sample.
