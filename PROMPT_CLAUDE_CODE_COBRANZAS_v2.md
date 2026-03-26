# PROMPT PARA CLAUDE CODE — Sistema de Cobranzas WUIPI

## CONTEXTO

Soy Rafael Montilla, CEO de WUIPI Telecomunicaciones (ISP en Venezuela). Necesito construir un sistema de cobranzas dentro de wuipi-app que permita enviar cobros masivos a clientes vía WhatsApp y email, con un portal de pago público donde el cliente paga sin login.

### Stack actual de wuipi-app:
- **Framework:** Next.js 14+ (App Router)
- **Database:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Hosting:** Vercel
- **Repo:** https://github.com/Rmontilla83/wuipi-app.git
- **Pasarela de pagos:** Mercantil (SDK ya integrado en src/lib/mercantil/)
- **Stripe:** Ya configurado (restricted key rk_live_...)
- **WhatsApp:** Meta Business API (Phone Number ID 506922512512507, número +58 412-7195425)
- **Email:** Resend (ya integrado en el proyecto)
- **Branding:** Egyptian Blue #03318C, Safety Orange #F46800, Dark #060633

### IMPORTANTE — Estructura existente del dashboard:
La app ya tiene un sidebar con las siguientes secciones:
- **ESTRATÉGICO:** Centro de Comando, Supervisor IA
- **OPERATIVO:** CRM Soporte, CRM Ventas, **CRM Cobranzas** ← USAR ESTA SECCIÓN
- **ADMINISTRATIVO:** ERP Administrativo, Pagos Mercantil, Clientes
- **SISTEMA:** Portal Clientes, Configuración, Actualizaciones

**NO crear nuevas secciones en el sidebar.** Construir todo el módulo de cobranzas dentro de la sección **"CRM Cobranzas"** que ya existe. La página pública `/pagar/[token]` es una ruta separada sin el layout del dashboard.

---

## FLUJO COMPLETO DEL SISTEMA

### PASO 1: Carga del Excel (Dentro de CRM Cobranzas)

Construir las vistas dentro de la sección **CRM Cobranzas** existente en el sidebar:

**Página principal /cobranzas** con:
- Vista de campañas existentes (lista con estado, progreso, montos)
- Botón "Nueva campaña de cobro"
- Al crear campaña: upload de archivo Excel (.xlsx/.csv)
- El Excel tiene estas columnas (mínimo): nombre_cliente, cedula_rif, email, telefono, monto_usd, concepto, numero_factura
- Después de cargar: mostrar vista previa en tabla editable (el admin puede corregir datos antes de enviar)
- Resumen: total clientes, monto total USD, monto total Bs. (tasa BCV actual)
- Botón "Generar links y enviar cobros"

### PASO 2: Generación de tokens de pago

Al confirmar el envío:
- Crear un registro en `collection_campaigns` (campaña)
- Para cada fila del Excel, crear un registro en `collection_items` con:
  - Token único (formato: `wpy_[random hex 16 chars]`)
  - Link de pago: `https://api.wuipi.net/pagar/{token}`
  - QR code generado (Base64 del link, para incluir en email)
  - Estado: `pending`

### PASO 3: Envío de notificaciones (WhatsApp + Email)

**WhatsApp (Meta Business API):**
- Usar plantilla aprobada con variables: {nombre}, {monto_usd}, {concepto}, {link_pago}
- Enviar a cada cliente vía la API de WhatsApp que ya tenemos (Phone Number ID: 506922512512507)
- Registrar estado del envío (sent, delivered, read, failed)

**Email (Resend):**
- Plantilla HTML profesional con branding WUIPI
- Incluye: nombre del cliente, monto, concepto, botón de pago prominente, QR code
- Diseño mobile-first (la mayoría abre email en el teléfono)

### PASO 4: Portal del cliente /pagar/[token] — ZERO LOGIN

**ESTA ES LA PÁGINA MÁS IMPORTANTE.** Debe ser innovadora, visualmente impactante y con CERO fricción.

