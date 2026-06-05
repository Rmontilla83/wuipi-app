# Base de conocimiento — Pasarelas, pagos y portal del cliente (Soportín)

> **Para qué sirve este documento**
> 1. Alimentar al asistente **Soportín** (web y portal de Wuipi) con todo lo que necesita para
>    responder preguntas de clientes sobre **cómo pagar**, qué métodos hay, cómo verificar un pago,
>    qué hacer cuando algo falla, y **cómo usar el portal del cliente** (acceso, facturas, mi
>    conexión, cambio de plan, soporte).
> 2. Servir de fuente para escribir **artículos de ayuda** (ver Parte B al final).
>
> **Estructura:** Parte A-1 (pagos) · Parte A-2 (portal del cliente) · Parte B (artículos).
>
> **Verificado contra el código en producción** (`api.wuipi.net`) — última revisión: 2026-06-05.
> Si cambian los métodos o la cuenta, **este documento debe actualizarse** antes que la respuesta del bot.

---

## ⚠️ Reglas de oro para Soportín (leer primero)

1. **Tono:** profesional venezolano, de "usted", sin jerga técnica. El cliente no sabe qué es un
   "webhook", un "switch" ni una "tasa BCV inversa". Tradúcele todo a lenguaje simple.
2. **Métodos que SÍ puedes ofrecer hoy:** Débito Inmediato, Transferencia bancaria, Tarjeta
   (nacional o internacional) y PayPal.
3. **NO ofrezcas ni menciones** el "Pago Móvil C2P" ni el número de Pago Móvil de Wuipi:
   están **desactivados temporalmente**. Si el cliente insiste en pagar por Pago Móvil, ofrécele
   **Transferencia** como alternativa equivalente en bolívares.
4. **Nunca inventes** números de cuenta, montos, tasas ni tiempos. Si no estás seguro, di que vas
   a derivar el caso a un agente de cobranzas por WhatsApp.
5. **Datos sensibles:** nunca pidas al cliente su clave de banco, PIN, ni el CVV de su tarjeta por
   chat. Esos datos solo se ingresan dentro del portal seguro del banco o de la pasarela.
6. **El cliente paga en el portal de pago**, no por el chat. Tu trabajo es **guiarlo hasta el
   portal** y explicarle cada paso, no cobrarle tú.
7. **Cuándo derivar a un humano (WhatsApp cobranzas):** pago que lleva más de 1 hora "en
   verificación", monto que no cuadra, transferencia hecha a otra cuenta, o cualquier reclamo de
   dinero descontado sin servicio activado.

---

# PARTE A-1 — Pagos y pasarelas

## 1. ¿Cómo paga un cliente? (panorama)

Wuipi factura el servicio de internet **en dólares (USD)**, pero el cliente puede pagar **en
bolívares** (con la tasa BCV del día) o **en divisas** (tarjeta internacional / PayPal). Todo se
hace desde un **portal de pago web seguro**, sin necesidad de instalar nada.

El cliente llega al portal de dos formas:

- **Link de pago permanente** que recibe por correo, SMS o WhatsApp. Es su enlace personal
  (`.../pagar/cliente/...`). Siempre muestra su deuda actualizada al momento.
- **Botón "Pagar"** dentro de su portal de cliente (estado de cuenta / facturas).

Una vez dentro, el portal le muestra:

- Su nombre y datos.
- El **monto total a pagar en USD** y su equivalente **en bolívares** con la **tasa BCV del día**.
- El detalle de cada factura pendiente (puede pagar **todo** o, si tiene varias, **una sola
  factura**).
- Los **métodos de pago** disponibles.

---

## 2. Métodos de pago (los 4 activos)

### 2.1 Débito Inmediato (recomendado para pagar en bolívares)

- **Qué es:** el cliente paga en bolívares directamente desde su banco a través del **Botón de
  Pagos de Mercantil**. Dentro de ese botón puede elegir débito directo, tarjeta de débito o clave
  de pago, según su banco.
- **Moneda:** bolívares (Bs).
- **Cómo se ve para el cliente:**
  1. Selecciona **"Débito Inmediato"** en el portal.
  2. Presiona pagar y es redirigido a la página segura del **Botón de Pagos de Mercantil**.
  3. Ingresa los datos que le pide su banco (no a Wuipi) y confirma.
  4. Regresa al portal, que verifica el pago automáticamente.
