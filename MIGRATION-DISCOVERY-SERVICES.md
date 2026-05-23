# Discovery #3 — wuipi.isp.service, states, payment.transaction
> Generado: 2026-05-23T11:09:41.805Z

## 1. Estados de la suscripción (selection values)

### `wuipi_subscription_state`
| Value | Label |
|---|---|
| `1_draft` | Cotización |
| `2_renewal` | Por renovar |
| `3_progress` | En progreso |
| `4_paused` | En pausa |
| `6_churn` | Cancelado |
| `7_upsell` | Venta adicional |

### `wuipi_state` (WUIPI lifecycle state)
| Value | Label |
|---|---|
| `active` | Active |
| `grace_period` | Grace period |
| `suspended` | Suspended |
| `cancelled` | Cancelled |
| `churned` | Churned |

## 2. `wuipi.isp.service` — el servicio del cliente (core para portal)

### wuipi.isp.service

- Count: **14**
- Fields: **51**

**Sample**:
```
  id: 36
  name: "SM000036"
  partner_id: "[31] Inversiones Nasul CA"
  state: "in_progress"
  router_id: "[9] VM_ODOO_02"
  node_id: "[9] VM_ODOO_02 / NOdoo_02_E4"
  installation_date: "2026-05-22"
  is_active: true
  create_date: "2026-05-22 19:03:36"
  write_date: "2026-05-22 19:30:24"
```

<details><summary>Lista de fields</summary>

| Campo | Tipo | Relation | String |
|---|---|---|---|
| `activity_ids` | one2many | `mail.activity` | Activities |
| `activity_state` | selection |  | Activity State |
| `activity_user_id` | many2one | `res.users` | Responsible User |
| `activity_type_id` | many2one | `mail.activity.type` | Next Activity Type |
| `activity_type_icon` | char |  | Activity Type Icon |
| `activity_date_deadline` | date |  | Next Activity Deadline |
| `my_activity_date_deadline` | date |  | My Activity Deadline |
| `activity_summary` | char |  | Next Activity Summary |
| `activity_exception_decoration` | selection |  | Activity Exception Decoration |
| `activity_exception_icon` | char |  | Icon |
| `activity_calendar_event_id` | many2one | `calendar.event` | Next Activity Calendar Event |
| `message_is_follower` | boolean |  | Is Follower |
| `message_follower_ids` | one2many | `mail.followers` | Followers |
| `message_partner_ids` | many2many | `res.partner` | Followers (Partners) |
| `message_ids` | one2many | `mail.message` | Messages |
| `has_message` | boolean |  | Has Message |
| `message_needaction` | boolean |  | Action Needed |
| `message_needaction_counter` | integer |  | Number of Actions |
| `message_has_error` | boolean |  | Message Delivery error |
| `message_has_error_counter` | integer |  | Number of errors |
| `message_attachment_count` | integer |  | Attachment Count |
| `website_message_ids` | one2many | `mail.message` | Website Messages |
| `message_has_sms_error` | boolean |  | SMS Delivery error |
| `name` | char |  | Referencia del servicio |
| `subscription_id` | many2one | `contract.contract` | Suscripción |
| `partner_id` | many2one | `res.partner` | Cliente |
| `plan_template_id` | many2one | `contract.template` | Ciclo de facturación |
| `wuipi_plan_product_id` | many2one | `product.product` | Plan |
| `wuipi_plan_category_id` | many2one | `wuipi.isp.plan.category` | Categoría del plan |
| `subscription_state` | selection |  | Estado de la Suscripción |
| `router_id` | many2one | `wuipi.isp.router` | Router |
| `ipv4_id` | many2one | `wuipi.isp.ipv4` | Red IPv4 |
| `node_id` | many2one | `wuipi.isp.node` | Nodo |
| `sector_id` | many2one | `wuipi.isp.sector` | Sector |
| `ip_cpe` | char |  | IP CPE |
| `device_type_id` | many2one | `wuipi.isp.device.type` | Conectado a |
| `technician_id` | many2one | `hr.employee` | Técnico asignado |
| `installation_date` | date |  | Fecha de instalación |
| `installation_address` | text |  | Dirección de instalación |
| `state` | selection |  | Estatus |
| `is_active` | boolean |  | Servicio activo |
| `wuipi_pre_suspension_was_active` | boolean |  | Activo antes de la suspensión |
| `mikrotik_cleanup_pending` | boolean |  | Limpieza MikroTik pendiente |
| `mikrotik_cleanup_router_id` | many2one | `wuipi.isp.router` | Router de origen a limpiar |
| `mikrotik_cleanup_vlan_id` | integer |  | VLAN de origen a liberar |
| `id` | integer |  | ID |
| `display_name` | char |  | Display Name |
| `create_uid` | many2one | `res.users` | Created by |
| `create_date` | datetime |  | Created on |
| `write_uid` | many2one | `res.users` | Last Updated by |
| `write_date` | datetime |  | Last Updated on |

