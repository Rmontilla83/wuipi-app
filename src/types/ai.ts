// ===========================================
// AI Supervisor Type Definitions
// ===========================================

export type AIEngine = "claude" | "gemini";
export type InsightPriority = "critical" | "high" | "medium" | "low";

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  engine?: AIEngine;
  timestamp: string;
}

export interface AIInsight {
  id: string;
  priority: InsightPriority;
  engine: AIEngine;
  title: string;
  body: string;
  modules: string[];
  confidence: number;
  actions: string[];
  timestamp: string;
}

export interface AIBriefing {
  date: string;
  overall_score: number;
  summary: string;
  key_metrics: {
    label: string;
    value: string;
    trend: "up" | "down" | "stable";
    icon: string;
  }[];
  generated_at: string;
  engine: AIEngine;
}

export interface AISupervisorData {
  briefing: AIBriefing;
  insights: AIInsight[];
  suggested_questions: string[];
}