- **Tiempo de confirmación:** normalmente **60 a 90 segundos**. El portal se queda "buscando" la
  confirmación; el cliente no debe cerrar la página.
- **Limitación conocida:** si el cliente tiene cuenta **Mercantil** y paga con débito directo
  Mercantil→Mercantil, a veces su banco lo bloquea (error **4025**) por un límite interno de la
  cuenta. En ese caso, sugiérele **Transferencia** o **tarjeta de otro banco**.

### 2.2 Transferencia bancaria (pago en bolívares con verificación automática)

- **Qué es:** el cliente transfiere a la cuenta de Wuipi en Mercantil y luego **reporta** la
  transferencia en el portal. El sistema la **busca y verifica automáticamente** contra Mercantil.
- **Moneda:** bolívares (Bs).
- **Datos de la cuenta de Wuipi (estos sí puedes dárselos al cliente):**

  | Dato | Valor |
  |---|---|
  | Banco | Mercantil C.A., Banco Universal |
  | Tipo de cuenta | Corriente |
  | Número de cuenta | **0105 0745 65 1745103031** |
  | RIF | **J-41156771-0** |
  | Razón social | WUIPI TECH, C.A. |

- **Cómo se ve para el cliente:**
  1. Selecciona **"Transferencia Bancaria"**.
  2. El portal le muestra los datos de la cuenta (puede copiarlos) y el **monto exacto en Bs** que
     debe transferir.
  3. Hace la transferencia desde su app/banca en línea.
  4. Vuelve al portal e ingresa: **el banco desde el que transfirió** y el **número de referencia**
     de la operación.
  5. Presiona "Confirmar". El sistema busca la transferencia en Mercantil (de hoy, ayer y hasta 2
     días atrás).
- **Resultado:**
  - Si encuentra la transferencia con el monto correcto → **pago confirmado al instante**.
  - Si no la encuentra todavía → queda **"en verificación"** y un agente la revisa manualmente.
- **Punto crítico — el monto debe coincidir:** el cliente debe transferir **exactamente el monto en
  Bs que muestra el portal**. Si transfiere otro monto (por ejemplo, calculado con una tasa
  distinta o de un día anterior), el sistema confirma que la transferencia existe pero **no la da
  por pagada automáticamente** porque el monto no cuadra; ahí entra cobranzas a regularizar.

### 2.3 Tarjeta nacional o internacional / Divisas (Stripe)

- **Qué es:** pago con **tarjeta Visa, Mastercard o American Express**, en **dólares**, mediante la
  pasarela segura **Stripe**.
- **Moneda:** dólares (USD).
- **Cómo se ve para el cliente:**
  1. Selecciona **"Tarjeta Nacional o Internacional (Divisas)"**.
  2. Es llevado al formulario seguro de Stripe.
  3. Ingresa los datos de su tarjeta y confirma.
  4. Si el banco pide verificación (3D Secure / clave por SMS o app), debe completarla.
- **Monto mínimo:** **$0.50 USD** (requisito de la pasarela). Si la deuda es menor, esta opción
  aparece deshabilitada y el cliente debe usar otro método.
- **Tiempo de confirmación:** casi inmediato.

### 2.4 PayPal

- **Qué es:** pago con cuenta **PayPal** o con tarjeta a través de PayPal, en **dólares**.
- **Moneda:** dólares (USD).
- **Cómo se ve para el cliente:**
  1. Selecciona **"PayPal"**.
  2. Es redirigido a PayPal, inicia sesión (o paga como invitado con tarjeta) y aprueba el pago.
  3. Regresa al portal, que confirma la operación.
- **Tiempo de confirmación:** casi inmediato al aprobar en PayPal.

### 2.5 Pago Móvil / C2P — **DESACTIVADO (no ofrecer)**

- Estos métodos existen en el sistema pero están **apagados temporalmente** desde el 2026-05-11.
- **Soportín no debe ofrecerlos ni dar el número de Pago Móvil de Wuipi.**
- Si el cliente quiere pagar en bolívares desde su teléfono, la alternativa correcta hoy es
  **Transferencia bancaria** o **Débito Inmediato**.

---

## 3. Monedas y tasa BCV (cómo se calcula el monto)

