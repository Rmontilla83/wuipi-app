"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import {
  Megaphone, Rocket, Wrench, Sparkles, Bug, Shield,
  ChevronDown, ChevronRight, CheckCircle2, Clock,
  Package, Database, Layout, Users, CreditCard,
  Radio, Brain, Globe, Headphones, Activity,
  FileSpreadsheet, Server,
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
    version: "1.4.0",
    date: "2026-02-26",
    title: "Importador Masivo de Clientes",
    description: "Carga masiva de clientes desde Excel o CSV con mapeo de columnas, validación y upsert automático.",
    icon: FileSpreadsheet,
    status: "deployed",
    changes: [
      { type: "feature", text: "Página /clientes/importar con drag & drop para archivos .xlsx, .xls y .csv" },
      { type: "feature", text: "Auto-mapeo inteligente de columnas (detecta nombres, cédulas, IPs, etc.)" },
      { type: "feature", text: "Vista previa de datos antes de importar con validación de campos obligatorios" },
      { type: "feature", text: "Importación en lotes de 50 con barra de progreso y resumen final" },
      { type: "feature", text: "Upsert por documento: actualiza si existe, crea si es nuevo" },
      { type: "feature", text: "Detección de IPs duplicadas y filas sin nombre" },
      { type: "improvement", text: "Botón 'Importar' en el listado de clientes junto a 'Nuevo Cliente'" },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-02-26",
    title: "Consolidación: La Tarjeta del Cliente como Núcleo",
    description: "Reestructuración completa del cliente como hub central con 6 tabs, datos reales en Centro de Comando y nuevos campos de servicio.",
    icon: Users,
    status: "deployed",
    changes: [
      { type: "feature", text: "Ficha del cliente con 6 tabs: Resumen, Finanzas, Soporte, Ventas, Infraestructura, QoE" },
      { type: "feature", text: "Tab Resumen con datos de servicio (IP, MAC, nodo, VLAN, router, tecnología)" },
      { type: "feature", text: "Tab Soporte con tickets reales del cliente y acceso directo a crear ticket" },
      { type: "feature", text: "Tab Ventas con historial de leads asociados al cliente" },
      { type: "feature", text: "Tab Infraestructura con estado Zabbix del equipo por IP de servicio" },
      { type: "feature", text: "Tab QoE con integración Bequant: score, latencia, retransmisiones, DPI" },
      { type: "feature", text: "Listado de clientes con columnas Nodo, IP, filtro por nodo y campos técnicos en modal" },
      { type: "feature", text: "Centro de Comando: datos reales de tickets y CRM en vez de mock data" },
      { type: "feature", text: "API endpoints: /api/tickets/stats, /api/crm-ventas/stats, /api/facturacion/network-nodes" },
      { type: "improvement", text: "Banner de conexión pendiente con Odoo en tab Finanzas" },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-02-26",
    title: "Dashboard Ejecutivo de Infraestructura",
    description: "Rediseño del dashboard de infraestructura con layout de 6 zonas y datos reales de Zabbix.",
    icon: Server,
    status: "deployed",
    changes: [
      { type: "feature", text: "Layout de 6 zonas: KPIs, mapa de red, alertas, uptime ranking, tráfico y latencia" },
      { type: "feature", text: "Datos en tiempo real desde Zabbix API con icmpping para estado de hosts" },
      { type: "feature", text: "Ranking de uptime por host con barras visuales" },
      { type: "improvement", text: "Migración de PRTG a Zabbix 7.x como fuente de monitoreo" },
      { type: "fix", text: "Corrección de detección de estado usando icmpping en vez de campo available" },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-02-26",
    title: "Preparación Bequant + UX Polish",
    description: "Integración preparada para Bequant QoE, tecnologías de servicio actualizadas y pulido de interfaz.",
    icon: Activity,
    status: "deployed",
    changes: [
      { type: "feature", text: "Tipos e integración completa para Bequant QoE API (subscriber, metrics, DPI)" },
      { type: "feature", text: "Calculadora de QoE Score con ponderación: velocidad 35%, latencia 25%, retransmisiones 20%, congestión 20%" },
      { type: "feature", text: "API route /api/bequant/[ip] con parámetros de período y velocidad contratada" },
      { type: "improvement", text: "Tecnologías de servicio actualizadas: Fibra Óptica, Beamforming, Terragraph" },
      { type: "improvement", text: "Empty states mejorados en Centro de Comando para módulos sin datos" },
      { type: "fix", text: "Score del módulo Financiero no muestra 'critical' cuando no hay facturas" },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-02-25",
    title: "CRM Ventas — Visor Kommo",
    description: "Integración con cuenta Kommo Ventas (wuipidrive) con auto-detección de pipelines, KPIs en vivo y ranking de vendedores.",
    icon: Layout,
    status: "deployed",
    changes: [
      { type: "feature", text: "Integración con cuenta Kommo Ventas separada (wuipidrive.kommo.com)" },
      { type: "feature", text: "Auto-detección de pipelines — no requiere configurar IDs manualmente" },
      { type: "feature", text: "KPIs en vivo: leads activos, ganados, pipeline value, tasa de conversión" },
      { type: "feature", text: "Visualización de etapas por pipeline con barras de progreso y valores" },
      { type: "feature", text: "Ranking de vendedores con tasa de conversión y valor cerrado" },
      { type: "feature", text: "Lista de leads recientes con estado, responsable y valor" },
      { type: "feature", text: "Filtros por período y por pipeline" },
      { type: "feature", text: "Tab CRM Ventas placeholder listo para desarrollo del pipeline propio" },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-02-25",
    title: "Kanban Board + Ficha de Ticket",
    description: "Board Kanban con drag & drop entre estados, vista tabla alternativa, y ficha completa del ticket con timeline de actividad.",
    icon: Headphones,
    status: "deployed",
    changes: [
      { type: "feature", text: "Board Kanban con 6 columnas de estado y drag & drop para mover tickets entre estados" },
      { type: "feature", text: "Vista tabla alternativa con toggle Kanban/Tabla" },
      { type: "feature", text: "Ficha del ticket (/soporte/[id]) con detalle completo, sidebar de info y timeline de actividad" },
      { type: "feature", text: "Sistema de comentarios con notas internas (🔒) y visibles para cliente (👁)" },
      { type: "feature", text: "Cambio de estado desde dropdown en la ficha del ticket con tracking automático" },
      { type: "feature", text: "Cards Kanban con prioridad, categoría, SLA, técnico asignado y cliente" },
      { type: "feature", text: "Link directo a ficha del cliente desde el ticket" },
      { type: "improvement", text: "Optimistic updates al arrastrar tickets entre columnas" },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-02-25",
    title: "CRM Soporte Propio",
    description: "Sistema de tickets completo en Supabase con CRUD, SLA automático, categorías y asignación de técnicos.",
    icon: Headphones,
    status: "deployed",
    changes: [
      { type: "feature", text: "Schema completo: tickets, ticket_categories, ticket_comments con triggers SLA automáticos" },
      { type: "feature", text: "CRUD de tickets: crear, listar, filtrar por estado/prioridad, buscar por asunto/número" },
      { type: "feature", text: "Modal de creación con: asunto, descripción, prioridad, canal, categoría, cliente, técnico, sector, nodo" },
      { type: "feature", text: "SLA automático por prioridad y categoría con cálculo via trigger PostgreSQL" },
      { type: "feature", text: "API de comentarios/timeline con tracking automático de cambios de estado y asignación" },
      { type: "feature", text: "10 categorías pre-cargadas alineadas con los tipos de falla de Kommo" },
      { type: "feature", text: "Tab Visor Kommo preservado como puente durante la transición" },
      { type: "feature", text: "Secuencia TK-2026-XXXXXX para numeración automática de tickets" },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-02-25",
    title: "Protecciones Base + Actualizaciones",
    description: "Error boundaries, validación Zod, API hardening y página de changelog.",
    icon: Shield,
    status: "deployed",
    changes: [
      { type: "feature", text: "Página de Actualizaciones con changelog de versiones y timeline visual" },
      { type: "feature", text: "Visor Kommo separado como tab dentro de CRM Soporte" },
      { type: "security", text: "Error boundary global — nunca más pantalla blanca por errores" },
      { type: "security", text: "Validación Zod en API de clientes (POST/PUT) con schemas tipados" },
      { type: "improvement", text: "API helpers para respuestas consistentes de error" },
      { type: "improvement", text: "Página Not Found personalizada para rutas inválidas" },
      { type: "fix", text: "Protección contra billing_summary undefined en ficha del cliente" },
    ],
  },
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
