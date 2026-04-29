// Script one-shot: descifra el body de un webhook de Mercantil almacenado en
// payment_webhook_logs y muestra el JSON real (keys + valores sanitizados)
// para diagnosticar el schema. Uso:
//   node scripts/decrypt-mercantil-webhook.mjs <log_id>
// Si no se pasa log_id, descifra el ultimo registro con _body_text.

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

// ---- Carga env desde .env.local ----
const envText = readFileSync(".env.local", "utf-8");
const env = Object.fromEntries(
  envText.split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

// ---- Junta todas las secretKeys de Mercantil ----
const secretKeys = new Set();
for (const [k, v] of Object.entries(env)) {
  if (k.startsWith("MERCANTIL_") && k.endsWith("_SECRET_KEY") && v) {
    secretKeys.add(v);
  }
}
console.log(`Probando ${secretKeys.size} secretKeys distintas`);

// ---- AES-128/ECB/PKCS5Padding (igual al SDK) ----
function deriveKey(secretKey) {
  const hash = crypto.createHash("sha256").update(secretKey, "utf8").digest();
  return Buffer.from(hash.toString("hex").substring(0, 32), "hex");
}
function decrypt(ciphertext, secretKey) {
  const key = deriveKey(secretKey);
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  decipher.setAutoPadding(true);
  let dec = decipher.update(ciphertext, "base64", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

// ---- Trae el body desde Supabase ----
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const logId = process.argv[2];

let q = sb.from("payment_webhook_logs").select("id, raw_payload, received_at").order("received_at", { ascending: false }).limit(1);
if (logId) q = sb.from("payment_webhook_logs").select("id, raw_payload, received_at").eq("id", logId);

const { data, error } = await q;
if (error) { console.error("Supabase error:", error); process.exit(1); }
if (!data || data.length === 0) { console.error("No se encontro registro"); process.exit(1); }

const row = data[0];
console.log(`\nLog ID: ${row.id}`);
console.log(`Received: ${row.received_at}`);

const bodyText = row.raw_payload?._body_text;
if (!bodyText) { console.error("Sin _body_text"); process.exit(1); }

let parsed;
try { parsed = JSON.parse(bodyText); } catch { parsed = null; }
const ciphertext = parsed?.data || parsed?.transactionData || bodyText;

console.log(`\nCiphertext length: ${ciphertext.length}`);
console.log(`Ciphertext preview: ${ciphertext.slice(0, 60)}...`);

// ---- Probar cada clave ----
let success = null;
for (const key of secretKeys) {
  try {
    const json = decrypt(ciphertext, key);
    const obj = JSON.parse(json);
    success = { keyLen: key.length, json, obj };
    break;
  } catch { /* try next */ }
}

if (!success) {
  console.error("\n❌ NINGUNA clave logro descifrar");
  process.exit(1);
}

console.log(`\n✅ Descifrado OK con clave de ${success.keyLen} chars`);
console.log("\n--- TOP-LEVEL KEYS ---");
console.log(Object.keys(success.obj));
console.log("\n--- JSON COMPLETO (sanitizado) ---");
const sanitize = (obj) => {
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/card|pan|cvv|cedula|phone|mobile/i.test(k)) out[k] = typeof v === "string" ? `[${v.length}c]` : "[redacted]";
      else out[k] = sanitize(v);
    }
    return out;
  }
  return obj;
};
console.log(JSON.stringify(sanitize(success.obj), null, 2));
