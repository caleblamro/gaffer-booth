"""Deterministic fallback tier.

Used when no model is configured, when a model call times out, or when the verifier
rejects a model's output twice. Keeps the broadcast on time and always correct.
"""

from __future__ import annotations

from booth.intel.moments import Moment

LANG_NAMES = {"en": "English", "es": "Spanish", "fr": "French", "pt": "Portuguese",
              "de": "German", "ar": "Arabic", "ja": "Japanese", "hi": "Hindi"}


def poss(name: str) -> str:
    return name + ("'" if name.endswith("s") else "'s")


def plural(n, word: str, many: str | None = None) -> str:
    return f"{n} " + (word if n == 1 else many or word + "s")


def _f(m: Moment) -> dict:
    return m.fact_dict()


def analyst_insight(m: Moment, names: dict[str, str]) -> str:
    f = _f(m)
    team = names[m.team]
    opp = names["away" if m.team == "home" else "home"]
    k = m.kind
    if k == "goal":
        bp = f.get("buildup_passes", 0)
        s = f"{f['scorer']} finishes a chance worth {f['shot_xg']} xG"
        if "assist" in f:
            s += f", set up by {f['assist']}"
        s += f". {team} have now built {f['team_xg']} xG to {poss(opp)} {f['opp_xg']}."
        if bp >= 5:
            s += f" The move strung together {bp} passes."
        return s
    if k == "big_chance":
        return (f"{f['shooter']} should score: a {f['shot_xg']} xG chance, "
                f"{f['outcome'].replace('_', ' ')}. {team} are up to {f['team_xg']} xG.")
    if k == "red_card":
        return (f"{f['player']} is sent off. {team} have {f['players_left']} players "
                f"and have had {f['possession_pct']}% of the ball so far.")
    if k == "momentum":
        return (f"{team} have taken over: {f['xg_10']} xG to {f['opp_xg_10']} in the last 10 minutes, "
                f"with {f['fte_10']} final-third entries to {f['opp_fte_10']}.")
    if k == "press_drop":
        return (f"{poss(team)} press has faded. PPDA has gone from {f['ppda_first_half']} in the first half "
                f"to {f['ppda_last15']} over the last 15 minutes, and {opp} have found "
                f"{f['opp_xg_15']} xG in that spell.")
    if k == "press_surge":
        return (f"{team} have turned the press up: PPDA down from {f['ppda_first_half']} to "
                f"{f['ppda_last15']} over the last 15 minutes.")
    if k == "spotlight":
        bits = []
        if f.get("shots"):
            bits.append(f"{plural(f['shots'], 'shot')} ({f['xg']} xG)")
        if f.get("key_passes"):
            bits.append(plural(f['key_passes'], "key pass").replace("passs", "passes"))
        if f.get("dribbles_won"):
            bits.append(plural(f['dribbles_won'], "dribble") + " won")
        if f.get("tackles_won") or f.get("interceptions"):
            bits.append(plural(f['ball_wins'], "ball win"))
        if f.get("saves"):
            bits.append(plural(f['saves'], "save"))
        return f"{f['player']} is everywhere: " + ", ".join(bits or [f"{f['touches']} touches"]) + "."
    if k == "substitution":
        return f"{f['on']} replaces {f['off']} for {team}."
    if k == "talkback":
        return talkback_insight(m, names)
    if k in ("half_time", "full_time"):
        return (f"{names['home']} {f['score_home']}-{f['score_away']} {names['away']}. "
                f"xG {f['home_xg']} to {f['away_xg']}, shots {f['home_shots']} to {f['away_shots']}.")
    return m.headline


def talkback_insight(m: Moment, names: dict[str, str]) -> str:
    """Deterministic answer to a producer request, from the code-built evidence pack."""
    f = _f(m)
    team = names[m.team]
    opp = names["away" if m.team == "home" else "home"]
    if "player" in f:
        parts = []
        if f["goals"]:
            parts.append(plural(f["goals"], "goal"))
        if f["shots"]:
            parts.append(f"{plural(f['shots'], 'shot')} worth {f['xg']} xG")
        if f["key_passes"]:
            parts.append(plural(f["key_passes"], "key pass", "key passes"))
        if f["ball_wins"]:
            parts.append(plural(f["ball_wins"], "ball win"))
        parts.append(f"{f['pass_pct']}% passing from {plural(f['touches'], 'touch', 'touches')}")
        return f"{f['player']} for {team} so far: " + ", ".join(parts) + "."
    return (f"{team} have had {f['possession']}% of the ball to {poss(opp)} {f['opp_possession']}%, "
            f"completing {f['pass_pct']}% of their passes to {f['opp_pass_pct']}%. Over the last "
            f"10 minutes: {f['poss_10']}% possession and {f['fte_10']} final-third entries to "
            f"{f['opp_fte_10']}, with {f['xg_10']} xG to {f['opp_xg_10']}.")


