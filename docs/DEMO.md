# Demo video script (target 1:50, hard limit 2:00)

Judges are not required to watch past 2 minutes. Record at 1080p, with no copyrighted music.

| Time | Screen | Voiceover |
|---|---|---|
| 0:00–0:12 | Setup screen | "Live TV turns raw match data into story. Gaffer Booth does it with an AI crew: five agents that watch the match, decide what matters, prove every number and put it on air." |
| 0:12–0:20 | Pick **Harbour City vs Westbridge Rovers**, join from 55', speed 20×, EN+ES, Go live | "This is a synthetic match. Westbridge are 3-1 up at the hour." |
| 0:20–0:45 | First stat card or goal lands. Point at the control room | "The Director picks the moment, the Analyst explains why it matters, and the Verifier checks every number against data computed in code. Here are the claims it verified." |
| 0:45–1:05 | Show a Verifier rejection, or the console lines with claim chips | "When a model invents a stat, the Verifier rejects it and the Analyst rewrites it. If the model is slow, a fallback tier keeps the show on air." |
| 1:05–1:25 | Toggle ES captions and voice on | "The Commentator voices it in several languages at once, and each line is verified too." |
| 1:25–1:40 | Comeback goal and full-time card | "Momentum, pressing collapse, player spotlights: all detected live from the event stream." |
| 1:40–1:50 | Architecture slide (README diagram) | "Built on Microsoft Agent Framework and Microsoft Foundry, running on Azure Container Apps, deployed with azd." |

Checklist before recording:
- A model is configured (control room badge shows `foundry:...`, not "fallback tier").
- Browser at 1600×900, zoom 100%.
- Run the scenario once beforehand, since the storyline seed is fixed and the match is the same every time.