- Las facturas se generan **en dólares (USD)**.
- Para los métodos en bolívares (Débito Inmediato y Transferencia), el portal **convierte el monto
  a Bs usando la tasa BCV oficial del día**.
- La tasa y el monto en Bs se **muestran en pantalla** en el momento. El cliente debe pagar **ese
  monto exacto**.
- Importante explicarle al cliente: como la tasa BCV cambia, **el monto en Bs de hoy puede ser
  distinto al de ayer**. Por eso debe transferir el monto que ve en ese momento, no uno que anotó
  días antes.
- Para tarjeta y PayPal el cobro es **en dólares**, sin conversión.

---

## 4. Tiempos de confirmación y estados del pago

Cuando el cliente termina de pagar, el portal entra en modo "buscando confirmación":

| Estado | Qué significa | Qué decirle al cliente |
|---|---|---|
| **Pagado / Confirmado** | El pago fue verificado. | "Su pago fue confirmado. Su servicio queda al día." |
| **En verificación** | El pago existe pero falta confirmarlo (transferencia no encontrada aún, o monto por revisar). | "Su pago está en proceso de verificación. Le notificaremos por WhatsApp en cuanto se confirme." |
| **No confirmado / Rechazado** | El banco o la pasarela rechazó el pago. | Explicar el motivo (ver sección 5) y sugerir reintentar u otro método. |

Detalles útiles:

- Tras pagar, el portal busca la confirmación de forma **automática durante varios minutos**. El
  cliente **no debe cerrar la página** ni volver a pagar.
- Si el banco se tarda, el portal puede mostrar "no pudimos confirmar aún" pero **sigue revisando
  en segundo plano**; si el pago entra después, se actualiza solo.
- **Regla práctica:** si un pago lleva **más de 1 hora "en verificación"**, deriva el caso a
  cobranzas por WhatsApp con los datos (nombre, monto, referencia, fecha).

---

## 5. Errores comunes y qué decirle al cliente

> Estas son traducciones de los códigos reales de las pasarelas a lenguaje de cliente. **Siempre
> reformula en "usted" y sin jerga.** Nunca le des el número de código al cliente como si fuera la
> respuesta; explícale el motivo y la acción.

### Débito Inmediato / Botón de Pagos Mercantil

| Situación | Qué pasó | Qué decirle / qué hacer |
|---|---|---|
| Error **4025** | Su banco bloqueó el débito Mercantil→Mercantil por un límite interno. | "Su banco bloqueó esa operación. Intente con **Transferencia** o con una **tarjeta de otro banco**." |
| **Fondos insuficientes** | No hay saldo suficiente. | "La cuenta no tenía saldo suficiente. Verifique su saldo e intente de nuevo, o use otro método." |
| **Clave de pago inválida** | Ingresó mal la clave dinámica de su banco. | "La clave no fue aceptada. Solicite una clave nueva en su banco e intente otra vez; las claves expiran rápido." |
| **Excede límite** | Superó su límite diario o por operación. | "El monto supera su límite con el banco. Suba el límite en su banca en línea o pague en montos menores." |
| **Tarjeta vencida** | La tarjeta está vencida. | "La tarjeta está vencida. Use una tarjeta vigente u otro método." |
| **No afiliado** | No tiene activado el servicio de clave de pago. | "Debe afiliar el servicio de pago en su banca en línea, o use **Transferencia**." |
| **Operación rechazada / motivos técnicos** | Rechazo o falla temporal del banco. | "Su banco rechazó la operación. Intente en unos minutos o consulte con su banco; también puede usar otro método." |

### Tarjeta (Stripe)

| Situación | Qué decirle |
|---|---|
| Tarjeta rechazada | "Su banco rechazó la tarjeta. Pruebe con otra tarjeta o use transferencia." |
| Fondos insuficientes | "La tarjeta no tiene fondos suficientes. Intente con otra o pague un monto parcial." |
| Tarjeta vencida | "La tarjeta está vencida. Use una vigente." |
| CVC/código incorrecto | "El código de seguridad no coincide. Verifique los 3 dígitos al reverso de la tarjeta." |
| Requiere autenticación (3D Secure) | "Su banco pidió una verificación adicional. Reintente y complete el SMS o la app de su banco." |

### PayPal

