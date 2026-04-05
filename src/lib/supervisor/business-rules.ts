// ============================================
// Business Rules & Context for Supervisor IA
// ============================================
// These rules are injected into AI prompts so the models
// understand Wuipi's business logic and avoid false alerts.
// Update this file as the business evolves.
// ============================================

export const BUSINESS_RULES = `
REGLAS DE NEGOCIO DE WUIPI TELECOMUNICACIONES:

FACTURACION Y COBRANZA:
- Las facturas (borradores) se generan a principios de cada mes en USD.
- Es NORMAL que las cuentas por cobrar sean altas los primeros 15 dias del mes.
- No es critico tener CxC altas entre el dia 1 y 15 — es el ciclo natural de facturacion.
- A partir del dia 16 si la cobranza no avanza, si es una alerta.
- El vencimiento real es variable, pero la gestion de cobro se intensifica despues del dia 8.
- Los borradores se mantienen en USD. Al momento del pago se convierten a VED a la tasa BCV del dia.
- NO hay perdida cambiaria porque la conversion ocurre al momento del pago, no antes.
- La tasa BCV es solo referencia para conversion, no un riesgo.

COMO EVALUAR LA COBRANZA:
- Dia 1-15 del mes: CxC altas es NORMAL. Evaluar como "en proceso".
- Dia 16-25: Si la cobranza no ha alcanzado al menos 60% de efectividad, es WARNING.
- Dia 26+: Si queda mas del 30% sin cobrar, es HIGH. Si queda mas del 50%, es CRITICAL.
- Comparar siempre contra el mes anterior para detectar tendencias.

MRR Y SERVICIOS:
- El MRR se calcula desde sale.order.line (servicios activos) con price_subtotal.
- Cada nodo Mikrotik tiene un MRR asociado = suma de los servicios activos en ese nodo.
- El % de MRR de un nodo = (MRR del nodo / MRR global) * 100.
- Un nodo con >5% del MRR global caido es critico porque afecta ingresos significativos.
- Un nodo con <1% del MRR global caido es bajo impacto financiero (pero igual hay que atenderlo).

ROLES Y VISIBILIDAD:
- Gerente de Operaciones: NO debe ver montos en dolares. Solo ve:
  - % de MRR que representa cada nodo (para dar peso al impacto)
  - Cantidad de servicios activos/suspendidos
  - Estado de red, tickets, SLA
- Gerente de Finanzas: Ve todo en USD y VED, tasas, cobranza, morosos.
- Gerente Comercial: Ve pipeline, conversion, leads, churn, retention.
- Socios/CEO: Ve todo, vision 360.

SERVICIOS:
- Un servicio = una linea de suscripcion (sale.order.line) en Odoo.
- Estado "progress" = activo y facturando.
- Estado "suspended" = pausado (no factura, posible churn).
- Si un nodo tiene >20% de servicios suspendidos, es senal de problema en esa zona.

SOPORTE (KOMMO):
- Los tickets vienen de Kommo CRM, pipeline "Embudo de SOPORTE".
- Las categorias reales son: Sin Servicio, Lentitud/Intermitencia, Red Interna, Infraestructura, Gestion, Cableado, Desincorporacion, Administrativo, Visita L2C, Bot/Reactivado.
- "Sin Servicio" y "Lentitud/Intermitencia" son las mas criticas para el cliente.

COBRANZAS:
- El pipeline de cobranzas tiene etapas: Entrantes > Contacto > Info enviada > Gestion suspendidos > Pre-retiro > Cobranza activa > Recuperado / Retirado.
- Recovery rate = recuperados / (recuperados + retirados).
- Un recovery rate >50% es aceptable. <30% es critico.
`;

/**
 * Returns the current day of month to help AI understand billing cycle context.
 */
export function getBillingCycleContext(): string {
  const now = new Date();
  const day = now.getDate();
  const monthName = now.toLocaleDateString("es-VE", { month: "long", timeZone: "America/Caracas" });

  if (day <= 15) {
    return `Estamos en dia ${day} de ${monthName} — INICIO de ciclo de facturacion. Las CxC altas son normales en este periodo. Evaluar como "en proceso de cobro".`;
  } else if (day <= 25) {
    return `Estamos en dia ${day} de ${monthName} — MITAD de ciclo. La cobranza deberia estar avanzando. Si la efectividad es <60%, es una alerta.`;
  } else {
    return `Estamos en dia ${day} de ${monthName} — FIN de ciclo. Lo que quede sin cobrar es preocupante. Evaluar rigurosamente.`;
  }
}
