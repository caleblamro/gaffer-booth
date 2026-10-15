export type Side = "home" | "away";

export interface PlayerInfo {
  id: string;
  name: string;
  number: number;
  role: string;
  anchor: [number, number];
}

export interface TeamInfo {
  id: Side;
  name: string;
  short: string;
  color: string;
  alt_color: string;
  players: PlayerInfo[];
  bench: PlayerInfo[];
}

export interface MatchEvent {
  id: number;
  t: number;
  period: number;
  clock: string;
  team: Side;
  type: string;
  player_id?: string;
  player?: string;
  x?: number;
  y?: number;
  end_x?: number;
  end_y?: number;
  outcome?: string;
  xg?: number;
  detail?: Record<string, unknown>;
}

export interface Score {
  home: number;
  away: number;
  clock: string;
  period: number;
}

export interface TeamStats {
  goals: number;
  shots: number;
  on_target: number;
  xg: number;
  possession_pct: number;
  pass_pct: number;
  passes: number;
  corners: number;
  fouls: number;
  yellow: number;
  red: number;
  final_third_entries: number;
  ppda: number | null;
}

export interface Fact {
  key: string;
  label: string;
  value: number | string;
}

export interface Moment {
  id: number;
  kind: string;
  team: Side;
  clock: string;
  minute: number;
  priority: number;
  headline: string;
  facts: Fact[];
  player?: string | null;
  /** Producer talkback text, when this moment answers a request. */
  request?: string | null;
}

export interface OverlayRow {
  key?: string;
  label: string;
  value?: string;
  home?: string;
  away?: string;
}

export interface Overlay {
  slot: "full_screen" | "stat_card" | "lower_third" | "player_card";
  kind: string;
  team: Side;
  team_name: string;
  color: string;
  title: string;
  subtitle: string;
  clock: string;
  moment_id: number;
  rows?: OverlayRow[];
  player?: string;
  compare?: {
    home: string;
    away: string;
    home_color: string;
    away_color: string;
    score: [number, number];
    rows: OverlayRow[];
  };
}

export interface Segment {
  moment: Moment;
  slot: Overlay["slot"];
  overlay: Overlay;
  insight: string;
  commentary: Record<string, string>;
  verification: { ok: boolean; checked: [string, string][]; violations: string[] };
  aired_clock: string;
  /** Aired straight from the template tier because the crew was busy. */
  breaking?: boolean;
  talkback?: boolean;
  request?: string;
  receivedAt: number;
}

export interface ConsoleLine {
  agent: "Producer" | "Director" | "Analyst" | "Verifier" | "Graphics" | "Commentator";
  status: string;
  text: string;
  ms: number;
  mode: string;
  moment_id: number | null;
  clock: string;
  attempt?: number;
  checked?: [string, string][];
  seq: number;
}

export interface Scenario {
  id: string;
  title: string;
  blurb: string;
  home: string;
  away: string;
}

export interface InitMsg {
  scenario: string;
  scenario_id: string;
  seed: number;
  mode: string;
  langs: string[];
  lineups: { home: TeamInfo; away: TeamInfo };
}