| Situación | Qué decirle |
|---|---|
| Instrumento rechazado | "PayPal rechazó la tarjeta o cuenta. Pruebe otro método dentro de PayPal, o use tarjeta/transferencia." |
| Cuenta restringida | "Su cuenta PayPal tiene una restricción. Resuélvala con PayPal o use otro método." |
| Pago no aprobado | "El pago no se completó en PayPal (se cerró la ventana). Intente de nuevo y apruebe el pago." |

### Transferencia "en verificación"

Si la transferencia no se confirmó sola, los motivos más comunes son:

1. **Monto distinto:** transfirió un monto diferente al que mostraba el portal (por tasa o por
   error). → Derivar a cobranzas para regularizar.
2. **Datos de la referencia mal copiados** (banco o número de referencia equivocado). → Pedirle que
   verifique y vuelva a reportar con la referencia correcta.
3. **Transfirió a otra cuenta** que no es la de Wuipi. → Verificar la cuenta destino (la de Wuipi
   **termina en 3031**).
4. **La transferencia aún no aparece** en el sistema bancario (puede tardar). → Esperar; el sistema
   reintenta. Si pasa más de 1 hora, derivar.

---

## 6. Preguntas frecuentes (respuestas modelo para el cliente)

**P: ¿Cómo pago mi servicio?**
R: Desde su link de pago personal (el que recibe por correo o WhatsApp) o desde el botón "Pagar" en
su portal. Allí verá su deuda y podrá pagar por Débito Inmediato, Transferencia, Tarjeta o PayPal.

**P: ¿Puedo pagar en bolívares?**
R: Sí. Use **Débito Inmediato** o **Transferencia bancaria**; el portal le muestra el monto exacto
en bolívares con la tasa del día.

**P: ¿Puedo pagar con tarjeta internacional o en dólares?**
R: Sí, con **Tarjeta (Visa/Mastercard/Amex)** o **PayPal**, en dólares.

**P: Ya transferí, ¿qué hago?**
R: Vuelva al portal, seleccione "Transferencia", indique el banco desde el que transfirió y el
número de referencia, y presione "Confirmar". El sistema la verifica automáticamente.

**P: ¿A qué cuenta transfiero?**
R: Mercantil, cuenta corriente **0105 0745 65 1745103031**, RIF **J-41156771-0**, a nombre de
**WUIPI TECH, C.A.** Transfiera **el monto exacto en bolívares** que le muestra el portal.

**P: Pagué pero el portal dice "en verificación".**
R: Su pago está siendo verificado; no es necesario pagar de nuevo. Le notificaremos por WhatsApp al
confirmarse. Si han pasado más de unas horas, le ayudo a revisarlo con cobranzas.

**P: Me salió el error 4025 / no me deja con débito.**
R: Su banco bloqueó ese débito por un límite interno. Pruebe con **Transferencia** o con una
**tarjeta de otro banco**.

**P: ¿Puedo pagar por Pago Móvil?**
R: Por ahora el Pago Móvil no está disponible. Puede pagar en bolívares por **Transferencia** o
**Débito Inmediato**, que son equivalentes.

**P: ¿El monto cambió desde ayer?**
R: El monto en bolívares se calcula con la tasa BCV del día, así que puede variar. Pague siempre el
monto que ve en ese momento en el portal.

**P: ¿Me descontaron y no tengo servicio / no se reflejó?**
R: Lamento el inconveniente. Páseme su nombre, el monto, la referencia y la fecha del pago y lo
escalo de inmediato a cobranzas para regularizarlo.

---

## 7. Datos rápidos (chuleta para el bot)

- **Cuenta Wuipi (transferencias):** Mercantil · Corriente · **0105 0745 65 1745103031** · RIF
  **J-41156771-0** · WUIPI TECH, C.A.
- **Métodos activos:** Débito Inmediato, Transferencia, Tarjeta (Stripe, USD), PayPal (USD).
- **Métodos apagados (no ofrecer):** Pago Móvil, C2P.
- **Mínimo con tarjeta:** $0.50 USD.
- **Confirmación típica:** 60–90 s (débito); casi inmediata (tarjeta/PayPal); transferencia: al
  instante si cuadra, o "en verificación" para revisión manual.
