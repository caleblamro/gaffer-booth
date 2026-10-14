"""Overlay builder. The graphics agent chooses *which* facts to show; code fills values."""

from __future__ import annotations

from booth.intel.moments import Moment

from .offline import DEFAULT_GRAPHIC_KEYS, TITLES


def _fmt(v) -> str:
    if isinstance(v, float):
        return f"{v:.2f}".rstrip("0").rstrip(".") if v < 10 else f"{v:.1f}"
    return str(v).replace("_", " ")


def build_overlay(m: Moment, slot: str, names: dict[str, str], colors: dict[str, str],
                  title: str | None = None, subtitle: str | None = None,
                  keys: list[str] | None = None) -> dict:
    facts = {f.key: f for f in m.facts}
    base = {"clock", "minute", "score_home", "score_away"}
    keys = [k for k in (keys or DEFAULT_GRAPHIC_KEYS.get(m.kind, []))
            if k in facts and k not in base]
    if m.player:
        # The player's name is already the headline of the graphic.
        keys = [k for k in keys if facts[k].value != m.player]
    if not keys:
        keys = [k for k in DEFAULT_GRAPHIC_KEYS.get(m.kind, []) if k in facts]
    keys = keys[:4]
    overlay = {
        "slot": slot,
        "kind": m.kind,
        "team": m.team,
        "team_name": names[m.team],
        "color": colors[m.team],
        "title": title or TITLES.get(m.kind, m.kind.upper()),
        "subtitle": subtitle or m.headline,
        "clock": m.clock,
        "moment_id": m.id,
    }
    if m.kind in ("half_time", "full_time"):
        rows = []
        for key in keys:
            if not key.startswith("home_"):
                continue
            stat = key[len("home_"):]
            away_key = f"away_{stat}"
            if away_key in facts:
                label = facts[key].label.replace(names["home"], "").strip()
                rows.append({"label": label, "home": _fmt(facts[key].value),
                             "away": _fmt(facts[away_key].value)})
        overlay["compare"] = {"home": names["home"], "away": names["away"],
                              "home_color": colors["home"], "away_color": colors["away"],
                              "score": [facts["score_home"].value, facts["score_away"].value],
                              "rows": rows}
    else:
        overlay["rows"] = [{"key": k, "label": _short_label(facts[k].label, names),
                            "value": _fmt(facts[k].value)} for k in keys]
    if m.player:
        overlay["player"] = m.player
    return overlay


def _short_label(label: str, names: dict[str, str]) -> str:
    for n in names.values():
        label = label.replace(n + " ", "")
    return label
