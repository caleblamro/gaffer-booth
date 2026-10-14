"""Claim verification: every number and player named on air must trace back to evidence.

This is the guardrail that makes the broadcast explainable. Models write words; the
numbers they use must match facts computed in code (or returned by analyst tools).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

NUM_RE = re.compile(r"(?<![\w.])(\d+(?:[.,]\d+)?)(%|st|nd|rd|th|º|ª|e|er)?(?![\w])")
CLOCK_RE = re.compile(r"\b\d{1,3}(?::\d{2}|\+\d{1,2})\b")
# Small counts that are safe without evidence (e.g. "one of two", "a 1-on-1").
FREE_NUMBERS = {"1"}


@dataclass
class Evidence:
    numbers: dict[str, float] = field(default_factory=dict)  # key -> value
    strings: dict[str, str] = field(default_factory=dict)  # key -> text value
    clocks: set[str] = field(default_factory=set)

    def add(self, key: str, value) -> None:
        if isinstance(value, bool):
            return
        if isinstance(value, (int, float)):
            self.numbers[key] = float(value)
        elif isinstance(value, str):
            self.strings[key] = value
            for c in CLOCK_RE.findall(value):
                self.clocks.add(c)
        elif isinstance(value, dict):
            for k, v in value.items():
                self.add(f"{key}.{k}", v)
        elif isinstance(value, (list, tuple)):
            for i, v in enumerate(value):
                self.add(f"{key}[{i}]", v)

    @classmethod
    def from_facts(cls, facts: dict) -> Evidence:
        ev = cls()
        for k, v in facts.items():
            ev.add(k, v)
        return ev


@dataclass
class VerifyResult:
    ok: bool
    checked: list[tuple[str, str]] = field(default_factory=list)  # (token, evidence key)
    violations: list[str] = field(default_factory=list)

    def summary(self) -> str:
        if self.ok:
            return f"{len(self.checked)} claim(s) verified"
        return "; ".join(self.violations)


def _matches(token: str, value: float) -> bool:
    try:
        t = float(token.replace(",", "."))
    except ValueError:
        return False
    if abs(t - value) < 1e-9:
        return True
    decimals = len(token.replace(",", ".").split(".")[1]) if re.search(r"[.,]", token) else 0
    if round(value, decimals) == t:
        return True
    # Allow xG-style values rendered as percentages and vice versa (0.42 <-> 42%).
    if abs(t - value * 100) < 0.6 or abs(t / 100 - value) < 1e-9:
        return True
    return False


def verify(text: str, ev: Evidence, roster: list[str]) -> VerifyResult:
    res = VerifyResult(ok=True)
    scrub = text
    # Clocks that appear in evidence are fine as a unit.
    for c in CLOCK_RE.findall(text):
        if c in ev.clocks:
            res.checked.append((c, "clock"))
        else:
            res.violations.append(f"clock '{c}' not in evidence")
        scrub = scrub.replace(c, " ")
    # Score lines like 2-1.
    for a, b in re.findall(r"\b(\d+)\s*[-–]\s*(\d+)\b", scrub):
        sh, sa = ev.numbers.get("score_home"), ev.numbers.get("score_away")
        pair = {(float(a), float(b)), (float(b), float(a))}
        if sh is not None and (sh, sa) in pair:
            res.checked.append((f"{a}-{b}", "score"))
            scrub = re.sub(rf"\b{a}\s*[-–]\s*{b}\b", " ", scrub, count=1)
        elif sh is not None and float(a) <= 15 and float(b) <= 15 and "shot" not in scrub.lower():
            res.violations.append(f"scoreline '{a}-{b}' not in evidence")
            scrub = re.sub(rf"\b{a}\s*[-–]\s*{b}\b", " ", scrub, count=1)
        # Otherwise leave both numbers in place to be checked individually (e.g. "shots 25-20").
    for m in NUM_RE.finditer(scrub):
        tok = m.group(1)
        if tok in FREE_NUMBERS:
            continue
        hit = next((k for k, v in ev.numbers.items() if _matches(tok, v)), None)
        if hit is None:
            # Also accept numbers embedded in string facts (e.g. "10 men").
            hit = next((k for k, v in ev.strings.items()
                        if re.search(rf"(?<![\d.]){re.escape(tok)}(?![\d.])", v)), None)
        if hit:
            res.checked.append((tok, hit))
        else:
            res.violations.append(f"number '{tok}' not in evidence")
    allowed_names = " ".join(ev.strings.values()).lower()
    for name in roster:
        surname = name.split(" ")[-1]
        if re.search(rf"\b{re.escape(name)}\b", text) or re.search(rf"\b{re.escape(surname)}\b", text):
            if name.lower() in allowed_names or surname.lower() in allowed_names:
                res.checked.append((name, "player"))
            else:
                res.violations.append(f"player '{name}' not in evidence")
    res.ok = not res.violations
    return res
