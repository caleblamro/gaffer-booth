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


# Drafts that talk about the data instead of giving it ("Need Pele Grieve's match stats…").
NON_ANSWER_RE = re.compile(
    r"^\W*(?:i\s+|we\s+)?(?:need|needs|let me|let's check|i'll|i will|checking|fetching|looking up|"
    r"calling|waiting|pending|awaiting)\b"
    r"|\b(?:i|we)\s+(?:don't|do not|can't|cannot|couldn't|could not)\s+(?:have|see|find|access|get)\b"
    r"|\bno (?:data|stats|statistics|information|numbers)\b"
    r"|\b(?:not|isn't|aren't) (?:available|provided|included|given) in the (?:evidence|data)\b"
    r"|\b(?:not|isn't|aren't) in the (?:evidence|data)\b"
    r"|\b(?:unable to|insufficient (?:data|evidence)|would need|tool call|evidence (?:pack|keys?))\b",
    re.IGNORECASE,
)


def on_air_issue(text: str, res: VerifyResult) -> str | None:
    """Why an Analyst draft that passed the number check still can't air, or None.

    The number check only proves the draft invents nothing; a non-answer like "Need Pele
    Grieve's match stats" invents nothing too. An insight must say something, so it has to
    read as an answer and cite at least one number, score or clock from the evidence."""
    if NON_ANSWER_RE.search(text):
        return "draft is a request for data, not an answer"
    if not any(key != "player" for _, key in res.checked):
        return "draft cites no number from the evidence"
    return None


def verify(text: str, ev: Evidence, roster: list[str], answer: bool = False) -> VerifyResult:
    """Check every number, clock, score and player in text against the evidence. With
    answer=True (Analyst drafts) the text must also be a real, evidence-backed answer."""
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
    in_evidence = {n for n in roster if n.lower() in allowed_names}
    seen: set[str] = set()
    for name in roster:
        # A full name must itself be in evidence; a surname-only mention must match a player who is.
        if name not in seen and re.search(rf"\b{re.escape(name)}\b", text):
            seen.add(name)
            if name in in_evidence:
                res.checked.append((name, "player"))
            else:
                res.violations.append(f"player '{name}' not in evidence")
    scrub_names = text
    for name in seen:
        scrub_names = re.sub(rf"\b{re.escape(name)}\b", " ", scrub_names)
    for surname in sorted({n.split(" ")[-1] for n in roster}):
        if not re.search(rf"\b{re.escape(surname)}\b", scrub_names):
            continue
        hits = [n for n in roster if n.split(" ")[-1] == surname and n in in_evidence]
        if hits:
            res.checked.extend((n, "player") for n in hits)
        else:
            res.violations.append(f"player '{surname}' not in evidence")
    if answer and not res.violations and (issue := on_air_issue(text, res)):
        res.violations.append(issue)
    res.ok = not res.violations
    return res
