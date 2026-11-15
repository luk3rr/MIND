/*
 * Filename: sections.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import {
  ChartColumn,
  House,
  ListChecks,
  Library,
  MessageSquare,
  Play,
  Settings,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const SECTION_SLUGS = [
  "today",
  "library",
  "generate",
  "items",
  "study",
  "stats",
  "errors",
  "chat",
  "settings",
] as const;

export type SectionSlug = (typeof SECTION_SLUGS)[number];

export interface Section {
  slug: SectionSlug;
  label: string;
  icon: LucideIcon;
}

export const SECTIONS: readonly Section[] = [
  { slug: "today", label: "Hoje", icon: House },
  { slug: "library", label: "Biblioteca", icon: Library },
  { slug: "generate", label: "Gerar", icon: Sparkles },
  { slug: "items", label: "Itens", icon: ListChecks },
  { slug: "study", label: "Estudar", icon: Play },
  { slug: "stats", label: "Estatísticas", icon: ChartColumn },
  { slug: "errors", label: "Erros", icon: TriangleAlert },
  { slug: "chat", label: "Chat", icon: MessageSquare },
  { slug: "settings", label: "Configurações", icon: Settings },
];

export function sectionLabel(slug: SectionSlug): string {
  return SECTIONS.find((section) => section.slug === slug)?.label ?? slug;
}
