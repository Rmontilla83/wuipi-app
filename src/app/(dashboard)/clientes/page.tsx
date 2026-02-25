"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  Users, Search, Plus, Filter, ChevronRight,
  Wifi, WifiOff, AlertTriangle, Phone, Mail,
  DollarSign, Clock,
} from "lucide-react";

interface Client {
  id: string;
  code: string;
  legal_name: string;
  trade_name: string;
  document_type: string;
  document_number: string;
  email: string;
  phone: string;
  service_status: string;
  billing_currency: string;
  sector: string;
  nodo: string;
  created_at: string;
  plans?: { code: string; name: string; price_usd: number } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  active: { label: "Activo", color: "text-emerald-400 bg-emerald-400/10", icon: Wifi },
  suspended: { label: "Suspendido", color: "text-red-400 bg-red-400/10", icon: WifiOff },
  pending: { label: "Pendiente", color: "text-amber-400 bg-amber-400/10", icon: Clock },
  cancelled: { label: "Cancelado", color: "text-gray-500 bg-gray-500/10", icon: AlertTriangle },
};

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0, pending: 0 });

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/facturacion/clients?${params}`);
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : (json.data || []);
        setClients(data);
        // Calculate stats
        setStats({
          total: json.total || data.length,
          active: data.filter((c: Client) => c.service_status === "active").length,
          suspended: data.filter((c: Client) => c.service_status === "suspended").length,
          pending: data.filter((c: Client) => c.service_status === "pending").length,
        });
      }
    } catch (err) {
      console.error("Error fetching clients:", err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  return (
    <>
      <TopBar title="Clientes" icon={<Users size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-white", bg: "bg-wuipi-accent/10 border-wuipi-accent/20" },
            { label: "Activos", value: stats.active, color: "text-emerald-400", bg: "bg-emerald-400/5 border-emerald-400/20" },
            { label: "Suspendidos", value: stats.suspended, color: "text-red-400", bg: "bg-red-400/5 border-red-400/20" },
            { label: "Pendientes", value: stats.pending, color: "text-amber-400", bg: "bg-amber-400/5 border-amber-400/20" },
          ].map(s => (
            <Card key={s.label} className={`${s.bg} border p-4`}>
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, cédula, código, email..."
              className="w-full bg-wuipi-card border border-wuipi-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-wuipi-accent/50"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-wuipi-card border border-wuipi-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="suspended">Suspendidos</option>
            <option value="pending">Pendientes</option>
            <option value="cancelled">Cancelados</option>
          </select>
          <button className="flex items-center gap-2 bg-wuipi-accent text-black px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-wuipi-accent/90 transition-colors">
            <Plus size={16} /> Nuevo Cliente
          </button>
        </div>

        {/* Client List */}
        <Card className="bg-wuipi-card border-wuipi-border overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">Cargando clientes...</div>
          ) : clients.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-semibold text-white mb-2">Sin clientes aún</h3>
              <p className="text-gray-500 text-sm">Los clientes del módulo de facturación aparecerán aquí con su ficha integral.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wuipi-border text-gray-500 text-xs uppercase">
                  <th className="text-left p-3 pl-4">Cliente</th>
                  <th className="text-left p-3">Plan</th>
                  <th className="text-left p-3">Sector</th>
                  <th className="text-left p-3">Contacto</th>
                  <th className="text-center p-3">Estado</th>
                  <th className="text-right p-3 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => {
                  const status = STATUS_CONFIG[client.service_status] || STATUS_CONFIG.pending;
                  const StatusIcon = status.icon;
                  return (
                    <tr key={client.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors cursor-pointer">
                      <td className="p-3 pl-4">
                        <div>
                          <p className="text-white font-medium">{client.legal_name}</p>
                          <p className="text-gray-500 text-xs">{client.code} • {client.document_type}-{client.document_number}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-gray-300 text-xs">
                          {client.plans?.name || "Sin plan"}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-gray-400 text-xs">{client.sector || "—"}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3 text-gray-500">
                          {client.phone && (
                            <span className="flex items-center gap-1 text-xs">
                              <Phone size={12} /> {client.phone}
                            </span>
                          )}
                          {client.email && (
                            <span className="flex items-center gap-1 text-xs">
                              <Mail size={12} /> {client.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                          <StatusIcon size={12} /> {status.label}
                        </span>
                      </td>
                      <td className="p-3 pr-4 text-right">
                        <button className="text-gray-600 hover:text-wuipi-accent transition-colors" title="Ver ficha">
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
