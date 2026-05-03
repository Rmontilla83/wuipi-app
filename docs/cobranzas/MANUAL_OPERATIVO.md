# Manual operativo — Cobranzas WUIPI

> Material para entrenar al equipo de cobranzas. Incluye workflows del día
> a día, cheat sheet imprimible, casos especiales y diagnóstico.

---

## 1. Visión rápida del sistema

WUIPI es **prepago**: el cliente paga del día 1 al 8 de cada mes. Si al
día 8 tiene deuda > $5, Odoo le suspende automáticamente.

El módulo **Cobranzas** está en `https://api.wuipi.net/cobranzas` y tiene
**7 pestañas**:

| Pestaña | Para qué sirve |
|---|---|
| **Cartera** | Ver deudores en tiempo real desde Odoo. Crear campañas masivas. |
| **Campañas de Cobro** | Ver progreso de campañas, reenviar a no pagados. |
| **Gestión de Casos** | Kanban con incidencias activas (clientes que necesitan atención humana). |
| **Pagos Recibidos** | Auditoría de cobros confirmados (todos los métodos). |
| **Logs Pasarelas** | Diagnóstico cuando algo falla (Mercantil/C2P/Stripe/etc). |
| **Sync Odoo** | Cola de sincronización con Odoo + acciones admin. |
| **WA Outbox** | Mensajes WhatsApp del riel + envío de prueba. |

---

## 2. Lo que el sistema hace solo (sin que vos hagas nada)

**Memorizar esto** — es la diferencia entre confiar en el sistema o hacer
trabajo doble.

1. **Cliente intenta pagar y la pasarela falla** → el sistema crea un caso
   automático en el Kanban (columna "Falla Pasarela") y le envía un
   WhatsApp diciendo "tuvimos un inconveniente, en breve te atendemos".

2. **Cliente abre el link de pago y abandona** (no paga en 60 min) → el
   cron detecta el abandono cada 15 min y crea un caso "Falla Pasarela".

3. **Cliente paga por cualquier canal** (portal, oficina, banco, Odoo
   directo) → el sistema marca el item como pagado y cierra los casos
   abiertos del Kanban automáticamente.

   - Si paga por portal: instantáneo (webhook).
   - Si pagás en oficina y usás "Marcar Cash": instantáneo.
   - Si cargan el pago directo en Odoo: máximo 15 min (cron polling Odoo).

4. **Sincronización con Odoo**: cada pago confirmado se replica en Odoo
   automáticamente (factura posted + payment + reconciliado).

> **Conclusión**: nunca tenés que cerrar casos del Kanban manualmente
> después de un pago. Si el caso sigue abierto, es porque el cliente NO
> ha pagado todavía.

---

## 3. Tu día a día — workflows paso a paso

### 3.1. Crear una campaña masiva (típico día 27 o 1 del mes)

```
1. Entrá a /cobranzas → tab "Cartera"
2. Esperá a que cargue la lista (lee Odoo en tiempo real)
3. Filtrá:
   - Por monto mínimo (ej. $10)
   - Por antigüedad (>15, >30, >60 días)
   - Por nombre/RIF si buscás a alguien específico
4. Seleccioná los clientes con los checkboxes
5. Click "Crear campaña"
6. Llenale nombre y descripción → "Crear"
7. El sistema te lleva al tab "Campañas"
8. Click en la campaña → ves los items
9. Click "Enviar" → manda los WhatsApp
```

**Tip**: en producción podés segmentar (ej. una campaña para >$50, otra
para nuevos, otra para post-corte).

### 3.2. Enviar el link de pago a UN cliente puntual (instalación, ajuste)

```
1. Entrá a /clientes
2. Buscá al cliente y click en su nombre (ficha)
3. Arriba derecha tenés 3 botones:
   - "Ver portal" → previsualiza lo que ve el cliente
   - "Link de pago" → COPIA la URL al clipboard
   - "Enviar por WA" → envía el WhatsApp directamente
4. Si elegís "Enviar por WA":
   - El modal muestra: teléfono, deuda actual, template a usar
   - Click "Enviar"
   - Aparece el resultado abajo
```

**Cuándo usar cuál:**

| Situación | Botón |
|---|---|
| Cliente preguntó "cómo pago" en WhatsApp | "Enviar por WA" (un click) |
| Necesitás copiar el link para pegarlo en otro lado (email, SMS) | "Link de pago" |
| Querés ver primero qué le va a aparecer al cliente | "Ver portal" |

### 3.3. Marcar un cobro en oficina (efectivo PLC/Lechería)

```
1. /clientes → buscá el cliente → ficha
2. Tab "Facturación"
3. Buscá el item (factura) que va a pagar
4. Click "Marcar como pagado en efectivo"
5. Llená:
   - Monto recibido (USD o VES)
   - Oficina (PLC / Lechería / Otro)
   - Notas si la diferencia con lo esperado es >5%
6. Confirmá
7. El sistema:
   - Marca el item como paid
   - Cierra el caso del Kanban si había
   - Sincroniza con Odoo (factura posted + cash payment + reconcile)
   - Envía WhatsApp "pago recibido" al cliente
```