</details>


## 3. `wuipi.payment.promise` — promesas de pago

### wuipi.payment.promise

- Count: **0**
- Fields: **15**

_(sin registros para sample)_

<details><summary>Lista de fields</summary>

| Campo | Tipo | Relation | String |
|---|---|---|---|
| `contract_id` | many2one | `contract.contract` | Contract |
| `partner_id` | many2one | `res.partner` | Customer |
| `promise_date` | date |  | Promise Date |
| `expiry_date` | date |  | Expiry Date |
| `amount_promised` | float |  | Amount Promised |
| `state` | selection |  | State |
| `is_active` | boolean |  | Is Active |
| `notes` | text |  | Notes |
| `display_label` | char |  | Display Label |
| `id` | integer |  | ID |
| `display_name` | char |  | Display Name |
| `create_uid` | many2one | `res.users` | Created by |
| `create_date` | datetime |  | Created on |
| `write_uid` | many2one | `res.users` | Last Updated by |
| `write_date` | datetime |  | Last Updated on |

</details>


## 4. `wuipi.isp.suspension.log` — log de suspensiones

### wuipi.isp.suspension.log

- Count: **0**
- Fields: **15**

_(sin registros para sample)_

<details><summary>Lista de fields</summary>

| Campo | Tipo | Relation | String |
|---|---|---|---|
| `contract_id` | many2one | `contract.contract` | Contract |
| `partner_id` | many2one | `res.partner` | Customer |
| `action` | selection |  | Action |
| `date` | datetime |  | Date |
| `user_id` | many2one | `res.users` | Triggered by |
| `reason` | text |  | Reason |
| `details` | text |  | Details |
| `days_overdue_at_action` | integer |  | Days Overdue At Action |
| `display_label` | char |  | Display Label |
| `id` | integer |  | ID |
| `display_name` | char |  | Display Name |
| `create_uid` | many2one | `res.users` | Created by |
| `create_date` | datetime |  | Created on |
| `write_uid` | many2one | `res.users` | Last Updated by |
| `write_date` | datetime |  | Last Updated on |

</details>


## 5. `payment.transaction` — pasarelas nativas Odoo

### payment.transaction

- Count: **0**
- Fields: **41**

_(sin registros para sample)_

<details><summary>Lista de fields</summary>

