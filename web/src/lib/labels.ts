import type { Segment, Side } from "../types";

export const SLOT_LABEL: Record<Segment["slot"], string> = {
  full_screen: "Full screen",
  stat_card: "Stat card",
  player_card: "Player card",
  lower_third: "Lower third",
};

/** Scenario titles are just the fixture, so the storyline label comes from the id. */
export const storyline = (id: string) => (id === "classic" ? "Open game" : id.charAt(0).toUpperCase() + id.slice(1).replaceAll("_", " "));

/** The UI palette is side-based: home is the accent, away the teal. */
export const sideClass = (s: Side) => (s === "home" ? "h" : "a");

/** Kit colours for the rendered picture: home in white, away in dark navy. */
export const PICTURE_KITS: Record<Side, string> = { home: "#ffffff", away: "#0b2a4a" };

/** Dark or light ink for a number printed on a shirt of this colour. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return "#fff";
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#0b2a4a" : "#ffffff";
}

export const claimsOf = (seg: Segment) => {
  const ok = seg.verification.checked.length;
  return { ok, total: ok + seg.verification.violations.length };
};