**Principios de diseño:**
- SIN login, SIN registro, SIN crear cuenta — el token ES la autenticación
- Mobile-first (80%+ de los clientes paga desde el teléfono)
- Carga instantánea (no SSR pesado, no JavaScript bloqueante)
- Branding WUIPI pero con estética premium, no corporativa genérica
- Inspiración: links de pago de Stripe, PayPal.me, Cash App — simple, directo, confiable

**Contenido de la página:**
1. Header con logo WUIPI + "Portal de pago"
2. Tarjeta principal con:
   - Nombre del cliente
   - Concepto (ej: "Servicio de Internet - Marzo 2026")
   - Número de factura
   - Monto en USD (el precio base)
3. Selector de método de pago con 3 opciones visualmente claras:

**Opción A: Débito Inmediato (Bs.)**
- Usa el Botón de Pagos Web de Mercantil
- Muestra el monto convertido a Bs. usando tasa BCV del momento
- Al hacer clic → redirect al Botón de Mercantil → paga → webhook confirma → vuelve al portal con estado

**Opción B: Transferencia Bancaria (Bs.)**
- Para empresas/clientes que prefieren transferir
- Muestra los datos bancarios de WUIPI:
  - Banco Mercantil
  - Cuenta: 0105 0287 05 1287005713
  - RIF: J-41156771-0
  - Concepto: [número de factura]
  - Monto en Bs. (tasa BCV del momento)
- Botón "Ya realicé la transferencia" → registra como pendiente de conciliación
- Se cruza automáticamente después con la API de Búsqueda de Transferencias de Mercantil

**Opción C: Tarjeta Internacional (USD)**
- Stripe Checkout
- Monto en USD directamente
- Flujo estándar de Stripe (redirect → paga → webhook → confirma)

4. Footer con: "WUIPI Telecomunicaciones — wuipi.net" + contacto de soporte

**Tasa BCV:**
- Consultar la tasa BCV actual al cargar la página
- API sugerida: https://pydolarve.org/api/v2/dollar?monitor=bcv (o similar)
- Mostrar: "1 USD = X,XX Bs. (tasa BCV vigente)"
- El monto en Bs. se calcula automáticamente: monto_usd × tasa_bcv
- NO poner countdown ni plazo de validez de la tasa — mostrar la tasa vigente sin presión de tiempo

### PASO 5: Confirmación de pago

Después del pago exitoso (por cualquier método):
- Actualizar `collection_items.status` a `paid`
- Registrar referencia del pago, método usado, monto pagado, fecha
- Mostrar pantalla de confirmación en el portal con:
  - Check verde animado
  - "¡Pago recibido!"
  - Número de referencia
  - Monto pagado
  - Botón para descargar comprobante PDF

### PASO 6: Notificación post-pago

Cuando se confirma el pago:
- WhatsApp al cliente: "✅ Pago recibido — Ref: {referencia} — Monto: {monto} — Gracias por tu pago!"
- Email con comprobante adjunto

### PASO 7: Recordatorios automáticos

- Si el cliente no paga en 48h → reenviar WhatsApp + email
- Máximo 3 recordatorios (48h, 96h, 168h)
- Registrar cada intento en `collection_notifications`
- El admin puede ver en el dashboard qué clientes no han pagado y reenviar manualmente

### PASO 8: Dashboard de seguimiento (dentro de CRM Cobranzas)

**Vista por campaña:**
- Métricas: total enviados, pagados, pendientes, monto cobrado vs total
- Gráfico de progreso (pagados vs pendientes)
- Porcentaje de cobro

**Lista detallada con filtros:**
- Estado (pendiente, enviado, visto, pagado, fallido)
- Método de pago
- Fecha
- Búsqueda por nombre/cédula

**Detalle por cliente:**
- Timeline de notificaciones enviadas + intentos de pago
- Acciones: reenviar, marcar como pagado manualmente, cancelar

### PASO 9: Exportación Excel para Odoo

