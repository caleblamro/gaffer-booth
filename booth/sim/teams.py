"""Fictional clubs and squads. Everything here is synthetic; no real clubs or players."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

FORMATION_433: list[tuple[str, float, float]] = [
    # role, x (0 = own goal, 105 = opponent goal), y (0..68)
    ("GK", 5, 34),
    ("RB", 30, 60),
    ("CB", 22, 44),
    ("CB", 22, 24),
    ("LB", 30, 8),
    ("CM", 45, 48),
    ("CM", 40, 34),
    ("CM", 45, 20),
    ("RW", 72, 58),
    ("ST", 80, 34),
    ("LW", 72, 10),
]

FIRST = [
    "Ade", "Bram", "Cael", "Dario", "Eli", "Femi", "Gus", "Hakon", "Ivo", "Jory",
    "Kofi", "Lio", "Mats", "Nico", "Otto", "Pele", "Quin", "Rafe", "Sami", "Teo",
    "Uri", "Vik", "Wes", "Yan", "Zeki", "Arlo", "Bodhi", "Cruz", "Dax", "Ezra",
]
LAST = [
    "Okafor", "Lindqvist", "Marlow", "Brennan", "Castell", "Duarte", "Fenwick", "Haldane",
    "Iversen", "Kearney", "Lomax", "Moreau", "Novak", "Oyelaran", "Petrov", "Quill",
    "Rask", "Solberg", "Thorne", "Varga", "Whitlock", "Yilmaz", "Zielinski", "Ashby",
    "Blackwood", "Corrigan", "Delacroix", "Ekwueme", "Farrow", "Grieve",
]


@dataclass
class Player:
    id: str
    name: str
    number: int
    role: str
    rating: float  # 0..1 general quality
    finishing: float
    passing: float
    defending: float
    anchor: tuple[float, float]
    stamina: float = 1.0
    on_pitch: bool = True

    def short(self) -> str:
        return self.name.split(" ")[-1]


@dataclass
class Team:
    id: str  # "home" | "away"
    name: str
    short: str
    color: str
    alt_color: str
    attack: float
    midfield: float
    defense: float
    press: float  # baseline pressing intensity 0..1
    players: list[Player] = field(default_factory=list)
    bench: list[Player] = field(default_factory=list)

    def on_pitch(self) -> list[Player]:
        return [p for p in self.players if p.on_pitch]


CLUBS = [
    dict(name="Harbour City", short="HBC", color="#1e6fd9", alt_color="#ffffff",
         attack=0.62, midfield=0.60, defense=0.58, press=0.62),
    dict(name="Kingsmoor Athletic", short="KMA", color="#d92b3a", alt_color="#ffffff",
         attack=0.60, midfield=0.58, defense=0.60, press=0.55),
    dict(name="Ravenshollow FC", short="RVH", color="#222831", alt_color="#f5c518",
         attack=0.57, midfield=0.62, defense=0.61, press=0.66),
    dict(name="Westbridge Rovers", short="WBR", color="#0f9d58", alt_color="#ffffff",
         attack=0.64, midfield=0.57, defense=0.55, press=0.50),
]


def build_team(side: str, club: dict, rng: random.Random) -> Team:
    team = Team(id=side, **club)
    used: set[str] = set()

    def name() -> str:
        while True:
            n = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            if n not in used:
                used.add(n)
                return n

    numbers = [1, 2, 5, 4, 3, 8, 6, 10, 7, 9, 11]
    for i, (role, x, y) in enumerate(FORMATION_433):
        base = (club["attack"] + club["midfield"] + club["defense"]) / 3
        rating = max(0.3, min(0.95, rng.gauss(base, 0.07)))
        team.players.append(_player(side, i, name(), numbers[i], role, rating, (x, y), rng))
    bench_roles = ["CB", "CM", "RW", "ST", "LW"]
    for j, role in enumerate(bench_roles):
        anchor = next((x, y) for r, x, y in FORMATION_433 if r == role)
        rating = max(0.3, min(0.95, rng.gauss(0.58, 0.07)))
        p = _player(side, 11 + j, name(), 12 + j * 3, role, rating, anchor, rng)
        p.on_pitch = False
        team.bench.append(p)
    return team


def _player(side, i, name, number, role, rating, anchor, rng) -> Player:
    attacker = role in ("ST", "RW", "LW")
    defender = role in ("CB", "RB", "LB", "GK")
    return Player(
        id=f"{side}-{i:02d}",
        name=name,
        number=number,
        role=role,
        rating=rating,
        finishing=min(0.95, rating + (0.12 if attacker else -0.1) + rng.uniform(-0.05, 0.05)),
        passing=min(0.95, rating + (0.08 if role == "CM" else 0) + rng.uniform(-0.05, 0.05)),
        defending=min(0.95, rating + (0.12 if defender else -0.08) + rng.uniform(-0.05, 0.05)),
        anchor=anchor,
    )
