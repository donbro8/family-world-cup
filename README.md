# 🏆 Family World Cup Challenge

A free, GitHub Pages–hosted live leaderboard for our family FIFA World Cup sweepstake.
Each person picks 2 teams; the site tracks scores, shows who's winning, what's on next,
and the person behind each team.

**Built from [`plan.md`](plan.md)** — see that document for the full spec.

## What it does
- **Live leaderboard** of all 9 players, sorted by total points (faces + their 2 teams).
- **Weekly Tracker** grid (Weeks 1–7 + Total), recreated from the flyer.
- **Next Up** hero card — the next fixture involving a family team, with the owners' faces
  (and a graceful "Unclaimed" placeholder for unowned opponents).
- **Match Center** with stage tabs, and a **Prizes & Rules** drawer.
- **Automated scoring** via a scheduled GitHub Action — no manual data entry needed.

## How scoring works
- Win **3**, Draw **1**, Goal **1** each.
- Progression (cumulative): R16 **+3**, QF **+5**, SF **+7**, Final **+10**, Champion **+15**.
- Your score = the combined points of your two teams. Highest total wins.

## Files
| File | Purpose |
| --- | --- |
| `index.html` / `style.css` / `app.js` | The static site (no build step). |
| `data.json` | Single source of truth: players, teams, fixtures, prizes. |
| `assets/faces/` | Player photos (optional — falls back to initials). |
| `figurine_prompts.md` | Copy-pasteable 3D vinyl toy figurine prompts for each family member. |
| `scripts/update-scores.mjs` | Fetches live scores from the API, rebuilds `data.json`. |
| `.github/workflows/update-scores.yml` | Runs the script every ~10 min + on-demand. |

## Setup (one-time)
1. **Push** this repo to GitHub (public).
2. **Pages**: Settings → Pages → Deploy from branch → `main` / root.
3. **API key**: register free at <https://www.football-data.org/client/register>,
   then add it under Settings → Secrets and variables → Actions as `FOOTBALL_API_KEY`.
4. **Permissions**: Settings → Actions → General → Workflow permissions → **Read and write**.
5. (Optional) add photos to `assets/faces/`.

That's it — the Action keeps `data.json` updated; the site reflects it on the next refresh.

## Run locally
```bash
# preview the site
python3 -m http.server 8000   # then open http://localhost:8000

# test the score fetcher
FOOTBALL_API_KEY=your_key node scripts/update-scores.mjs
```