- Botón "Exportar para Odoo" en la vista de campaña
- Genera un Excel con las columnas que Odoo 18 necesita para importar pagos:
  - Fecha, Referencia, Cliente (nombre), RIF/Cédula, Monto USD, Monto Bs., Tasa BCV, Método de pago, Referencia bancaria, Estado, Número de factura
- Formato compatible con el módulo de contabilidad de Odoo 18

---

## TABLAS SUPABASE (Migración SQL)

```sql
-- Campañas de cobranza
CREATE TABLE IF NOT EXISTS collection_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  total_items INT DEFAULT 0,
  total_amount_usd DECIMAL(18,2) DEFAULT 0,
  items_paid INT DEFAULT 0,
  amount_collected_usd DECIMAL(18,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sending','active','completed','cancelled')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Items individuales de cada campaña (un item = un cliente + factura)
CREATE TABLE IF NOT EXISTS collection_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES collection_campaigns(id) ON DELETE CASCADE,
  payment_token TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_cedula_rif TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  invoice_number TEXT,
  concept TEXT,
  amount_usd DECIMAL(18,2) NOT NULL,
  amount_bss DECIMAL(18,2),
  bcv_rate DECIMAL(18,4),
  payment_method TEXT CHECK (payment_method IN ('debito_inmediato','transferencia','stripe','pending')),
  payment_reference TEXT,
  payment_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','viewed','paid','failed','expired','conciliating')),
  stripe_session_id TEXT,
  mercantil_reference TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Log de notificaciones enviadas
CREATE TABLE IF NOT EXISTS collection_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES collection_items(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed')),
  attempt_number INT DEFAULT 1,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Índices
CREATE INDEX idx_collection_items_campaign ON collection_items(campaign_id);
CREATE INDEX idx_collection_items_token ON collection_items(payment_token);
CREATE INDEX idx_collection_items_status ON collection_items(status);
CREATE INDEX idx_collection_notifications_item ON collection_notifications(item_id);

-- RLS
ALTER TABLE collection_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access campaigns"
  ON collection_campaigns FOR ALL
  USING (auth.jwt() ->> 'role' IN ('admin', 'superadmin', 'finanzas'));

CREATE POLICY "Admins full access items"
  ON collection_items FOR ALL
  USING (auth.jwt() ->> 'role' IN ('admin', 'superadmin', 'finanzas'));

CREATE POLICY "Public read items by token"
  ON collection_items FOR SELECT
  USING (true);

CREATE POLICY "Public update items payment"
  ON collection_items FOR UPDATE
  USING (true);

CREATE POLICY "Admins full access notifications"
  ON collection_notifications FOR ALL
  USING (auth.jwt() ->> 'role' IN ('admin', 'superadmin', 'finanzas'));
```

---

## API ROUTES

```
src/app/api/cobranzas/
├── upload/route.ts           # POST - Recibe Excel, valida, crea campaña + items
├── send/route.ts             # POST - Dispara WhatsApp + Email para una campaña
├── [token]/route.ts          # GET - Obtiene datos del item por token (para el portal)
├── pay/route.ts              # POST - Inicia pago (genera URL Mercantil o Stripe session)
├── pay/confirm/route.ts      # POST - Confirma transferencia manual
├── webhook/stripe/route.ts   # POST - Webhook de Stripe
├── bcv/route.ts              # GET - Obtiene tasa BCV actual (cachear 5 min)
├── remind/route.ts           # POST - Envía recordatorios a pendientes
└── export/route.ts           # POST - Genera Excel para Odoo
```

---

## PÁGINA PÚBLICA /pagar/[token]

Archivo: `src/app/pagar/[token]/page.tsx`

**IMPORTANTE:** Esta página debe ser PÚBLICA (sin auth). Actualizar el middleware para excluir `/pagar/*`.

