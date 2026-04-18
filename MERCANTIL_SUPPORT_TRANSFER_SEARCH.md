# Mercantil Soporte — Búsqueda de Transferencias (PRODUCCIÓN) rechaza con code=99999

## Resumen

Integración de "Búsqueda de Transferencias" (Producto 6) que funcionó en **sandbox** está devolviendo `HTTP 500` con `code: 99999` en **producción**, usando las credenciales recién aprobadas.

## Credenciales utilizadas (producción)

- **Código de afiliación:** 217546
- **X-IBM-Client-Id:** 5efd05f34c436329cfada75f694ee21b
- **Número de persona:** 11269635
- **Clave de cifrado:** 0011269635J000000411567710201806210262
- **Endpoint:** `https://apimbu.mercantilbanco.com/mercantil-banco/prod/v1/payment/transfer-search`

## Request enviado (después de cifrado AES-128-ECB)

```json
{
  "merchantIdentify": {
    "integratorId": 31,
    "merchantId": 217546,
    "terminalId": ""
  },
  "clientIdentify": {
    "ipAddress": "127.0.0.1",
    "browserAgent": "Mozilla/5.0"
  },
  "transferSearchBy": {
    "account": "foQtNnYE+07bLOmrAI8GfeGVq9zh1f76ydfRzipGluk=",
    "issuerCustomerId": "OTtKFXdj43LKmaqBdkZX9A==",
    "trxDate": "2026-04-18",
    "issuerBankId": 105,
    "transactionType": 1,
    "paymentReference": "0025583242567",
    "amount": 0.79
  }
}
```

**Valores planos (para verificación):**
- `account` (cifrado) = `01050745651745103031` (cuenta Wuipi en Mercantil)
- `issuerCustomerId` (cifrado) = `16006905` (cédula del cliente sin prefijo V)

## Response recibido

```json
HTTP 500 Internal Server Error
{
  "processingDate": "2026-04-18 11:56:38 VET",
  "infoMsg": {
    "guId": "db44543f-098d-4c70-8b94-9fe6766e5c35",
    "channel": "0006",
    "subchannel": "01",
    "applId": "OLB",
    "applVersion": "",
    "personId": "0",
    "userId": "",
    "token": "abcd",
    "action": "",
    "tokenS": ""
  },
  "code": 99999
}
```

## x-global-transaction-id para rastreo

Algunos de los IDs generados en nuestras pruebas (para referencia del equipo de soporte):
- `c2c1944d69e3a9b6e102d89f`
- `c2c1944d69e3a9b73b72f0c3`

## Pruebas realizadas (todas dan el mismo error 99999)

| # | Variante | Resultado |
|---|---|---|
| 1 | Formato documentado (`transferSearchBy` con paymentReference + amount) | 500/99999 |
| 2 | Sin paymentReference/amount, `transferSearch` (nombre corto) | 500/99999 |
| 3 | `merchantId` como entero | 500/99999 |
| 4 | Agregando `personNumber` cifrado en `transferSearchBy` | 500/99999 |
| 5 | Agregando `personId` plano en `transferSearchBy` | 500/99999 |
| 6 | `personNumber` en `merchantIdentify` | 500/99999 |

## Pregunta concreta para Mercantil

1. ¿Las credenciales de producción del "Código de afiliación 217546" están **efectivamente activas** para el producto "Búsqueda de Transferencias"?
2. ¿Requiere algún parámetro adicional en el payload que no esté documentado en el manual (ej. `personId`, `channel`, `applId`)?
3. ¿El cifrado AES-128-ECB con la "Clave de Cifrado" (SHA-256 → primeros 16 bytes) es correcto para los campos `account` e `issuerCustomerId`?
4. ¿Mismo `X-IBM-Client-Id` para todos los productos o hay uno específico para Búsqueda de Transferencias en producción?

## Contexto técnico

- Integrador: **WUIPI TECH, C.A.**
- SDK propio (no usamos integrador terceros).
- En **sandbox** el mismo formato con credenciales de prueba funcionaba.
- El certificado/conexión HTTPS OK (la API responde, solo que rechaza con 99999).

## Contacto técnico

Rafael Montilla · rafaelmontilla8@gmail.com · 0424-8672759
