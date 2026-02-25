"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  Megaphone, Rocket, Wrench, Sparkles, Bug, Shield,
  ChevronDown, ChevronRight, CheckCircle2, Clock,
  Package, Database, Layout, Users, CreditCard,
  Radio, Brain, Globe,
} from "lucide-react";

/* ========== TYPES ========== */
type ChangeType = "feature" | "fix" | "improvement" | "security";

interface Change {
  type: ChangeType;
  text: string;
}

interface Release {
  version: string;
  date: string;
  title: string;
  description: string;
  icon: typeof Rocket;
  changes: Change[];
  status: "deployed" | "in-progress" | "planned";
}

/* ========== DATA ========== */
const TYPE_CONFIG: Record<ChangeType, { label: string; icon: typeof Sparkles; color: string }> = {
  feature:     { label: "Nueva función",  icon: Sparkles, color: "text-emerald-400" },
  fix:         { label: "Corrección",      icon: Bug,      color: "text-amber-400" },
  improvement: { label: "Mejora",          icon: Wrench,   color: "text-cyan-400" },
  security:    { label: "Seguridad",       icon: Shield,   color: "text-purple-400" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  deployed:    { label: "Desplegado",   color: "text-emerald-400", bg: "bg-emerald-400/10" },
  "in-progress": { label: "En progreso", color: "text-amber-400",   bg: "bg-amber-400/10" },
  planned:     { label: "Planificado",  color: "text-gray-500",    bg: "bg-gray-500/10" },
};

const RELEASES: Release[] = [
  {
    version: "0.6.0",
    date: "2026-02-25",
    title: "Ficha Integral del Cliente",
    description: "Página de detalle completa para cada cliente con 5 tabs de información.",
    icon: Users,
    status: "deployed",
    changes: [
      { type: "feature", text: "Ficha integral del cliente en /clientes/[id] con 5 tabs: Información, Facturación, Soporte, Red, Equipos" },
      { type: "feature", text: "Header card con estado visual, plan activo, quick stats de facturación" },
      { type: "feature", text: "Tab Facturación: resumen, tabla de facturas y pagos recientes con estados" },
      { type: "feature", text: "Tabs Soporte, Red y Equipos como placeholders listos para integración" },
      { type: "feature", text: "Acciones rápidas: Suspender/Activar y Editar desde la ficha" },
      { type: "feature", text: "Navegación: click en cliente desde la lista → abre ficha integral" },
      { type: "fix", text: "Protección contra datos faltantes en billing_summary" },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-02-25",
    title: "Reestructuración + CRUD Clientes",
    description: "Reorganización completa del sidebar, Centro de Comando y CRUD funcional de clientes.",
    icon: Layout,
    status: "deployed",
    changes: [
      { type: "feature", text: "Sidebar reestructurado: 8 módulos en 4 grupos (Estratégico, Operativo, Administrativo, Sistema)" },
      { type: "feature", text: "Centro de Comando con 4 tabs: Financiero (datos reales), Soporte, Infraestructura, Ventas" },
      { type: "feature", text: "CRUD completo de Clientes: crear, editar, buscar, filtrar por estado, toggle activo/suspendido, soft delete" },
      { type: "feature", text: "Modal de creación/edición con 6 secciones: Identificación, Contacto, Ubicación, Servicio, Facturación, Notas" },
      { type: "feature", text: "Búsqueda con debounce 400ms y filtros por estado" },
      { type: "improvement", text: "TopBar mejorado con subtitle y actions props" },
      { type: "fix", text: "Corrección de tipo LucideIcon para iconos del sidebar" },
      { type: "fix", text: "Manejo correcto de respuesta paginada del API (data array extraction)" },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-02-25",
    title: "Facturación — Fase 9A",
    description: "Módulo completo de facturación con Supabase, BCV auto-fetch, multi-moneda y cálculo fiscal.",
    icon: CreditCard,
    status: "deployed",
    changes: [
      { type: "feature", text: "9 tablas en Supabase: clients, plans, services, invoices, invoice_items, payments, payment_methods, exchange_rates, sequences" },
      { type: "feature", text: "Auto-fetch de tasa BCV (USD/VES) con cache de 1 hora" },
      { type: "feature", text: "Multi-moneda: USD y VES con conversión automática" },
      { type: "feature", text: "Cálculo fiscal: IVA 16% + IGTF 3% para divisas" },
      { type: "feature", text: "Dashboard de facturación con 5 tabs" },
      { type: "feature", text: "API REST completa para CRUD de facturas, pagos, clientes, planes" },
      { type: "feature", text: "Secuencias auto-generadas: FAC-2026-XXXXXX, PAG-2026-XXXXXX, WUI-2026-XXXXXX" },
      { type: "feature", text: "Triggers en Supabase para cálculo automático de totales y actualización de estados" },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-02-24",
    title: "Autenticación + Dashboard Base",
    description: "Sistema de login con Supabase Auth, roles y layout del dashboard.",
    icon: Shield,
    status: "deployed",
    changes: [
      { type: "feature", text: "Login con email/password via Supabase Auth" },
      { type: "feature", text: "Sistema de roles: admin, gerente, finanzas, soporte, infraestructura, técnico, vendedor, cliente" },
      { type: "feature", text: "Layout del dashboard con sidebar colapsable y topbar" },
      { type: "feature", text: "Permisos por rol: cada módulo visible según el rol del usuario" },
      { type: "security", text: "Middleware de protección de rutas y sesión persistente" },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-02-24",
    title: "Supervisor IA + Kommo",
    description: "Integración del Supervisor IA con análisis de datos de Kommo CRM.",
    icon: Brain,
    status: "deployed",
    changes: [
      { type: "feature", text: "Supervisor IA con análisis en tiempo real de leads y tickets" },
      { type: "feature", text: "Integración con Kommo CRM API para extracción de datos" },
      { type: "feature", text: "Generación de insights automáticos con Anthropic Claude / Google Gemini" },
      { type: "improvement", text: "Indicador de estado activo del Supervisor IA en el sidebar" },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-02-23",
    title: "Proyecto Inicial",
    description: "Setup del proyecto Next.js con Supabase, Tailwind CSS y deploy en Vercel.",
    icon: Rocket,
    status: "deployed",
    changes: [
      { type: "feature", text: "Proyecto Next.js 14 con App Router" },
      { type: "feature", text: "Tailwind CSS con tema oscuro personalizado (Wuipi brand)" },
      { type: "feature", text: "Conexión con Supabase (Auth + Database)" },
      { type: "feature", text: "Deploy automático en Vercel desde GitHub" },
      { type: "feature", text: "Variables de entorno configuradas en Vercel" },
    ],
  },
];

/* ========== PAGE ========== */
export default function ActualizacionesPage() {
  const totalFeatures = RELEASES.reduce((s, r) => s + r.changes.filter(c => c.type === "feature").length, 0);
  const totalFixes = RELEASES.reduce((s, r) => s + r.changes.filter(c => c.type === "fix").length, 0);

  return (
    <>
      <TopBar
        title="Actualizaciones"
        subtitle={`v${RELEASES[0].version}`}
        icon={<Megaphone size={22} />}
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="!p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Versión actual</p>
            <p className="text-2xl font-bold text-wuipi-accent">{RELEASES[0].version}</p>
          </Card>
          <Card className="!p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Releases</p>
            <p className="text-2xl font-bold text-white">{RELEASES.length}</p>
          </Card>
          <Card className="!p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Funciones</p>
            <p className="text-2xl font-bold text-emerald-400">{totalFeatures}</p>
          </Card>
          <Card className="!p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Correcciones</p>
            <p className="text-2xl font-bold text-amber-400">{totalFixes}</p>
          </Card>
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          {RELEASES.map((release, idx) => (
            <ReleaseCard key={release.version} release={release} isLatest={idx === 0} />
          ))}
        </div>
      </div>
    </>
  );
}

/* ========== RELEASE CARD ========== */
function ReleaseCard({ release, isLatest }: { release: Release; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest);
  const Icon = release.icon;
  const st = STATUS_CONFIG[release.status];

  return (
    <Card className={`!p-0 overflow-hidden ${isLatest ? "ring-1 ring-wuipi-accent/30" : ""}`}>
      {isLatest && <div className="h-0.5 bg-wuipi-accent" />}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-wuipi-card-hover transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-lg ${isLatest ? "bg-wuipi-accent/10" : "bg-wuipi-bg"} border border-wuipi-border flex items-center justify-center`}>
            <Icon size={20} className={isLatest ? "text-wuipi-accent" : "text-gray-500"} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-white font-bold">v{release.version}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color} ${st.bg}`}>{st.label}</span>
              {isLatest && <span className="px-2 py-0.5 rounded-full text-xs font-medium text-wuipi-accent bg-wuipi-accent/10">Último</span>}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">{release.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">{release.date}</span>
          {expanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-wuipi-border/50">
          <p className="text-sm text-gray-400 mt-3 mb-4">{release.description}</p>
          <div className="space-y-2">
            {release.changes.map((change, i) => {
              const tc = TYPE_CONFIG[change.type];
              const TIcon = tc.icon;
              return (
                <div key={i} className="flex items-start gap-3 py-1.5">
                  <TIcon size={14} className={`${tc.color} mt-0.5 shrink-0`} />
                  <div className="flex items-start gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${tc.color} bg-white/5 font-medium shrink-0`}>{tc.label}</span>
                    <span className="text-sm text-gray-300">{change.text}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