**Diseño:**
- Estética premium, NO genérica — usar MADE Tommy Soft + una sans-serif elegante
- Colores WUIPI pero con tratamiento sofisticado (no plano)
- Animaciones sutiles (fade-in de la tarjeta, transiciones suaves entre métodos)
- Las 3 opciones de pago como cards seleccionables con iconos y descripción clara
- Mostrar tasa BCV con label discreto
- Estado del pago en tiempo real (polling cada 5s después de pagar)
- Pantalla de confirmación con animación de check verde

**Responsive:**
- En móvil: las 3 opciones de pago apiladas verticalmente
- En desktop: las 3 opciones lado a lado
- El botón de pago siempre visible (sticky bottom en móvil)

---

## DATOS BANCARIOS WUIPI (para opción de transferencia)

- **Banco:** Mercantil C.A., Banco Universal
- **Tipo:** Cuenta Corriente
- **Número de cuenta:** 0105 0287 05 1287005713
- **RIF:** J-41156771-0
- **Razón Social:** WUIPI TECH, C.A.
- **Teléfono Pago Móvil:** 04248803917

---

## CREDENCIALES MERCANTIL (ya configuradas en env vars)

El SDK de Mercantil ya está en `src/lib/mercantil/` con todas las credenciales configuradas. Para el Botón de Pagos Web usar:
- MERCANTIL_WEB_BUTTON_MERCHANT_ID=J306905944
- MERCANTIL_INTEGRATOR_ID=31
- MERCANTIL_WEB_BUTTON_BASE_URL=(ya en env vars)

Para la conciliación de transferencias usar la API de Búsqueda de Transferencias (producto 6) que ya funciona.

---

## NOTAS TÉCNICAS

1. **WhatsApp:** Usar la Meta Business API existente. El Phone Number ID es 506922512512507. Necesitamos una plantilla aprobada para cobranzas — por ahora crear una plantilla base y enviar como mensaje de texto si la plantilla no está aprobada aún.

2. **Tasa BCV:** Usar una API pública como pydolarve.org o similar. Cachear la tasa por 5 minutos para no hacer requests excesivos. Si la API falla, usar la última tasa cacheada.

3. **QR Code:** Generar con la librería `qrcode` de npm. El QR contiene el link de pago.

4. **Stripe:** Usar Stripe Checkout (redirect). Crear una session con el monto en USD y metadata con el token del item. El webhook de Stripe confirma el pago.

5. **Mercantil Botón Web:** Usar el SDK que ya está en src/lib/mercantil/. Generar la URL del botón con los datos del item. El webhook de Mercantil (ya funciona en /api/mercantil/webhook) confirma el pago.

6. **Conciliación de transferencias:** Cuando un cliente dice "ya transferí", marcar como `conciliating`. Un job periódico (o botón manual en el dashboard) usa la API de Búsqueda de Transferencias para verificar.

7. **Excel para Odoo:** El formato debe ser compatible con el import de Odoo 18 — columnas específicas que el módulo de contabilidad espera.

8. **Middleware:** La ruta `/pagar/*` debe ser pública (sin auth). Verificar que el middleware existente ya excluye rutas públicas y agregar `/pagar` a la lista.

---

## ORDEN DE EJECUCIÓN

1. Crear migración SQL y ejecutarla en Supabase
2. Crear API routes (empezar por upload, bcv, [token])
3. Construir las vistas de CRM Cobranzas en el dashboard existente (campañas, upload Excel, vista previa, envío)
4. **Crear la página /pagar/[token]** (EL DISEÑO MÁS IMPORTANTE — dedicar tiempo al UI/UX)
5. Integrar Mercantil Botón Web para pagos en Bs.
6. Integrar Stripe Checkout para pagos en USD
7. Integrar tasa BCV en tiempo real
8. Integrar WhatsApp (Meta Business API) para envío de cobros
9. Integrar email (Resend) con plantilla HTML
10. Crear exportación Excel para Odoo
11. Crear sistema de recordatorios automáticos
12. Actualizar middleware para rutas públicas /pagar/*
13. Commit + push a main

Avísame cuando hayas revisado el repo y dime qué ves en la estructura actual de CRM Cobranzas.
