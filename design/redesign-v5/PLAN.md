# v5 "Gallery": design plan

## Brief
- **Subject:** a live football broadcast produced by an AI crew. The crew picks moments, explains them, checks every number against match data, builds graphics and voices commentary.
- **Audience:** hackathon judges from Microsoft and the Premier League, plus broadcast producers.
- **Primary job:** show, at a glance, what is on air, what is coming next, and that every claim was checked.

## Why v2–v4 read as generated
Checked against the frontend-design calibration list:

- **v3:** a straight Stripe copy.
- **v4:**
  - Light mode used cream paper with a serif display (trait 1).
  - Dark mode was near-black with an acid-green accent (trait 2).
  - Small labels were monospace, there were all-caps eyebrows and `A · B · C` meta strings (trait 5).
  - Content was chopped into identical rounded cards (trait 4).

## Direction
The UI is a broadcast gallery's monitor wall, taken from the real equipment.

- **Monitors with tally.** Each panel is a monitor set into a wall, and its frame is a tally light that carries real state:
  - red: on program (on air)
  - green: in preview (next up)
  - unlit: everything else
- **UMD strip.** Each monitor's name sits on an under-monitor display strip at its bottom edge, as on real galleries, rather than an eyebrow above it.
- **Talkback.** The panel looks like a broadcast talkback panel: a row of keys, one per crew member. A key lights while that agent is working, and pressing a key addresses that agent. This replaces the separate Crew card.

All the boldness goes into the wall and the tally. Everything else stays quiet.

## Tokens
| name | dark (gallery at night) | light (daylight gallery) | role |
|---|---|---|---|
| wall | #2b3038 | #c7ccd3 | the wall monitors sit in |
| glass | #171b21 | #f7f8fa | monitor screens and panels |
| ink | #e6e9ee | #1b2027 | text |
| tally | #e5342b | #d92a20 | on program |
| cue | #2fb457 | #1f9a47 | preview, verified |
| home | #4d86ff | #2462e8 | home side |
| away | #ff9d2e | #d97706 | away side |

- **Black** only appears in the UMD strips, as #0d0f12.
- **Radius:** 3px on monitors and 2px on keys. Cards are not rounded.
- **Depth:** set by the contrast between wall and glass. There are no soft drop shadows.

## Type
- **Barlow Condensed (600/700):** scorelines, monitor names and headlines. This is the narrow DIN-like grotesk of stadium signage and broadcast graphics.
- **Barlow (400/500/600):** UI and body text.
- **Tabular figures:** used throughout.
- **Case:** no monospace and no all caps. UMD strips use condensed type in sentence case.

## Layout (live)
```
+--------------------------------------------------------------+
| Gaffer Booth   [Gallery][Rundown][Checks][Stats][Full time]  |  bar (wall)
+--------------------------------------+-----------------------+
|                                      | +-------------------+ |
|   PROGRAM monitor (red tally)        | | ON AIR log        | |
|                                      | | headline, claims  | |
|                                      | | sign-off list     | |
|______________________________________| |___________________| |
| UMD: Program · Main camera  2–3 66:18| | UMD: On air       | |
+--------------+-----------+-----------+ +-------------------+ |
| PREVIEW (grn)| cam 2     | cam 3     | | NEXT (green)      | |
+--------------+-----------+-----------+-+-------------------+-+
| TALKBACK keys: [Director][Analyst][Verifier][Graphics][Comm.] |
| log of exchanges ...                    | [ ask … ] [Talk]   |
+--------------------------------------------------------------+
```
Content is left-aligned. Numbers in tables are right-aligned. The scoreline is set in Barlow Condensed at display size inside the Program UMD strip.

## Principles
1. **Structure is state.** A border colour always means tally or cue and is never decoration.
2. **Claims read like a sign-off sheet.** Each line gives the claim, its value and its source, with a tick or a strike.
3. **Motion only when tally changes.** The frame light switches state; there are no entrance animations.
4. **Copy is plain.** Use "On air", "Next up" and "Ask the analyst", with no product-speak.
