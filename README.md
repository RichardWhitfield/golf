# Golf

A personal golf-improvement site, live at **[golf.whitfield.life](https://golf.whitfield.life)**.

A 3-week practice plan for fixing an over-the-top slice, built around one KPI: **driver** club
path, from `−6°/−10°` toward `−2°/+2°`. Being expanded into a living practice tracker.

Opens on a **Today panel** that works out the current day in Sydney and shows that day's drills
in full, with a picker for any other day.

## Running it

No build step yet — `index.html` is self-contained.

```zsh
open index.html          # or
python3 -m http.server   # then visit localhost:8000
```

## Documentation

| File | Contents |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Working conventions and guardrails |
| [`docs/design.md`](docs/design.md) | Visual design system — colour, type, components, motion |
| [`docs/content.md`](docs/content.md) | The coaching content: drills, plan, KPI |
| [`docs/architecture.md`](docs/architecture.md) | Target stack and data model |
| [`docs/roadmap.md`](docs/roadmap.md) | Phasing and open questions |

## Deployment

GitHub Pages serves the repo root. `CNAME` sets the custom domain — it must be preserved by any
future build step.