### 3.4. Verificar transferencia que un cliente reportó

Cuando Mercantil arregle el `transfer-search`, esto se hará solo. Mientras
tanto:

```
1. Cliente reporta transferencia en /pagar/[token] → status pasa a 'conciliating'
2. Recibirás aviso (Telegram / inbox)
3. Verificá la transferencia en el extracto bancario de Mercantil
4. Si OK:
   - /clientes → ficha del cliente → tab Facturación
   - Buscá el item conciliating
   - Click "Promover a paid"
   - Llená: payment_method=transferencia, referencia bancaria
   - Confirmá
5. Sistema hace todo lo demás (sync Odoo, cierra caso, notifica cliente)
```

### 3.5. Atender un caso del Kanban

```
1. /cobranzas → tab "Gestión de Casos"
2. Mirá la columna "Falla Pasarela" (entry automático)
3. Tomá un caso → click en la card
4. Lee:
   - Nombre, teléfono
   - Monto debido
   - Tipo de fallo (intra_bank_limit, OTP inválido, etc)
   - Última vez que se le envió mensaje
5. Movelo a "En Conversación" (drag & drop)
6. Abrí WhatsApp Cobranzas y contactá al cliente
7. Según vaya el diálogo, movelo:
   - "Negociando Plan" si discutiendo opciones
   - "Compromiso de Pago" si prometió pagar
   - "Verificando Pago" si dijo que pagó
8. Cuando el sistema detecte el pago, el caso pasa solo a "Resuelto"
9. Si el cliente NO responde en 7 días, considerá "Última Oportunidad"
```

---

## 4. Casos especiales

### 4.1. Cliente VIP / no_suspender

- En Odoo tienen el tilde `no_suspender`
- Odoo NO los suspende automáticamente
- Cuando crees una campaña masiva en Cartera, **NO los selecciones**
- En el riel automático futuro, el sistema los excluirá automáticamente

### 4.2. Cliente con suspensión temporal acordada

- El acuerdo se hace en persona o por WhatsApp con el cliente
- En Odoo el agente registra la suspensión + agrega tag `suspension_temporal`
- Mientras dure el acuerdo, NO le envíes recordatorios manuales
- Cuando se levante el acuerdo, normal

### 4.3. Promesa de pago

- Si el cliente promete pagar el día X, registralo en **Odoo** (no en la app)
- El módulo de promesas de Odoo se encarga de seguir
- Si Odoo te avisa que la promesa se rompió, tomás el caso del Kanban en
  "Última Oportunidad"

### 4.4. Pago de instalación / factura única ad-hoc

- No requiere campaña masiva
- Usá el botón **"Enviar por WA"** desde la ficha del cliente
- El cliente paga por el portal igual que cualquier otra factura

---

## 5. Cheat sheet (para imprimir y pegar al lado del monitor)

| Pasó esto... | Hacé esto |
|---|---|
| Aparece nueva card "Falla Pasarela" | Tomarla → "En Conversación" → contactar por WA |
| Cliente dice "ya pagué transferencia" | Ficha cliente → "Promover a paid" |
| Cliente paga en efectivo en oficina | Ficha cliente → "Marcar como pagado en efectivo" |
| Cliente nuevo (instalación) | Ficha cliente → "Enviar por WA" |
| Cliente preguntó "¿cuánto debo?" | Mandá su link permanente — lo ve en tiempo real |
| Factura pagada pero el caso sigue abierto en Kanban | Esperá 15 min (cron polling Odoo lo cierra) |
| Cliente VIP | NUNCA mandar a campaña masiva |
| Cliente no responde después de 7 días | Mover caso a "Última Oportunidad" |
| No estoy seguro qué pasó con un pago | Tab "Logs Pasarelas" → filtrá por cliente |
| Algo no se sincroniza con Odoo | Tab "Sync Odoo" → click "Reintentar" |
| Mercantil rechazó con 4025 | Sugerile al cliente C2P o Transferencia |

---

## 6. Cómo diagnosticar problemas

### "El cliente dice que pagó pero no aparece"

1. Tab **"Pagos Recibidos"** → buscá por nombre/RIF
2. Si no aparece → tab **"Logs Pasarelas"** → buscá por nombre
   - ¿Hay row con `outcome=success`? → ya entró, esperá unos minutos a que aparezca
   - ¿Hay row con `outcome=error`? → ahí está el problema, click en la row para ver detalle
   - ¿No hay nada? → el cliente nunca completó el pago

### "Mi caso sigue abierto y el cliente ya pagó"

1. Verificá en **Odoo** que la factura esté `paid` (state=posted, payment_state=paid, amount_residual=0)
2. Si Odoo dice paid → esperá hasta 15 min, el cron `odoo-state-sync` lo cerrará solo
3. Si después de 15 min sigue abierto → tab **"Sync Odoo"**, ver si hay error

### "La sincronización con Odoo está fallando"

