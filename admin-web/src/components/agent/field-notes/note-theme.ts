import { CarFront, HeartPulse, Stethoscope, Store, type LucideIcon } from "lucide-react";
import type { FieldNote, FieldNoteCategory } from "../field-notes-data";
import { noteStage } from "./follow-up-groups";

export const categoryLabel: Record<FieldNoteCategory, string> = {
  life: "Life",
  health: "Health",
  motor: "Motor",
  commercial: "Commercial",
};

export const categoryIcon: Record<FieldNoteCategory, LucideIcon> = {
  life: HeartPulse,
  health: Stethoscope,
  motor: CarFront,
  commercial: Store,
};

/** Line-of-business chip colours, readable on both the sticky papers and the dark UI. */
export const categoryChip: Record<FieldNoteCategory, string> = {
  life: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  health: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  motor: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  commercial: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
};

/** Paper colours for the sticky board, matching the Field Ops design. */
export interface StickyPalette {
  card: string;
  shadow: string;
  title: string;
  sub: string;
  accent: string;
  badge: string;
  inner: string;
  softButton: string;
  solidButton: string;
}

const palettes = {
  yellow: {
    card: "bg-[#fef9c3] text-[#713f12]",
    shadow: "shadow-[0_8px_16px_-4px_rgba(113,63,18,0.15),0_2px_4px_rgba(0,0,0,0.06)]",
    title: "text-[#713f12]",
    sub: "text-[#854d0e]",
    accent: "text-[#ca8a04]",
    badge: "bg-[#fef08a] text-[#854d0e]",
    inner: "bg-[#fefce8]/70",
    softButton: "bg-[#fefce8] text-[#854d0e]",
    solidButton: "bg-[#854d0e] text-[#fef9c3] hover:bg-[#713f12]",
  },
  sky: {
    card: "bg-[#e0f2fe] text-[#0369a1]",
    shadow: "shadow-[0_8px_16px_-4px_rgba(3,105,161,0.15),0_2px_4px_rgba(0,0,0,0.06)]",
    title: "text-[#0369a1]",
    sub: "text-[#0284c7]",
    accent: "text-[#0284c7]",
    badge: "bg-[#bae6fd] text-[#0369a1]",
    inner: "bg-[#f0f9ff]/70",
    softButton: "bg-[#f0f9ff] text-[#0284c7]",
    solidButton: "bg-[#0369a1] text-[#e0f2fe] hover:bg-[#075985]",
  },
  green: {
    card: "bg-[#dcfce7] text-[#14532d]",
    shadow: "shadow-[0_8px_16px_-4px_rgba(20,83,45,0.15),0_2px_4px_rgba(0,0,0,0.06)]",
    title: "text-[#14532d]",
    sub: "text-[#166534]",
    accent: "text-[#16a34a]",
    badge: "bg-[#bbf7d0] text-[#14532d]",
    inner: "bg-[#f0fdf4]/70",
    softButton: "bg-[#f0fdf4] text-[#166534]",
    solidButton: "bg-[#166534] text-[#dcfce7] hover:bg-[#14532d]",
  },
  rose: {
    card: "bg-[#ffe4e6] text-[#881337]",
    shadow: "shadow-[0_8px_16px_-4px_rgba(136,19,55,0.15),0_2px_4px_rgba(0,0,0,0.06)]",
    title: "text-[#881337]",
    sub: "text-[#9f1239]",
    accent: "text-[#e11d48]",
    badge: "bg-[#fecdd3] text-[#881337]",
    inner: "bg-[#fff1f2]/70",
    softButton: "bg-[#fff1f2] text-[#9f1239]",
    solidButton: "bg-[#881337] text-[#ffe4e6] hover:bg-[#4c0519]",
  },
} satisfies Record<string, StickyPalette>;

/** Completed → mint, overdue → rose, due today → warm yellow, scheduled/logged → sky. */
export function paletteFor(note: FieldNote): StickyPalette {
  switch (noteStage(note)) {
    case "completed":
      return palettes.green;
    case "overdue":
      return palettes.rose;
    case "today":
      return palettes.yellow;
    default:
      return palettes.sky;
  }
}

/** Slight tilt on the masking-tape strip so the board feels hand-pinned. */
export const tapeTilt = ["rotate-1", "-rotate-1", "rotate-2", "-rotate-2"];

const avatarTones = [
  "bg-fo-primary-fixed text-fo-on-primary-fixed",
  "bg-fo-secondary-container text-fo-on-secondary-container",
  "bg-fo-tertiary-fixed text-fo-on-tertiary-fixed",
  "bg-fo-primary-container text-white",
  "bg-fo-high text-fo-ink",
  "bg-fo-dim text-fo-ink",
];
export const avatarTone = (index: number) => avatarTones[index % avatarTones.length]!;

export const initialsOfClient = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
