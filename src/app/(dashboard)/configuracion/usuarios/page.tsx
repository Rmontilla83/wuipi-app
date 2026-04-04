"use client";

import { useState, useEffect, useCallback } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  Users, Plus, RefreshCw, Search, Pencil, Save, X, Mail,
  Shield, UserCheck, UserX, Settings,
} from "lucide-react";
import { ROLE_CONFIG } from "@/lib/auth/permissions";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  department: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

const ASSIGNABLE_ROLES = [
  "super_admin", "admin", "gerente", "supervisor",
  "analista_cobranzas", "analista_soporte",
  "finanzas", "soporte", "infraestructura", "tecnico", "vendedor",
];

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterActive, setFilterActive] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [message, setMessage] = useState("");

  // Create form
  const [newUser, setNewUser] = useState({ email: "", full_name: "", role: "analista_soporte", phone: "", department: "" });
  const [creating, setCreating] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/users");
      const json = await res.json();
      if (res.ok) setUsers(json.users || []);
      else setMessage(json.error || "Error al cargar usuarios");
    } catch { setMessage("Error de conexión"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!newUser.email || !newUser.full_name) { setMessage("Email y nombre son requeridos"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setMessage(`Usuario ${newUser.email} invitado correctamente`);
      setShowCreate(false);
      setNewUser({ email: "", full_name: "", role: "analista_soporte", phone: "", department: "" });
      fetchUsers();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Error");
    } finally { setCreating(false); }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...editForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setEditingId(null);
      fetchUsers();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Error");
    }
  };

  const handleResendInvite = async (user: User) => {
    try {
      const res = await fetch("/api/users/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setMessage(`Invitacion reenviada a ${user.email}`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Error al reenviar");
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
      });
      if (!res.ok) { const j = await res.json(); setMessage(j.error); return; }
      fetchUsers();
    } catch { setMessage("Error"); }
  };

  const filtered = users.filter((u) => {
    if (filterRole !== "all" && u.role !== filterRole) return false;
    if (filterActive === "active" && !u.is_active) return false;
    if (filterActive === "inactive" && u.is_active) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <>
      <TopBar title="Gestión de Usuarios" icon={<Users size={22} />} />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Usuarios del sistema</h3>
            <p className="text-sm text-gray-500">{users.length} usuarios registrados</p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchUsers} className="p-2 rounded-lg border border-wuipi-border text-gray-400 hover:text-white">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F46800] text-white text-sm font-medium hover:bg-[#F46800]/90">
              <Plus size={16} /> Nuevo usuario
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <Card className="!p-3 border-blue-500/30 bg-blue-500/5">
            <div className="flex items-center justify-between">
              <p className="text-blue-300 text-xs">{message}</p>
              <button onClick={() => setMessage("")} className="text-gray-500 hover:text-white"><X size={12} /></button>
            </div>
          </Card>
        )}

        {/* Create form */}
        {showCreate && (
          <Card className="!p-4 border-[#F46800]/30 space-y-3">
            <h4 className="text-white text-sm font-semibold flex items-center gap-2"><Shield size={14} /> Invitar nuevo usuario</h4>
            <div className="grid grid-cols-2 gap-3">
              <input value={newUser.full_name} onChange={(e) => setNewUser((p) => ({ ...p, full_name: e.target.value }))}
                placeholder="Nombre completo *" className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none" />
              <input value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                placeholder="Email *" type="email" className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none" />
              <select value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_CONFIG[r]?.label || r} — {ROLE_CONFIG[r]?.description || ""}</option>
                ))}
              </select>
              <input value={newUser.department} onChange={(e) => setNewUser((p) => ({ ...p, department: e.target.value }))}
                placeholder="Departamento" className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-wuipi-border text-gray-400 text-sm hover:text-white">Cancelar</button>
              <button onClick={handleCreate} disabled={creating}
                className="px-4 py-2 rounded-lg bg-[#03318C] text-white text-sm font-medium hover:bg-[#03318C]/80 disabled:opacity-50">
                {creating ? <RefreshCw size={14} className="animate-spin" /> : "Enviar invitación"}
              </button>
            </div>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o email..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-white placeholder-gray-600 focus:border-[#F46800]/50 focus:outline-none" />
          </div>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
            <option value="all">Todos los roles</option>
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</option>)}
          </select>
          <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)}
            className="px-3 py-2 rounded-lg bg-wuipi-bg border border-wuipi-border text-sm text-gray-300 focus:outline-none">
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>

        {/* Users table */}
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-wuipi-border">
                  <th className="text-left p-3 pl-4 font-medium">Usuario</th>
                  <th className="text-left p-3 font-medium">Rol</th>
                  <th className="text-left p-3 font-medium">Departamento</th>
                  <th className="text-center p-3 font-medium">Estado</th>
                  <th className="text-left p-3 font-medium">Último acceso</th>
                  <th className="text-center p-3 pr-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const rc = ROLE_CONFIG[user.role] || { label: user.role, color: "text-gray-400 bg-gray-400/10" };
                  const isEditing = editingId === user.id;

                  if (isEditing) {
                    return (
                      <tr key={user.id} className="border-b border-[#F46800]/30 bg-[#F46800]/5">
                        <td className="p-3 pl-4">
                          <input value={editForm.full_name || ""} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                            className="w-full bg-transparent text-white text-xs border-b border-[#F46800]/30 focus:border-[#F46800] focus:outline-none px-1 py-0.5" />
                          <p className="text-gray-500 text-[10px] mt-0.5">{user.email}</p>
                        </td>
                        <td className="p-3">
                          <select value={editForm.role || ""} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                            className="bg-wuipi-bg border border-wuipi-border text-xs text-gray-300 rounded px-2 py-1 focus:outline-none">
                            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_CONFIG[r]?.label || r}</option>)}
                          </select>
                        </td>
                        <td className="p-3">
                          <input value={editForm.department || ""} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                            placeholder="Departamento" className="bg-transparent text-gray-300 text-xs border-b border-[#F46800]/30 focus:border-[#F46800] focus:outline-none px-1 py-0.5" />
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${user.is_active ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
                            {user.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td className="p-3 text-gray-400 text-xs">{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString("es-VE") : "Nunca"}</td>
                        <td className="p-3 pr-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={handleSaveEdit} className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><Save size={12} /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 rounded bg-gray-500/20 text-gray-400 hover:bg-gray-500/30"><X size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={user.id} className="border-b border-wuipi-border/50 hover:bg-wuipi-card-hover transition-colors">
                      <td className="p-3 pl-4">
                        <p className="text-white font-medium text-xs">{user.full_name}</p>
                        <p className="text-gray-600 text-[10px]">{user.email}</p>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${rc.color}`}>{rc.label}</span>
                      </td>
                      <td className="p-3 text-gray-400 text-xs">{user.department || "—"}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${user.is_active ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
                          {user.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="p-3 text-gray-400 text-xs">{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString("es-VE") : "Nunca"}</td>
                      <td className="p-3 pr-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!user.last_login_at && (
                            <button onClick={() => handleResendInvite(user)}
                              className="p-1.5 rounded text-gray-500 hover:text-cyan-400 hover:bg-cyan-400/10" title="Reenviar invitacion"><Mail size={12} /></button>
                          )}
                          <button onClick={() => { setEditingId(user.id); setEditForm({ full_name: user.full_name, role: user.role, department: user.department }); }}
                            className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/10" title="Editar"><Pencil size={12} /></button>
                          <button onClick={() => handleToggleActive(user)}
                            className={`p-1.5 rounded ${user.is_active ? "text-gray-500 hover:text-red-400 hover:bg-red-400/10" : "text-gray-500 hover:text-emerald-400 hover:bg-emerald-400/10"}`}
                            title={user.is_active ? "Desactivar" : "Activar"}>
                            {user.is_active ? <UserX size={12} /> : <UserCheck size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-500 text-sm">
                    {loading ? "Cargando..." : "No se encontraron usuarios"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