1. Tab **"Sync Odoo"**
2. Filtros → "Review manual"
3. Por cada item:
   - Click "Reintentar" si parece transitorio
   - Click "Resuelto" si verificaste manual en Odoo que está bien
   - Click "Cancelar" si confirmaste que es un caso a ignorar

### "Mercantil rechazó un pago, ¿qué hago?"

1. Tab **"Logs Pasarelas"** → filtrar gateway=mercantil, outcome=error
2. Mirá el `error_category`:
   - `intra_bank_limit` → cliente Mercantil pagando a Mercantil. Pedirle C2P o transferencia.
   - `insufficient_funds` → fondos insuficientes. Que reintente con otro método o más tarde.
   - `invalid_credentials` → credenciales del banco. Que las verifique.
   - `gateway_5xx` → problema temporal Mercantil. Reintentar en 5-10 min.

---

## 7. Glosario de stages del Kanban

```
┌──────────────────────────────────────────────────────────────┐
│ FASE ACCIÓN (rojo/coral)                                     │
├──────────────────────────────────────────────────────────────┤
│ • Falla Pasarela            (entrada automática)             │
│ • Requiere Primer Contacto  (entrada manual)                 │
│ • En Conversación           (agente activo)                  │
│ • Negociando Plan           (discutiendo opciones)           │
├──────────────────────────────────────────────────────────────┤
│ FASE ESPERA (ámbar)                                          │
├──────────────────────────────────────────────────────────────┤
│ • Compromiso de Pago        (cliente prometió pagar)         │
│ • Verificando Pago          (cliente dice que pagó)          │
├──────────────────────────────────────────────────────────────┤
│ FASE CERRADO (gris)                                          │
├──────────────────────────────────────────────────────────────┤
│ • Resuelto                  (pagó / OK)                      │
│ • Última Oportunidad        (escalación senior, día 38)      │
└──────────────────────────────────────────────────────────────┘
```

### Tags visuales en las cards

| Tag | Significado |
|---|---|
| 💵 ERROR PASARELA | Vino de un fallo de pago automático |
| 🔴 ULTIMA OPP | Está en escalación senior |
| 🟠 PRE-CORTE | 5-8 días de mora (antes del corte automático) |
| 🟡 POST-CORTE | 9-38 días de mora (post corte) |

---

## 8. Status de pagos / items

| Status | Significado |
|---|---|
| `pending` | Item creado, todavía no enviado al cliente |
| `sent` | WhatsApp enviado, cliente aún no abrió |
| `viewed` | Cliente abrió el link de pago |
| `conciliating` | Cliente reportó transferencia, esperando verificación admin |
| `paid` | Pagado y confirmado |
| `failed` | Pago rechazado por la pasarela |
| `expired` | El link expiró sin pago |

---

## 9. WhatsApp en producción

### Estado actual

- ✅ 10 templates aprobados en Meta (verde)
- ✅ Phone Number ID `433494769857633` (+58 424-8800723 "WUIPI Cobranzas")
- ⚠️ **Modo dry-run activo** — los mensajes del riel se acumulan en
  outbox sin llegar a Meta. Esto es a propósito: estamos validando antes
  de enviar en masa.

### Cuándo activar live

Cuando el equipo esté entrenado y los 10 templates validados visualmente
en el tab "WA Outbox":

```bash
vercel env add COBRANZAS_WA_DRY_RUN production
# Valor: false
```

Después del redeploy, los mensajes empiezan a llegar a clientes reales.

### Para probar templates antes de activar

1. Tab **"WA Outbox"**
2. Click "Enviar prueba"
3. Elegí el template, llená variables, poné tu propio número
4. Marcá "Forzar dry-run" (default)
5. Enviar → row aparece en la tabla con status `Dry-run`
6. Click en la row → modal de detalle muestra el mensaje renderizado

---

## 10. Lo que el sistema NO hace todavía

| Falta | Estado |
|---|---|
| Mensajes automáticos del calendario (D-27/D1/D5/D7/etc) | Pendiente Stream C1b |
| Recibir respuestas del cliente en la app cuando toca un botón | Pendiente Stream C3 (webhook inbound + bot Claude) |
| Auto-verificación de transferencias | Bloqueado por Mercantil (transfer-search 99999) |
| Polling de etiquetas Odoo (suspension_temporal, no_suspender) | Pendiente Stream C |

Mientras tanto:
- El equipo arma campañas masivas manualmente desde Cartera
- El equipo verifica transferencias manualmente con "Promover a paid"
- Las respuestas del cliente llegan al WhatsApp Cobranzas (no a la app)

---

## 11. Contactos / referencias

- **Documento original del proyecto**: `cobranzas-instruction.md`
- **Producción**: `https://api.wuipi.net`
- **Phone Number ID** (Meta): `433494769857633`
- **WABA ID** (Meta Business Account): `545157688670835`
- **Número WhatsApp Cobranzas**: `+58 424-8800723`

---

*Última actualización: 2026-05-03 (Stream A + C1a)*