COMMENTARY = {
    "en": {
        "goal": "GOAL! {scorer} scores for {team}! {score}.",
        "big_chance": "What a chance for {shooter}! That was a {shot_xg} xG opportunity.",
        "red_card": "Red card! {player} is off and {team} are down to {players_left}.",
        "momentum": "{team} are on top now: {xg_10} xG in the last 10 minutes.",
        "press_drop": "{team} can't press like they did. Their PPDA is up to {ppda_last15}.",
        "press_surge": "{team} are swarming forward, pressing high.",
        "spotlight": "Keep an eye on {player}, involved in everything.",
        "substitution": "{on} comes on for {off}.",
        "half_time": "Half-time: {score}.",
        "full_time": "Full-time: {score}.",
        "talkback_player": "{player} so far: {pass_pct}% of passes completed from {touches} touches.",
        "talkback_team": "{team} have {possession}% of the ball, and {fte_10} final-third entries "
                         "to {opp_fte_10} in the last 10 minutes.",
    },
    "es": {
        "goal": "¡GOL! ¡{scorer} marca para {team}! {score}.",
        "big_chance": "¡Qué ocasión para {shooter}! Una oportunidad de {shot_xg} xG.",
        "red_card": "¡Tarjeta roja! {player} se va y {team} se queda con {players_left}.",
        "momentum": "{team} dominan ahora: {xg_10} xG en los últimos 10 minutos.",
        "press_drop": "{team} ya no presiona igual. Su PPDA sube a {ppda_last15}.",
        "press_surge": "{team} aprietan arriba con todo.",
        "spotlight": "Atención a {player}, está en todas.",
        "substitution": "Entra {on} por {off}.",
        "half_time": "Descanso: {score}.",
        "full_time": "Final del partido: {score}.",
        "talkback_player": "{player} hasta ahora: {pass_pct}% de pases completados en {touches} toques.",
        "talkback_team": "{team} tienen el {possession}% del balón y {fte_10} entradas al último "
                         "tercio por {opp_fte_10} en los últimos 10 minutos.",
    },
    "fr": {
        "goal": "BUT ! {scorer} marque pour {team} ! {score}.",
        "big_chance": "Quelle occasion pour {shooter} ! Une occasion à {shot_xg} xG.",
        "red_card": "Carton rouge ! {player} est exclu, {team} jouent à {players_left}.",
        "momentum": "{team} prennent le dessus : {xg_10} xG sur les 10 dernières minutes.",
        "press_drop": "{team} ne pressent plus autant. Leur PPDA monte à {ppda_last15}.",
        "press_surge": "{team} pressent très haut.",
        "spotlight": "Attention à {player}, partout sur le terrain.",
        "substitution": "{on} remplace {off}.",
        "half_time": "Mi-temps : {score}.",
        "full_time": "Fin du match : {score}.",
        "talkback_player": "{player} jusqu'ici : {pass_pct}% de passes réussies sur {touches} ballons.",
        "talkback_team": "{team} ont {possession}% de possession, et {fte_10} entrées dans le dernier "
                         "tiers contre {opp_fte_10} sur les 10 dernières minutes.",
    },
}


def commentary(m: Moment, names: dict[str, str], lang: str) -> str:
    f = _f(m)
    table = COMMENTARY.get(lang, COMMENTARY["en"])
    kind = m.kind
    if kind == "talkback":
        kind = "talkback_player" if "player" in f else "talkback_team"
    tpl = table.get(kind)
    if not tpl:
        return m.headline
    score = f"{names['home']} {f['score_home']}-{f['score_away']} {names['away']}"
    extra = {"opp": names["away" if m.team == "home" else "home"]}
    try:
        return tpl.format(team=names[m.team], score=score, **extra, **f)
    except KeyError:
        return m.headline


def director_pick(queue: list[Moment], now_min: float, last_air_min: float) -> tuple[Moment | None, str, str]:
    """Return (moment, slot, reason)."""
    fresh = [m for m in queue if now_min - m.minute <= (6 if m.priority >= 0.9 else 3)]
    if not fresh:
        return None, "", "nothing fresh enough to air"
    best = max(fresh, key=lambda m: (m.priority, m.minute))
    if best.priority < 0.5 and now_min - last_air_min < 2:
        return None, "", "low-value moment too soon after last segment"
    slot = slot_for(best.kind)
    return best, slot, f"highest priority ({best.priority:.2f}) fresh moment"


def slot_for(kind: str, player: str | None = None) -> str:
    if kind == "talkback":
        return "player_card" if player else "stat_card"
    return {
        "goal": "full_screen", "half_time": "full_screen", "full_time": "full_screen",
        "momentum": "stat_card", "press_drop": "stat_card", "press_surge": "stat_card",
        "red_card": "lower_third", "big_chance": "lower_third", "spotlight": "player_card",
        "substitution": "lower_third",
    }.get(kind, "lower_third")


# Fact keys each graphic shows by default (the graphics agent may choose others).
DEFAULT_GRAPHIC_KEYS = {
    "goal": ["scorer", "assist", "shot_xg", "buildup_passes", "team_xg"],
    "big_chance": ["shooter", "shot_xg", "outcome"],
    "red_card": ["player", "players_left"],
    "momentum": ["xg_10", "shots_10", "fte_10", "poss_10"],
    "press_drop": ["ppda_first_half", "ppda_last15", "high_actions_15", "opp_xg_15"],
    "press_surge": ["ppda_first_half", "ppda_last15", "high_actions_15"],
    "spotlight": ["shots", "xg", "key_passes", "dribbles_won", "pass_pct"],
    "substitution": ["on", "off"],
    "half_time": ["home_xg", "home_shots", "home_on_target", "home_possession", "home_pass_pct"],
    "full_time": ["home_xg", "home_shots", "home_on_target", "home_possession", "home_pass_pct"],
    # Player answers use the player keys, team answers the rest; zeros are skipped.
    "talkback": ["goals", "shots", "xg", "key_passes", "dribbles_won", "ball_wins", "pass_pct",
                 "touches", "possession", "poss_10", "fte_10", "team_xg"],
}

TITLES = {
    "goal": "GOAL", "big_chance": "BIG CHANCE", "red_card": "RED CARD", "momentum": "MOMENTUM",
    "press_drop": "PRESS FADING", "press_surge": "PRESSING SURGE", "spotlight": "IN FOCUS",
    "substitution": "SUBSTITUTION", "half_time": "HALF-TIME", "full_time": "FULL-TIME",
    "talkback": "BY THE NUMBERS",
}
