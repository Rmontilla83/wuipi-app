// Smoke test del prorrateo. NO toca Odoo ni Supabase.
// Reproduce la función computeProratedAmounts en JS puro y prueba 8 escenarios.

function round2(n) { return Math.round(n * 100) / 100; }

function computeProratedAmounts(invoiceIds, invoiceAmountsUsd, totalAmountUsd) {
  if (invoiceIds.length === 0) return {};
  if (invoiceIds.length === 1) {
    return { [invoiceIds[0]]: round2(totalAmountUsd) };
  }
  const amounts = invoiceAmountsUsd || {};
  const knownAmounts = invoiceIds.map((id) => amounts[id]);
  const allKnown = knownAmounts.every((v) => typeof v === "number" && v > 0);
  const totalKnown = knownAmounts.reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);
  const result = {};
  if (!allKnown || totalKnown <= 0) {
    const equalShare = round2(totalAmountUsd / invoiceIds.length);
    let acc = 0;
    for (let i = 0; i < invoiceIds.length; i++) {
      const id = invoiceIds[i];
      if (i === invoiceIds.length - 1) result[id] = round2(totalAmountUsd - acc);
      else { result[id] = equalShare; acc += equalShare; }
    }
    return result;
  }
  let acc = 0;
  for (let i = 0; i < invoiceIds.length; i++) {
    const id = invoiceIds[i];
    if (i === invoiceIds.length - 1) result[id] = round2(totalAmountUsd - acc);
    else {
      const share = round2((amounts[id] / totalKnown) * totalAmountUsd);
      result[id] = share;
      acc += share;
    }
  }
  return result;
}

// ── Suite de tests ───────────────────────────────────────────────────────
const tests = [
  {
    name: "1 factura sola — ratio 1, devuelve total",
    in: { ids: [100], amounts: { 100: 10 }, total: 10 },
    expect: { 100: 10 },
  },
  {
    name: "1 factura con monto distinto al total (descuento aplicado externamente)",
    in: { ids: [100], amounts: { 100: 10 }, total: 8.50 },
    expect: { 100: 8.50 },
  },
  {
    name: "3 facturas iguales $10 c/u, total $30",
    in: { ids: [100, 200, 300], amounts: { 100: 10, 200: 10, 300: 10 }, total: 30 },
    expect: { 100: 10, 200: 10, 300: 10 },
  },
  {
    name: "3 facturas distintas $5/$10/$15, total $30",
    in: { ids: [100, 200, 300], amounts: { 100: 5, 200: 10, 300: 15 }, total: 30 },
    expect: { 100: 5, 200: 10, 300: 15 },
  },
  {
    name: "3 facturas $5/$10/$15, total $24 (con descuento) — proporcional",
    in: { ids: [100, 200, 300], amounts: { 100: 5, 200: 10, 300: 15 }, total: 24 },
    expect: { 100: 4, 200: 8, 300: 12 },
  },
  {
    name: "3 facturas $10 c/u, total $10.01 — redondeo asimétrico, último absorbe",
    in: { ids: [100, 200, 300], amounts: { 100: 10, 200: 10, 300: 10 }, total: 10.01 },
    expect: { 100: 3.34, 200: 3.34, 300: 3.33 },
  },
  {
    name: "Legacy: 3 facturas pero invoiceAmountsUsd null — split equitativo",
    in: { ids: [100, 200, 300], amounts: null, total: 30 },
    expect: { 100: 10, 200: 10, 300: 10 },
  },
  {
    name: "Legacy: 3 facturas, $30.01 con split equitativo, último absorbe",
    in: { ids: [100, 200, 300], amounts: null, total: 30.01 },
    expect: { 100: 10, 200: 10, 300: 10.01 },
  },
  {
    name: "Legacy parcial: amounts solo de 2 de 3 facturas → split equitativo",
    in: { ids: [100, 200, 300], amounts: { 100: 10, 200: 10 }, total: 30 },
    expect: { 100: 10, 200: 10, 300: 10 },
  },
  {
    name: "Caso real Stripe: 5 facturas Jose Alejandro $1233 total",
    in: { ids: [1, 2, 3, 4, 5], amounts: { 1: 246.6, 2: 246.6, 3: 246.6, 4: 246.6, 5: 246.6 }, total: 1233 },
    expect: { 1: 246.6, 2: 246.6, 3: 246.6, 4: 246.6, 5: 246.6 },
  },
];

let passed = 0, failed = 0;
for (const t of tests) {
  const got = computeProratedAmounts(t.in.ids, t.in.amounts, t.in.total);
  const ok = JSON.stringify(got) === JSON.stringify(t.expect);
  const sumGot = Object.values(got).reduce((s, v) => s + v, 0);
  const sumOk = Math.abs(sumGot - t.in.total) < 0.001;
  const allOk = ok && sumOk;
  console.log(`${allOk ? "✅" : "❌"} ${t.name}`);
  console.log(`   in: ids=${JSON.stringify(t.in.ids)} amounts=${JSON.stringify(t.in.amounts)} total=$${t.in.total}`);
  console.log(`   got: ${JSON.stringify(got)} sum=$${sumGot.toFixed(2)}`);
  if (!allOk) {
    console.log(`   expected: ${JSON.stringify(t.expect)}`);
    if (!sumOk) console.log(`   ⚠️  Suma NO matchea total: ${sumGot} vs ${t.in.total}`);
    failed++;
  } else {
    passed++;
  }
}
console.log(`\n${passed} pass / ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
