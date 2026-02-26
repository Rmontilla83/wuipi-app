"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, XCircle,
  AlertTriangle, Loader2, ArrowRight, Table2, MapPin, Trash2,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// ============================================
// TYPES
// ============================================
type Step = "upload" | "mapping" | "preview" | "importing" | "done";

interface MappingField {
  key: string;
  label: string;
  required: boolean;
  group: string;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: Array<{ row: number; error: string }>;
}

const BATCH_SIZE = 50;

const MAPPING_FIELDS: MappingField[] = [
  // Identification
  { key: "legal_name", label: "Nombre / Razón Social", required: true, group: "Identificación" },
  { key: "document_type", label: "Tipo Doc (V/J/E/G/P)", required: false, group: "Identificación" },
  { key: "document_number", label: "Nro Documento", required: false, group: "Identificación" },
  // Contact
  { key: "email", label: "Email", required: false, group: "Contacto" },
  { key: "phone", label: "Teléfono", required: false, group: "Contacto" },
  { key: "phone_alt", label: "Teléfono Alt.", required: false, group: "Contacto" },
  // Location
  { key: "address", label: "Dirección", required: false, group: "Ubicación" },
  { key: "city", label: "Ciudad", required: false, group: "Ubicación" },
  { key: "state", label: "Estado", required: false, group: "Ubicación" },
  { key: "sector", label: "Sector", required: false, group: "Ubicación" },
  { key: "nodo", label: "Nodo (texto)", required: false, group: "Ubicación" },
  // Service
  { key: "service_ip", label: "IP de Servicio", required: false, group: "Servicio" },
  { key: "service_mac", label: "MAC", required: false, group: "Servicio" },
  { key: "service_node_code", label: "Código Nodo", required: false, group: "Servicio" },
  { key: "service_technology", label: "Tecnología", required: false, group: "Servicio" },
  { key: "service_vlan", label: "VLAN", required: false, group: "Servicio" },
  { key: "service_router", label: "Router", required: false, group: "Servicio" },
  // Plan
  { key: "plan_name", label: "Nombre Plan", required: false, group: "Plan" },
  { key: "plan_speed_down", label: "Velocidad Bajada (Mbps)", required: false, group: "Plan" },
  { key: "plan_speed_up", label: "Velocidad Subida (Mbps)", required: false, group: "Plan" },
  { key: "monthly_rate", label: "Tarifa Mensual (USD)", required: false, group: "Plan" },
  { key: "service_status", label: "Estado (active/suspended)", required: false, group: "Plan" },
];

// ============================================
// AUTO-MAPPING
// ============================================
function autoMap(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    legal_name: ["nombre", "razon social", "razón social", "legal_name", "name", "cliente"],
    document_type: ["tipo doc", "tipo documento", "document_type", "doc_type", "tipo"],
    document_number: ["cedula", "cédula", "rif", "documento", "document_number", "doc_number", "nro documento"],
    email: ["email", "correo", "e-mail", "mail"],
    phone: ["telefono", "teléfono", "phone", "celular", "tel"],
    phone_alt: ["telefono alt", "teléfono alt", "phone_alt", "tel2"],
    address: ["direccion", "dirección", "address", "dir"],
    city: ["ciudad", "city", "localidad"],
    state: ["estado", "state", "provincia"],
    sector: ["sector", "urbanizacion", "urbanización", "urb"],
    nodo: ["nodo", "node", "zona"],
    service_ip: ["ip", "service_ip", "ip_servicio", "ip servicio", "direccion ip"],
    service_mac: ["mac", "service_mac", "mac address"],
    service_node_code: ["codigo nodo", "código nodo", "service_node_code", "node_code"],
    service_technology: ["tecnologia", "tecnología", "technology", "service_technology"],
    service_vlan: ["vlan", "service_vlan"],
    service_router: ["router", "service_router"],
    plan_name: ["plan", "plan_name", "nombre plan"],
    plan_speed_down: ["velocidad", "speed", "plan_speed_down", "bajada", "download"],
    plan_speed_up: ["subida", "upload", "plan_speed_up"],
    monthly_rate: ["tarifa", "precio", "rate", "monthly_rate", "mensualidad", "monto"],
    service_status: ["estado servicio", "status", "service_status"],
  };

  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    for (const [field, alts] of Object.entries(aliases)) {
      if (alts.includes(normalized) && !mapping[field]) {
        mapping[field] = header;
        break;
      }
    }
  }
  return mapping;
}

