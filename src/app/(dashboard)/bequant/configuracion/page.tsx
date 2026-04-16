"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { BequantSubNav } from "@/components/bequant/sub-nav";
import {
  Radio,
  Save,
  Plug,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfigState {
  id?: string;
  label: string;
  host: string;
  port: number;
  username: string;
  password: string;
  ssl_verify: boolean;
  enabled: boolean;
  notes: string;
  last_test_at: string | null;
  last_test_status: "success" | "error" | null;
  last_test_message: string | null;
}

const defaultConfig: ConfigState = {
  label: "BQN Principal",
  host: "45.181.124.128",
  port: 7343,
  username: "",
  password: "",
  ssl_verify: false,
  enabled: true,
  notes: "",
  last_test_at: null,
  last_test_status: null,
  last_test_message: null,
};

export default function BequantConfiguracion() {
  const [config, setConfig] = useState<ConfigState>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [hasExistingConfig, setHasExistingConfig] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bequant/config");
      if (res.ok) {
        const json = await res.json();
        const configs = Array.isArray(json) ? json : [];
        if (configs.length > 0) {
          const c = configs[0];
          setConfig({
            id: c.id,
            label: c.label,
            host: c.host,
            port: c.port,
            username: c.username,
            password: "", // Never returned from API
            ssl_verify: c.ssl_verify,
            enabled: c.enabled,
            notes: c.notes || "",
            last_test_at: c.last_test_at,
            last_test_status: c.last_test_status,
            last_test_message: c.last_test_message,
          });
          setHasExistingConfig(true);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleTest = async () => {
    if (!config.host || !config.username) return;

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/bequant/config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password || "placeholder",
          configId: config.id,
        }),
      });
      const json = await res.json();
      setTestResult({ success: json.success, message: json.message || json.error });
    } catch {
      setTestResult({ success: false, message: "Error de conexión" });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    if (!config.host || !config.username) return;
    if (!hasExistingConfig && !config.password) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      const body: Record<string, unknown> = {
        label: config.label,
        host: config.host,
        port: config.port,
        username: config.username,
        ssl_verify: config.ssl_verify,
        enabled: config.enabled,
        notes: config.notes || null,
      };
      if (config.password) body.password = config.password;

      let res: Response;
      if (config.id) {
        res = await fetch(`/api/bequant/config/${config.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        body.password = config.password;
        res = await fetch("/api/bequant/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        const saved = await res.json();
        setConfig((prev) => ({ ...prev, id: saved.id }));
        setHasExistingConfig(true);
        setSaveMessage("Configuración guardada exitosamente");
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const data = await res.json();
        setSaveMessage(`Error: ${data.error}`);
      }
    } catch {
      setSaveMessage("Error al guardar");
    }
    setSaving(false);
  };

  return (
    <>
      <TopBar title="Bequant — Configuración" icon={<Radio size={22} className="text-wuipi-accent" />} />
      <div className="flex-1 p-7 space-y-6 overflow-y-auto">
        <BequantSubNav />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw size={24} className="animate-spin text-wuipi-accent" />
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {/* Status Card */}
            <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-5">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  config.last_test_status === "success" ? "bg-green-500/20" : config.last_test_status === "error" ? "bg-red-500/20" : "bg-gray-500/20"
                )}>
                  {config.last_test_status === "success" ? (
                    <CheckCircle2 size={24} className="text-green-400" />
                  ) : config.last_test_status === "error" ? (
                    <XCircle size={24} className="text-red-400" />
                  ) : (
                    <Plug size={24} className="text-gray-500" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">
                    {config.last_test_status === "success" ? "Conectado" : config.last_test_status === "error" ? "Error de conexión" : "Sin probar"}
                  </div>
                  {config.last_test_message && (
                    <div className="text-xs text-gray-500">{config.last_test_message}</div>
                  )}
                  {config.last_test_at && (
                    <div className="flex items-center gap-1 text-xs text-gray-600 mt-0.5">
                      <Clock size={12} />
                      Último test: {new Date(config.last_test_at).toLocaleString("es-VE")}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="bg-wuipi-card border border-wuipi-border rounded-xl p-6 space-y-5">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Conexión al BQN</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1.5">Etiqueta</label>
                  <input
                    type="text"
                    value={config.label}
                    onChange={(e) => setConfig({ ...config, label: e.target.value })}
                    className="w-full px-4 py-2.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm text-white focus:outline-none focus:border-wuipi-accent/50"
                    placeholder="BQN Principal"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Host / IP</label>
                  <input
                    type="text"
                    value={config.host}
                    onChange={(e) => setConfig({ ...config, host: e.target.value })}
                    className="w-full px-4 py-2.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm text-white focus:outline-none focus:border-wuipi-accent/50"
                    placeholder="45.181.124.128"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Puerto</label>
                  <input
                    type="number"
                    value={config.port}
                    onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 3443 })}
                    className="w-full px-4 py-2.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm text-white focus:outline-none focus:border-wuipi-accent/50"
                    placeholder="3443"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">Usuario</label>
                  <input
                    type="text"
                    value={config.username}
                    onChange={(e) => setConfig({ ...config, username: e.target.value })}
                    className="w-full px-4 py-2.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm text-white focus:outline-none focus:border-wuipi-accent/50"
                    placeholder="bqnadm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1.5">
                    Contraseña {hasExistingConfig && <span className="text-gray-600">(dejar vacío para mantener)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={config.password}
                      onChange={(e) => setConfig({ ...config, password: e.target.value })}
                      className="w-full px-4 py-2.5 pr-10 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm text-white focus:outline-none focus:border-wuipi-accent/50"
                      placeholder={hasExistingConfig ? "••••••••" : "Contraseña"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.ssl_verify}
                    onChange={(e) => setConfig({ ...config, ssl_verify: e.target.checked })}
                    className="w-4 h-4 rounded border-wuipi-border text-wuipi-accent focus:ring-wuipi-accent bg-wuipi-bg"
                  />
                  <span className="text-sm text-gray-400">Verificar SSL</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-wuipi-border text-wuipi-accent focus:ring-wuipi-accent bg-wuipi-bg"
                  />
                  <span className="text-sm text-gray-400">Habilitado</span>
                </label>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Notas</label>
                <textarea
                  value={config.notes}
                  onChange={(e) => setConfig({ ...config, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm text-white focus:outline-none focus:border-wuipi-accent/50 resize-none"
                  placeholder="Notas opcionales..."
                />
              </div>

              {/* Test result inline */}
              {testResult && (
                <div className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border text-sm",
                  testResult.success
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                )}>
                  {testResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {testResult.message}
                </div>
              )}

              {saveMessage && (
                <div className={cn(
                  "p-3 rounded-lg border text-sm",
                  saveMessage.startsWith("Error")
                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                    : "bg-green-500/10 border-green-500/20 text-green-400"
                )}>
                  {saveMessage}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleTest}
                  disabled={testing || !config.host || !config.username}
                  className="flex items-center gap-2 px-4 py-2.5 bg-wuipi-bg border border-wuipi-border rounded-lg text-sm font-medium text-gray-300 hover:text-white transition-colors disabled:opacity-50"
                >
                  {testing ? <RefreshCw size={16} className="animate-spin" /> : <Plug size={16} />}
                  Probar Conexión
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !config.host || !config.username || (!hasExistingConfig && !config.password)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-wuipi-accent text-white rounded-lg text-sm font-medium hover:bg-wuipi-accent/90 transition-colors disabled:opacity-50"
                >
                  {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