| Campo | Tipo | Relation | String |
|---|---|---|---|
| `provider_id` | many2one | `payment.provider` | Provider |
| `provider_code` | selection |  | Provider Code |
| `company_id` | many2one | `res.company` | Company |
| `payment_method_id` | many2one | `payment.method` | Payment Method |
| `payment_method_code` | char |  | Payment Method Code |
| `reference` | char |  | Reference |
| `provider_reference` | char |  | Provider Reference |
| `amount` | monetary |  | Amount |
| `currency_id` | many2one | `res.currency` | Currency |
| `token_id` | many2one | `payment.token` | Payment Token |
| `state` | selection |  | Status |
| `state_message` | text |  | Message |
| `last_state_change` | datetime |  | Last State Change Date |
| `operation` | selection |  | Operation |
| `source_transaction_id` | many2one | `payment.transaction` | Source Transaction |
| `child_transaction_ids` | one2many | `payment.transaction` | Child Transactions |
| `refunds_count` | integer |  | Refunds Count |
| `is_post_processed` | boolean |  | Is Post-processed |
| `tokenize` | boolean |  | Create Token |
| `landing_route` | char |  | Landing Route |
| `partner_id` | many2one | `res.partner` | Customer |
| `partner_name` | char |  | Partner Name |
| `partner_lang` | selection |  | Language |
| `partner_email` | char |  | Email |
| `partner_address` | char |  | Address |
| `partner_zip` | char |  | Zip |
| `partner_city` | char |  | City |
| `partner_state_id` | many2one | `res.country.state` | State |
| `partner_country_id` | many2one | `res.country` | Country |
| `partner_phone` | char |  | Phone |
| `id` | integer |  | ID |
| `display_name` | char |  | Display Name |
| `create_uid` | many2one | `res.users` | Created by |
| `create_date` | datetime |  | Created on |
| `write_uid` | many2one | `res.users` | Last Updated by |
| `write_date` | datetime |  | Last Updated on |
| `payment_id` | many2one | `account.payment` | Payment |
| `invoice_ids` | many2many | `account.move` | Invoices |
| `invoices_count` | integer |  | Invoices Count |
| `sale_order_ids` | many2many | `sale.order` | Sales Orders |
| `sale_order_ids_nbr` | integer |  | # of Sales Orders |

</details>


## 6. Custom fields Wuipi en `account.payment` (92)