// ============================================
// MAIN PAGE
// ============================================
export default function ImportarClientesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");

  // Data state
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Validation state
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Import state
  const [progress, setProgress] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  // ============================================
  // FILE PARSING
  // ============================================
  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv" || ext === "txt") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];
          setRawHeaders(headers);
          setRawRows(rows);
          setMapping(autoMap(headers));
          setStep("mapping");
        },
        error: () => {
          setValidationErrors(["Error al leer el archivo CSV."]);
        },
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (json.length === 0) {
          setValidationErrors(["El archivo está vacío o no tiene datos."]);
          return;
        }
        const headers = Object.keys(json[0]);
        setRawHeaders(headers);
        setRawRows(json);
        setMapping(autoMap(headers));
        setStep("mapping");
      };
      reader.readAsArrayBuffer(file);
    } else {
      setValidationErrors(["Formato no soportado. Usa .xlsx, .xls o .csv"]);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  // ============================================
  // VALIDATION
  // ============================================
  const validate = useCallback((): boolean => {
    const errors: string[] = [];

    // Required: legal_name must be mapped
    if (!mapping.legal_name) {
      errors.push("El campo 'Nombre / Razón Social' es obligatorio y debe estar mapeado.");
    }

    // Check for duplicate IPs
    if (mapping.service_ip) {
      const ips = rawRows
        .map(r => r[mapping.service_ip]?.trim())
        .filter(Boolean);
      const dupes = ips.filter((ip, i) => ips.indexOf(ip) !== i);
      const uniqueDupes = [...new Set(dupes)];
      if (uniqueDupes.length > 0) {
        errors.push(`IPs duplicadas en el archivo: ${uniqueDupes.slice(0, 5).join(", ")}${uniqueDupes.length > 5 ? "..." : ""}`);
      }
    }

    // Check rows with empty legal_name
    if (mapping.legal_name) {
      const emptyNames = rawRows.filter(r => !r[mapping.legal_name]?.trim()).length;
      if (emptyNames > 0) {
        errors.push(`${emptyNames} fila(s) sin nombre de cliente — serán omitidas.`);
      }
    }

    setValidationErrors(errors);
    // Only block on required field missing
    return !!mapping.legal_name;
  }, [mapping, rawRows]);

  // ============================================
  // BUILD MAPPED ROWS
  // ============================================
  const buildMappedRows = useCallback((): Record<string, any>[] => {
    return rawRows
      .filter(r => r[mapping.legal_name]?.trim())
      .map(r => {
        const row: Record<string, any> = {};
        for (const field of MAPPING_FIELDS) {
          const sourceCol = mapping[field.key];
          if (sourceCol && r[sourceCol] !== undefined) {
            row[field.key] = r[sourceCol];
          }
        }
        return row;
      });
  }, [rawRows, mapping]);

  // ============================================
  // IMPORT
  // ============================================
  const startImport = useCallback(async () => {
    const rows = buildMappedRows();
    if (rows.length === 0) return;

    setStep("importing");
    const batches = Math.ceil(rows.length / BATCH_SIZE);
    setTotalBatches(batches);
    setCurrentBatch(0);
    setProgress(0);

    const combined: ImportResult = { created: 0, updated: 0, errors: [] };
    let processedBefore = 0;

    for (let i = 0; i < batches; i++) {
      const batch = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      try {
        const res = await fetch("/api/facturacion/clients/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clients: batch }),
        });
        const json = await res.json();
        if (res.ok) {
          combined.created += json.created || 0;
          combined.updated += json.updated || 0;
          if (json.errors?.length) {
            // Adjust row numbers for batch offset
            const adjusted = json.errors.map((e: any) => ({
              row: e.row + processedBefore,
              error: e.error,
            }));
            combined.errors.push(...adjusted);
          }
        } else {
          // Entire batch failed
          for (let j = 0; j < batch.length; j++) {
            combined.errors.push({ row: processedBefore + j + 1, error: json.error || "Error del servidor" });
          }
        }
      } catch {
        for (let j = 0; j < batch.length; j++) {
          combined.errors.push({ row: processedBefore + j + 1, error: "Error de red" });
        }
      }
      processedBefore += batch.length;
      setCurrentBatch(i + 1);
      setProgress(Math.round(((i + 1) / batches) * 100));
    }

    setResult(combined);
    setStep("done");
  }, [buildMappedRows]);

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      <TopBar
        title="Importar Clientes"
        subtitle={fileName || "Carga masiva desde Excel o CSV"}
        icon={<FileSpreadsheet size={22} />}
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Back button */}
        <button
          onClick={() => router.push("/clientes")}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Volver al listado
        </button>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {(["upload", "mapping", "preview", "importing", "done"] as Step[]).map((s, idx) => {
            const labels = ["Subir archivo", "Mapear columnas", "Vista previa", "Importando", "Resultado"];
            const isCurrent = step === s;
            const isPast = (["upload", "mapping", "preview", "importing", "done"] as Step[]).indexOf(step) > idx;
            return (
              <div key={s} className="flex items-center gap-2">
                {idx > 0 && <div className={`w-8 h-px ${isPast || isCurrent ? "bg-wuipi-accent" : "bg-wuipi-border"}`} />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${
                  isCurrent ? "bg-wuipi-accent/10 text-wuipi-accent font-medium" :
                  isPast ? "text-emerald-400" : "text-gray-600"
                }`}>
                  {isPast && <CheckCircle2 size={12} />}
                  {labels[idx]}
                </div>
              </div>
            );
          })}
        </div>

        {/* Step: Upload */}
        {step === "upload" && (
          <div
            onDrop={handleDrop}
            onDragOver={(e: React.DragEvent) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer"
          >
            <Card className="!p-12 text-center hover:border-wuipi-accent/30 transition-colors">
              <Upload size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-semibold text-white mb-2">
                Arrastra un archivo aquí o haz clic para seleccionar
              </h3>
              <p className="text-gray-500 text-sm mb-4">
                Formatos soportados: .xlsx, .xls, .csv — Máximo 500 clientes por importación
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              {validationErrors.length > 0 && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  {validationErrors.map((e, i) => (
                    <p key={i} className="text-red-400 text-sm">{e}</p>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Step: Mapping */}
        {step === "mapping" && (
          <div className="space-y-4">
            <Card className="!p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-semibold">Mapeo de columnas</h3>
                  <p className="text-sm text-gray-500">
                    {rawRows.length} filas encontradas en <span className="text-gray-400">{fileName}</span>.
                    Asigna cada columna del archivo al campo correspondiente.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setStep("upload"); setRawHeaders([]); setRawRows([]); setMapping({}); setFileName(""); setValidationErrors([]); }}
                    className="px-3 py-2 text-sm text-gray-400 hover:text-white border border-wuipi-border rounded-lg transition-colors"
                  >
                    <Trash2 size={14} className="inline mr-1" /> Cambiar archivo
                  </button>
                </div>
              </div>

              {/* Mapping groups */}
              {["Identificación", "Contacto", "Ubicación", "Servicio", "Plan"].map(group => (
                <div key={group} className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{group}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {MAPPING_FIELDS.filter(f => f.group === group).map(field => (
                      <div key={field.key} className="flex items-center gap-2">
                        <label className={`text-sm w-44 shrink-0 ${field.required ? "text-white font-medium" : "text-gray-400"}`}>
                          {field.label} {field.required && <span className="text-red-400">*</span>}
                        </label>
                        <select
                          value={mapping[field.key] || ""}
                          onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="flex-1 bg-wuipi-bg border border-wuipi-border rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-wuipi-accent/50"
                        >
                          <option value="">— No mapear —</option>
                          {rawHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Card>

            {/* Validation warnings */}
            {validationErrors.length > 0 && (
              <Card className="!p-3 border-amber-500/20">
                {validationErrors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-amber-400 text-sm py-1">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {e}
                  </div>
                ))}
              </Card>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setStep("upload"); setRawHeaders([]); setRawRows([]); setMapping({}); setFileName(""); }}
                className="px-4 py-2.5 text-sm text-gray-400 hover:text-white border border-wuipi-border rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { if (validate()) setStep("preview"); }}
                className="flex items-center gap-2 bg-wuipi-accent text-black px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-wuipi-accent/90 transition-colors"
              >
                Vista previa <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && (() => {
          const mapped = buildMappedRows();
          const preview = mapped.slice(0, 10);
          const activeFields = MAPPING_FIELDS.filter(f => mapping[f.key]);
          return (
            <div className="space-y-4">
              <Card className="!p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <Table2 size={16} /> Vista previa
                    </h3>
                    <p className="text-sm text-gray-500">
                      Mostrando {preview.length} de {mapped.length} clientes a importar.
                      {rawRows.length > mapped.length && (
                        <span className="text-amber-400 ml-2">
                          ({rawRows.length - mapped.length} filas omitidas por falta de nombre)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-wuipi-border text-gray-500 uppercase">
                        <th className="text-left p-2">#</th>
                        {activeFields.map(f => (
                          <th key={f.key} className="text-left p-2 whitespace-nowrap">{f.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, idx) => (
                        <tr key={idx} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover">
                          <td className="p-2 text-gray-600">{idx + 1}</td>
                          {activeFields.map(f => (
                            <td key={f.key} className="p-2 text-gray-300 max-w-[200px] truncate">
                              {row[f.key] || <span className="text-gray-600">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {validationErrors.length > 0 && (
                <Card className="!p-3 border-amber-500/20">
                  {validationErrors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-amber-400 text-sm py-1">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {e}
                    </div>
                  ))}
                </Card>
              )}

              <div className="flex justify-between">
                <button
                  onClick={() => setStep("mapping")}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400 hover:text-white border border-wuipi-border rounded-lg transition-colors"
                >
                  <ArrowLeft size={16} /> Volver al mapeo
                </button>
                <button
                  onClick={startImport}
                  className="flex items-center gap-2 bg-emerald-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-emerald-600 transition-colors"
                >
                  Importar {mapped.length} clientes <ArrowRight size={16} />
                </button>
              </div>
            </div>
          );
        })()}

        {/* Step: Importing */}
        {step === "importing" && (
          <Card className="!p-12 text-center">
            <Loader2 size={48} className="mx-auto mb-4 text-wuipi-accent animate-spin" />
            <h3 className="text-lg font-semibold text-white mb-2">Importando clientes...</h3>
            <p className="text-gray-500 text-sm mb-6">
              Lote {currentBatch} de {totalBatches} — No cierres esta página
            </p>
            <div className="w-full max-w-md mx-auto bg-wuipi-bg rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-wuipi-accent rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">{progress}%</p>
          </Card>
        )}

        {/* Step: Done */}
        {step === "done" && result && (
          <div className="space-y-4">
            {/* Summary */}
            <Card className="!p-6 text-center">
              {result.errors.length === 0 ? (
                <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400" />
              ) : result.created + result.updated > 0 ? (
                <AlertTriangle size={48} className="mx-auto mb-4 text-amber-400" />
              ) : (
                <XCircle size={48} className="mx-auto mb-4 text-red-400" />
              )}

              <h3 className="text-lg font-semibold text-white mb-2">
                {result.errors.length === 0
                  ? "Importación completada"
                  : result.created + result.updated > 0
                    ? "Importación completada con advertencias"
                    : "Error en la importación"}
              </h3>

              <div className="flex justify-center gap-6 mt-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{result.created}</p>
                  <p className="text-xs text-gray-500">Creados</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-cyan-400">{result.updated}</p>
                  <p className="text-xs text-gray-500">Actualizados</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl font-bold ${result.errors.length > 0 ? "text-red-400" : "text-gray-600"}`}>
                    {result.errors.length}
                  </p>
                  <p className="text-xs text-gray-500">Errores</p>
                </div>
              </div>
            </Card>

            {/* Error details */}
            {result.errors.length > 0 && (
              <Card className="!p-4">
                <h4 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                  <XCircle size={14} /> Errores ({result.errors.length})
                </h4>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs py-1">
                      <span className="text-gray-600 shrink-0">Fila {e.row}:</span>
                      <span className="text-red-400">{e.error}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Actions */}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => router.push("/clientes")}
                className="flex items-center gap-2 bg-wuipi-accent text-black px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-wuipi-accent/90 transition-colors"
              >
                <MapPin size={16} /> Ir al listado de clientes
              </button>
              <button
                onClick={() => {
                  setStep("upload");
                  setFileName("");
                  setRawHeaders([]);
                  setRawRows([]);
                  setMapping({});
                  setValidationErrors([]);
                  setResult(null);
                  setProgress(0);
                }}
                className="px-4 py-2.5 text-sm text-gray-400 hover:text-white border border-wuipi-border rounded-lg transition-colors"
              >
                Importar otro archivo
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