- **Derivar a WhatsApp cobranzas si:** >1 h en verificación, monto no cuadra, transfirió a otra
  cuenta, o dinero descontado sin servicio.
- **Nunca pedir por chat:** clave de banco, PIN, CVV.

---

# PARTE A-2 — Portal del cliente

El **portal del cliente** (en `api.wuipi.net`) es donde el cliente inicia sesión y gestiona su
cuenta: ve sus facturas, sus servicios, la calidad de su conexión, paga, pide cambio de plan y chatea
contigo (Soportín). **El portal de pago de la Parte A-1 es a donde lo lleva el botón "Pagar"**; es
una pieza del portal, no algo separado para el cliente.

## 8. Acceso e inicio de sesión

- **El cliente entra con su correo y una contraseña** (no es enlace mágico). La página de acceso es
  `/portal/acceso`.
- **Solo pueden entrar clientes registrados de Wuipi:** el sistema valida el correo contra la base de
  clientes (Odoo). Si el correo no está registrado como cliente, no podrá crear cuenta.
- **Primer ingreso:** el cliente escribe su correo; si es cliente pero aún no tiene contraseña, el
  portal le pide **crear una** (mínimo 8 caracteres). Si ya la tiene, le pide iniciar sesión.
- **Olvidó su contraseña:** desde `/portal/acceso` puede pedir un enlace de recuperación que le llega
  por correo; con ese enlace crea una nueva contraseña.
- **La sesión se mantiene** por un buen tiempo; si caduca, normalmente se renueva sola. Si el cliente
  cambió de teléfono/navegador o borró datos, quizá deba iniciar sesión otra vez.

**Problemas de acceso comunes y qué decirle:**

| Mensaje / situación | Causa | Qué decirle |
|---|---|---|
| "No te encontramos como cliente" | El correo no está registrado en Wuipi, o no coincide con el que tiene en su cuenta. | "Verifique que use el mismo correo que registró con Wuipi. Si no está seguro, le ayudo a confirmarlo con el equipo." |
| "Contraseña incorrecta" | El correo existe pero la clave no coincide. | "Use la opción **¿Olvidó su contraseña?** para crear una nueva." |
| No le llega el correo de recuperación | Demora o carpeta de spam. | "Revise su carpeta de spam/correo no deseado. El enlace puede tardar unos minutos." |
| "La sesión expiró" | Cambió de navegador/dispositivo o se limpiaron datos. | "Inicie sesión nuevamente con su correo y contraseña." |

> El cliente **no puede cambiar su correo desde el portal** (eso se gestiona con soporte). Si necesita
> cambiarlo, deriva a Cuentas por Cobrar.

## 9. Secciones del portal y qué puede hacer el cliente

| Sección | Qué ve / qué puede hacer |
|---|---|
| **Inicio** | Resumen: servicios activos, facturas pendientes, saldo, accesos rápidos. |
| **Facturas** | Lista de facturas pendientes y pagadas; expandir cada una; botón **Pagar**; descargar factura fiscal (PDF SENIAT) cuando está disponible. |
| **Servicios / Suscripciones** | Sus planes activos y pausados, velocidad y precio mensual; botón **Solicitar cambio de plan**. |
| **Mi Conexión** | Calidad de su servicio: puntaje, velocidad, latencia (cuando hay datos disponibles). |
| **Soporte / Ayuda** | Este chat contigo (Soportín) y derivación a WhatsApp del departamento correcto. |
| **Cambiar contraseña** | Actualizar su clave de acceso. |

**Lo que el cliente NO puede hacer desde el portal** (deriva al departamento correcto):
cambiar su correo, pausar/reactivar el servicio por su cuenta, ver datos de otros clientes, ni hacer
cambios de plan directamente (solo **solicitarlos**).

## 10. Facturas en el portal

- El cliente ve cada factura con su **número, fecha de emisión y vencimiento, estado** (pagada,
  pendiente, parcial) y **monto**.
- Al **expandir** una factura ve el detalle: **servicio/producto, precio, IVA y total**, y los
  **pagos ya aplicados** (fecha, monto, método).
- Si la factura ya está validada fiscalmente, puede **descargar el PDF de la factura SENIAT**.
- Arriba ve su **resumen de cuenta**: total pendiente en USD, **saldo a favor** si tiene crédito, y el
  **monto a pagar**.