| Campo | Descripción | Tipo | Relation | Módulo |
|---|---|---|---|---|
| `activity_calendar_event_id` | Next Activity Calendar Event | many2one | calendar.event | calendar |
| `activity_date_deadline` | Next Activity Deadline | date |  | account |
| `activity_exception_decoration` | Activity Exception Decoration | selection |  | account |
| `activity_exception_icon` | Icon | char |  | account |
| `activity_ids` | Activities | one2many | mail.activity | account |
| `activity_state` | Activity State | selection |  | account |
| `activity_summary` | Next Activity Summary | char |  | account |
| `activity_type_icon` | Activity Type Icon | char |  | account |
| `activity_type_id` | Next Activity Type | many2one | mail.activity.type | account |
| `activity_user_id` | Responsible User | many2one | res.users | account |
| `amount` | Amount | monetary |  | account |
| `amount_available_for_refund` | Amount Available For Refund | monetary |  | account_payment |
| `amount_company_currency_signed` | Amount Company Currency Signed | monetary |  | account |
| `amount_signed` | Amount Signed | monetary |  | account |
| `attachment_ids` | Attachments | one2many | ir.attachment | account |
| `available_journal_ids` | Available Journal | many2many | account.journal | account |
| `available_partner_bank_ids` | Available Partner Bank | many2many | res.partner.bank | account |
| `available_payment_method_line_ids` | Available Payment Method Line | many2many | account.payment.method.line | account |
| `company_currency_id` | Company Currency | many2one | res.currency | account |
| `company_id` | Company | many2one | res.company | account |
| `country_code` | Country Code | char |  | account |
| `create_date` | Created on | datetime |  | account |
| `create_uid` | Created by | many2one | res.users | account |
| `currency_id` | Currency | many2one | res.currency | account |
| `date` | Date | date |  | account |
| `destination_account_id` | Destination Account | many2one | account.account | account |
| `display_name` | Display Name | char |  | account |
| `duplicate_payment_ids` | Duplicate Payment | many2many | account.payment | account |
| `has_message` | Has Message | boolean |  | account |
| `id` | ID | integer |  | account |
| `igtf_additional_payment` | Cobrar IGTF aparte | boolean |  | wuipi_l10n_ve_taxes |
| `igtf_amount` | Monto IGTF | monetary |  | wuipi_l10n_ve_taxes |
| `igtf_base_imp` | Base IGTF | monetary |  | wuipi_l10n_ve_taxes |
| `igtf_move_id` | Asiento IGTF | many2one | account.move | wuipi_l10n_ve_taxes |
| `igtf_percentage` | % IGTF | float |  | wuipi_l10n_ve_taxes |
| `invoice_ids` | Invoices | many2many | account.move | account |
| `is_igtf` | Aplica IGTF | boolean |  | wuipi_l10n_ve_taxes |
| `is_matched` | Is Matched With a Bank Statement | boolean |  | account |
| `is_reconciled` | Is Reconciled | boolean |  | account |
| `is_sent` | Is Sent | boolean |  | account |
| `journal_id` | Journal | many2one | account.journal | account |
| `memo` | Memo | char |  | account |
| `message_attachment_count` | Attachment Count | integer |  | account |
| `message_follower_ids` | Followers | one2many | mail.followers | account |
| `message_has_error` | Message Delivery error | boolean |  | account |
| `message_has_error_counter` | Number of errors | integer |  | account |
| `message_has_sms_error` | SMS Delivery error | boolean |  | account |
| `message_ids` | Messages | one2many | mail.message | account |
| `message_is_follower` | Is Follower | boolean |  | account |
| `message_main_attachment_id` | Main Attachment | many2one | ir.attachment | account |
| `message_needaction` | Action Needed | boolean |  | account |
| `message_needaction_counter` | Number of Actions | integer |  | account |
| `message_partner_ids` | Followers (Partners) | many2many | res.partner | account |
| `move_id` | Journal Entry | many2one | account.move | account |
| `my_activity_date_deadline` | My Activity Deadline | date |  | account |
| `name` | Number | char |  | account |
| `need_cancel_request` | Need Cancel Request | boolean |  | account |
| `outstanding_account_id` | Outstanding Account | many2one | account.account | account |
| `paired_internal_transfer_payment_id` | Paired Internal Transfer Payment | many2one | account.payment | account |
| `partner_bank_id` | Recipient Bank Account | many2one | res.partner.bank | account |
| `partner_id` | Customer/Vendor | many2one | res.partner | account |
| `partner_type` | Partner Type | selection |  | account |
| `payment_method_code` | Code | char |  | account |
| `payment_method_id` | Method | many2one | account.payment.method | account |
| `payment_method_line_id` | Payment Method | many2one | account.payment.method.line | account |
| `payment_receipt_title` | Payment Receipt Title | char |  | account |
| `payment_reference` | Payment Reference | char |  | account |
| `payment_token_id` | Saved Payment Token | many2one | payment.token | account_payment |
| `payment_transaction_id` | Payment Transaction | many2one | payment.transaction | account_payment |
| `payment_type` | Payment Type | selection |  | account |
| `qr_code` | QR Code URL | html |  | account |
| `reconciled_bill_ids` | Reconciled Bills | many2many | account.move | account |
| `reconciled_bills_count` | # Reconciled Bills | integer |  | account |
| `reconciled_invoice_ids` | Reconciled Invoices | many2many | account.move | account |
| `reconciled_invoices_count` | # Reconciled Invoices | integer |  | account |
| `reconciled_invoices_type` | Reconciled Invoices Type | selection |  | account |
| `reconciled_statement_line_ids` | Reconciled Statement Lines | many2many | account.bank.statement.line | account |
| `reconciled_statement_lines_count` | # Reconciled Statement Lines | integer |  | account |
| `refunds_count` | Refunds Count | integer |  | account_payment |
| `require_partner_bank_account` | Require Partner Bank Account | boolean |  | account |
| `show_partner_bank_account` | Show Partner Bank Account | boolean |  | account |
| `source_payment_id` | Source Payment | many2one | account.payment | account_payment |
| `state` | State | selection |  | account |
| `suitable_payment_token_ids` | Suitable Payment Token | many2many | payment.token | account_payment |
| `total_payment` | Total a recibir | monetary |  | wuipi_l10n_ve_taxes |
| `use_electronic_payment_method` | Use Electronic Payment Method | boolean |  | account_payment |
| `website_message_ids` | Website Messages | one2many | mail.message | account |
| `write_date` | Last Updated on | datetime |  | account |
| `write_uid` | Last Updated by | many2one | res.users | account |
| `wuipi_counterpart_currency_amount` | Importe total a imputar | monetary |  | wuipi_l10n_ve_taxes |
| `wuipi_counterpart_currency_id` | Moneda de Imputación | many2one | res.currency | wuipi_l10n_ve_taxes |
| `wuipi_counterpart_exchange_rate` | Cotización | float |  | wuipi_l10n_ve_taxes |

