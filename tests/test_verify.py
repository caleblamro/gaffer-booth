from booth.crew.verify import Evidence, verify

ROSTER = ["Wes Varga", "Mats Lindqvist", "Cruz Novak"]


def ev():
    return Evidence.from_facts({
        "clock": "65:10", "score_home": 2, "score_away": 3, "shot_xg": 0.46,
        "team_xg": 2.13, "scorer": "Wes Varga", "assist": "Mats Lindqvist", "possession": 58,
    })


def test_accepts_evidence_numbers_and_names():
    r = verify("Wes Varga scores from a 0.46 xG chance at 65:10, set up by Lindqvist. 2-3.", ev(), ROSTER)
    assert r.ok, r.violations
    assert ("0.46", "shot_xg") in r.checked


def test_accepts_rounding_and_percentages():
    assert verify("They have 2.1 xG and 58% of the ball.", ev(), ROSTER).ok
    assert verify("A 46% chance.", ev(), ROSTER).ok


def test_rejects_invented_numbers():
    r = verify("That was his 9th goal of the season.", ev(), ROSTER)
    assert not r.ok and "9" in r.violations[0]


def test_rejects_wrong_scoreline_and_unknown_player():
    assert not verify("It is now 3-3.", ev(), ROSTER).ok
    assert not verify("Cruz Novak was involved.", ev(), ROSTER).ok


def test_decimal_comma_in_other_languages():
    assert verify("Una ocasión de 0,46 xG.", ev(), ROSTER).ok
