from booth.sim.engine import SCENARIOS, shot_xg, simulate, storyline_seed


def test_simulation_is_deterministic():
    a = simulate("classic", 42)
    b = simulate("classic", 42)
    assert [e.to_dict() for e in a.events] == [e.to_dict() for e in b.events]


def test_realistic_totals_over_many_matches():
    goals = shots = 0
    n = 30
    for seed in range(n):
        r = simulate("classic", seed)
        goals += sum(e.type == "goal" for e in r.events)
        shots += sum(e.type == "shot" for e in r.events)
    assert 1.8 < goals / n < 4.5
    assert 18 < shots / n < 40


def test_xg_is_higher_close_to_goal():
    assert shot_xg(99, 34) > shot_xg(88, 34) > shot_xg(75, 34)
    assert shot_xg(99, 34) > shot_xg(99, 60)
    assert shot_xg(99, 34, header=True) < shot_xg(99, 34)


def test_every_scenario_finds_its_storyline():
    for sid, sc in SCENARIOS.items():
        seed = storyline_seed(sid)
        assert sc.storyline(simulate(sid, seed)), sid


def test_red_card_scenario_sends_a_player_off():
    r = simulate("red_card")
    assert any(e.type == "red_card" and e.team == "home" for e in r.events)