- El botón **"Pagar"** lo lleva al portal de pago (Parte A-1) con su deuda ya cargada.

**Cómo explicarle una factura:** dile en lenguaje simple qué servicio cubre, el período, el monto con
IVA y si tiene pagos aplicados. Si tiene **saldo a favor**, explícale que es un crédito que se le
descuenta de lo que debe.

## 11. Mi Conexión (calidad del servicio)

- Muestra un **puntaje de calidad (0–100)**, la **velocidad actual** (comparada con su plan
  contratado) y la **latencia**.
- Sirve para que el cliente vea si su servicio anda bien sin necesidad de llamar.
- **Importante (gestión de expectativas):** la velocidad real medida casi siempre es algo **menor a
  la contratada** (WiFi, dispositivos, hora pico); eso es normal. Solo es problema si está muy por
  debajo de forma sostenida.
- A veces no hay mediciones recientes (servicio suspendido, sin tráfico, o datos no disponibles): en
  ese caso el portal lo indica y no significa que el servicio esté caído.
- Si el cliente reporta lentitud: primero los pasos de la sección 13 (reiniciar router, etc.); si no
  mejora, deriva a **Soporte Técnico**.

## 12. Cambio de plan

- En **Servicios / Suscripciones**, el cliente presiona **"Solicitar cambio de plan"**, escribe el
  plan que desea y notas opcionales, y envía la solicitud.
- **Es una solicitud, no un cambio inmediato:** queda registrada y el equipo de **Ventas** lo
  contacta. Dile siempre que recibirá contacto, no que el plan ya cambió.
- Para mudanzas o nuevas contrataciones también es **Ventas**.

## 13. Soporte, derivación a WhatsApp y datos de la empresa

Cuando el caso excede lo que puedes resolver, **deriva al departamento correcto** indicando el
horario. (En el portal, el sistema genera el botón verde de WhatsApp automáticamente.)

| Departamento | Para qué | WhatsApp | Horario |
|---|---|---|---|
| **Soporte Técnico** | Conexión, lentitud, caídas | +58 424 8800794 | Lun–Dom 8:00 AM – 12:00 AM |
| **Cuentas por Cobrar** | Saldo, facturas, pagos, reconexión | +58 424 8800723 | Lun–Vie 8:00 AM – 5:00 PM |
| **Ventas** | Nuevas contrataciones, cambio de plan, mudanza | +58 424 8800765 | Lun–Vie 8:00 AM – 5:00 PM |

**Datos de la empresa (puedes compartirlos):**
- Wuipi — ISP en Anzoátegui, Venezuela.
- Oficinas: **Puerto La Cruz** (Av. La Tinia, Qta. Cerro Alto #1) y **Lechería** (C.C. La Concha,
  Local 14).
- Teléfono general: **+58 281 7721141**.

**Pasos para diagnosticar internet lento (antes de derivar):**
1. ¿Falla en todos los dispositivos o solo en uno?
2. Reiniciar el router: desconectarlo 30 segundos y volver a conectarlo.
3. Si es por WiFi: acercarse al router y revisar cuántos dispositivos están conectados.
4. Hacer una prueba de velocidad (speed test) en wuipi.net.
5. Si no mejora tras 2–3 intentos, derivar a **Soporte Técnico**.

## 14. Chuleta del portal (rápido)

- **Acceso:** correo + contraseña en `/portal/acceso`. Solo clientes registrados. ¿Olvidó la clave? →
  enlace de recuperación por correo.
- **Secciones:** Inicio · Facturas · Servicios · Mi Conexión · Ayuda · Cambiar contraseña.
- **Pagar:** botón "Pagar" en Facturas → portal de pago (Parte A-1).
- **Cambio de plan:** es solicitud → lo contacta Ventas.
- **Derivar:** Técnico 8800794 (todos los días) · Cobranzas 8800723 (L-V) · Ventas 8800765 (L-V).
- **No por el portal:** cambiar correo, pausar servicio, cambiar plan directo → deriva.

---

# PARTE B — Borradores de artículos de ayuda

> Listos para publicar en el centro de ayuda / blog. Ajusta títulos y enlaces según el CMS.

## Artículo 1 — "Cómo pagar tu servicio Wuipi: guía paso a paso"

**Resumen:** Explica el acceso al portal y los 4 métodos.