## 7. Inventario completo de modelos `wuipi.*` (44)

| Modelo | Nombre | Transient | Módulos |
|---|---|---|---|
| `wuipi.campaign` | WUIPI Campaign | false | wuipi_campaigns |
| `wuipi.campaign.channel` | WUIPI Campaign Channel | false | wuipi_campaigns |
| `wuipi.campaign.dashboard` | WUIPI Campaign — Dashboard ejecutivo | true | wuipi_campaigns |
| `wuipi.campaign.log` | WUIPI Campaign Log (per recipient) | false | wuipi_campaigns |
| `wuipi.campaign.optout` | WUIPI Campaign — Opt-out (lista de exclusión) | false | wuipi_campaigns |
| `wuipi.campaign.template` | WUIPI Campaign Template | false | wuipi_campaigns |
| `wuipi.campaign.test.send` | WUIPI Campaign — wizard de prueba | true | wuipi_campaigns |
| `wuipi.campaign.trigger` | WUIPI Campaign Trigger (automation rule) | false | wuipi_campaigns |
| `wuipi.crm.bot.config` | WUIPI CRM Bot — singleton configuration | false | wuipi_crm_bot |
| `wuipi.crm.bot.conversation` | WUIPI CRM Bot — customer conversation | false | wuipi_crm_bot |
| `wuipi.crm.bot.engine` | WUIPI CRM Bot — orchestrator | false | wuipi_crm_bot |
| `wuipi.crm.bot.message` | WUIPI CRM Bot — single message in a conversation | false | wuipi_crm_bot |
| `wuipi.crm.bot.prompt` | WUIPI CRM Bot — versioned system prompt | false | wuipi_crm_bot |
| `wuipi.crm.salesperson.quota` | WUIPI CRM — cuota mensual por vendedor | false | wuipi_crm |
| `wuipi.crm.stage.history` | WUIPI CRM lead stage entry/exit audit row | false | wuipi_crm |
| `wuipi.draft.payment.register` | WUIPI Register payment for draft invoice (PR-K) | true | wuipi_billing |
| `wuipi.islr.activity` | WUIPI ISLR Activity (SENIAT retention concept, Decreto 1808 Art. 9) | false | wuipi_l10n_ve_retentions |
| `wuipi.isp.device.type` | Dispositivo de red | false | wuipi_isp |
| `wuipi.isp.ipv4` | Red IPv4 | false | wuipi_isp |
| `wuipi.isp.ipv4.assign.category.wizard` | Asignar categoría de plan (por lotes) | true | wuipi_isp |
| `wuipi.isp.mikrotik.log` | MikroTik API log | false | wuipi_isp |
| `wuipi.isp.node` | Nodo | false | wuipi_isp |
| `wuipi.isp.plan.category` | Categoría de plan | false | wuipi_isp |
| `wuipi.isp.router` | Router | false | wuipi_isp |
| `wuipi.isp.sector` | Sector | false | wuipi_isp |
| `wuipi.isp.service` | Servicio | false | wuipi_isp |
| `wuipi.isp.service.change.ip.wizard` | Cambio de IP (Proc #07) | true | wuipi_isp |
| `wuipi.isp.service.change.plan.wizard` | Cambio de Plan (Proc #10) | true | wuipi_isp |
| `wuipi.isp.service.change.router.wizard` | Cambio de Router (Proc #12) | true | wuipi_isp |
| `wuipi.isp.service.change.wizard.base` | Base — MikroTik change wizards | false | wuipi_isp |
| `wuipi.isp.subscription.add.plan.wizard` | Agregar plan adicional a la suscripción (NUEVO PLAN) | true | wuipi_isp |
| `wuipi.isp.subscription.change.plan.wizard` | Cambio de Plan (desde la suscripción) | true | wuipi_isp |
| `wuipi.isp.suspension.log` | WUIPI ISP Suspension/Reactivation audit log | false | wuipi_billing |
| `wuipi.libro.export.wizard` | WUIPI SENIAT book export wizard | true | wuipi_employee_receipts_journal, wuipi_l10n_ve_libros |
| `wuipi.libro.history` | WUIPI SENIAT books generation history | false | wuipi_l10n_ve_libros |
| `wuipi.payment.promise` | WUIPI Customer payment promise | false | wuipi_billing |
| `wuipi.retention.received` | WUIPI Retention Received (clients withholding from WUIPI) | false | wuipi_l10n_ve_retentions |
| `wuipi.revenue.deferral` | WUIPI Revenue deferral (aplazamiento multi-mes) | false | wuipi_billing |
| `wuipi.service.exemption` | WUIPI Service Exemption (ISLR / IVA) | false | wuipi_l10n_ve_retentions |
| `wuipi.tax.parameters` | WUIPI Tax Parameters (UT, sustraendo factor, PJD minimums) | false | wuipi_l10n_ve_retentions |
| `wuipi.unidigital.batch` | WUIPI Unidigital Batch (POST /documents/createandapprove) | false | wuipi_unidigital |
| `wuipi.unidigital.log` | WUIPI Unidigital API Call Log | false | wuipi_unidigital |
| `wuipi.ve.municipio` | Municipio (Venezuela) | false | wuipi_isp |
| `wuipi.ve.parroquia` | Parroquia (Venezuela) | false | wuipi_isp |

## 8. Payment providers activos (no-disabled)

> _Ninguno activo todavía._

## 9. Mail templates relevantes (contract / invoice)

| ID | Model | Name | Subject | Active |
|---|---|---|---|---|
| 11 | contract.contract | Contract Modification Template | {{ object.company_id.name }} Contract (Ref {{ object.name or 'n/a' }}) - Modifications | ✓ |
| 9 | account.move | Credit Note: Sending | {{ object.company_id.name }} Credit Note (Ref {{ object.name or 'n/a' }}) | ✓ |
| 10 | contract.contract | Email Contract Template | {{ object.company_id.name }} Contract (Ref {{ object.name or 'n/a' }}) | ✓ |
| 7 | account.move | Invoice: Sending | {{ object.company_id.name }} Invoice (Ref {{ object.name or 'n/a' }}) | ✓ |
| 14 | contract.contract | WUIPI — Aviso final pre-suspensión (día +5) | ⚠ Suspensión inminente — su servicio WUIPI se cortará en breve | ✓ |
| 13 | contract.contract | WUIPI — Recordatorio firme (día +3) | Su factura WUIPI está vencida desde el {{ object.recurring_next_date.strftime('%d-%m-%Y') if object.recurring_next_date else '' }} | ✓ |
| 12 | contract.contract | WUIPI — Recordatorio pre-vencimiento (día -3) | Recordatorio: su factura WUIPI vence el {{ object.recurring_next_date.strftime('%d-%m-%Y') if object.recurring_next_date else '' }} | ✓ |

---

## Resumen ejecutivo

- **Estados de suscripción** quedan documentados arriba (sección 1).
- **wuipi.isp.service** es el modelo "servicio ISP del cliente" — clave para portal.
- **payment.transaction** es el modelo nativo de Odoo donde quedan registradas las pasarelas — vamos a integrarnos con esto.
- **Modelos wuipi.*** completos: ver tabla arriba para tener mapa completo.