1. Cómo llegar al portal de pago (link personal / botón "Pagar").
2. Qué información verás (deuda en USD y en Bs, detalle de facturas).
3. Los métodos disponibles y cuándo conviene cada uno:
   - Débito Inmediato → pagar en Bs desde tu banco.
   - Transferencia → si prefieres transferir y reportar.
   - Tarjeta (divisas) → Visa/Mastercard/Amex en USD.
   - PayPal → con tu cuenta PayPal en USD.
4. Qué esperar después de pagar (confirmación y notificación por WhatsApp).

## Artículo 2 — "Pagar por transferencia bancaria sin complicaciones"

1. Datos de la cuenta de Wuipi (Mercantil, cuenta terminada en 3031, RIF, razón social).
2. **Transfiere el monto exacto en bolívares** que muestra el portal (explicar la tasa BCV del día).
3. Cómo reportar la transferencia: banco de origen + número de referencia.
4. Verificación automática: qué significa "confirmado" vs "en verificación".
5. Errores frecuentes: monto distinto, referencia mal copiada, cuenta equivocada.

## Artículo 3 — "¿Pagué y dice 'en verificación'? Qué significa y qué hacer"

1. Por qué un pago queda en verificación (transferencia aún no visible, monto por revisar).
2. Qué NO hacer: no pagues de nuevo.
3. Cuánto suele tardar y cómo te avisamos (WhatsApp).
4. Cuándo y cómo contactar a cobranzas (qué datos tener a mano).

## Artículo 4 — "Pagar con tarjeta o PayPal (en dólares)"

1. Cuándo usar divisas vs bolívares.
2. Tarjetas aceptadas y monto mínimo ($0.50 USD).
3. Verificación del banco (3D Secure) y cómo completarla.
4. Errores comunes de tarjeta (rechazada, vencida, CVC, fondos) y cómo resolverlos.

## Artículo 5 — "Me salió un error al pagar: soluciones rápidas"

Tabla de los errores más comunes con su explicación y solución en lenguaje de cliente (basada en la
sección 5 de este documento): 4025, fondos insuficientes, clave inválida, límite excedido, tarjeta
vencida, no afiliado, operación rechazada.

## Artículo 6 — "¿Por qué cambia el monto en bolívares?"

1. Tu servicio se factura en dólares.
2. El monto en Bs se calcula con la tasa BCV del día.
3. Por eso debes pagar el monto que ves en el momento.
4. Pagar con tarjeta/PayPal evita la conversión (cobro directo en USD).

## Artículo 7 — "Cómo entrar a tu portal de cliente Wuipi"

1. Qué es el portal y para qué sirve (facturas, servicios, conexión, soporte).
2. Acceso con correo + contraseña en el portal.
3. Primer ingreso: crear tu contraseña (solo clientes registrados).
4. Olvidé mi contraseña: cómo recuperar el acceso.
5. Problemas frecuentes de acceso y soluciones.

## Artículo 8 — "Entiende tus facturas en el portal"

1. Dónde ver tus facturas pendientes y pagadas.
2. Cómo expandir una factura: servicio, IVA, total y pagos aplicados.
3. Qué significa "saldo a favor" y "monto a pagar".
4. Descargar tu factura fiscal (SENIAT) en PDF.
5. Pagar directamente desde una factura.

## Artículo 9 — "Mi Conexión: cómo leer la calidad de tu servicio"

1. Qué es el puntaje de calidad y cómo se calcula.
2. Por qué la velocidad real suele ser menor a la contratada (y cuándo sí es un problema).
3. Qué hacer si ves "regular" o "necesita atención".
4. Cuándo no hay mediciones disponibles (y por qué no significa servicio caído).

## Artículo 10 — "Cómo solicitar un cambio de plan o una mudanza"

1. Dónde está la opción en Servicios/Suscripciones.
2. Es una solicitud: qué pasa después (te contacta Ventas).
3. Datos útiles para agilizar el cambio.
4. Canales de contacto y horarios.

---

*Fin del documento. Fuente: portal de pago Wuipi (`/pagar`), pasarelas Mercantil/Stripe/PayPal y
diccionario de errores `src/lib/cobranzas/error-translations.ts`. Mantener sincronizado con el
código si cambian métodos, cuenta o tasas.*
