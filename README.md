# Nominal.

*What 145 years of American baby names reveal.*

An interactive visualization site built on the U.S. Social Security
Administration baby-name applications database (national 1880–2025,
state-level 1910–2025).

## The site

Twelve interactive views, all sharing one set of persistent, named **name
lists** (kept in your browser's local storage). The "My Lists" manager in the
navigation creates, renames, edits, copies, and deletes lists; the built-in
lists (Biblical, Presidential, Virtue…) are ordinary lists seeded by default,
and every page works off whichever list is active.

| Tab | What it shows |
| --- | --- |
| **Trends** | Any names' popularity over time (defaults to the current top 10) — per-million, raw counts, or *relative* (each name as a % of its own peak, so rare and common names share an axis) |
| **Regional** | Most/least *regional* names (choropleth of location quotients), noise-hardened by assuming every state hides counts just under the SSA's 5-per-year reporting minimum |
| **Migration** | Animated trails of a name's geographic center of gravity per decade |
| **Compare Lists** | Any of your name lists charted against each other (share of births or % of each list's own peak) |
| **Presidents** | Presidential names aligned on each president's first inauguration (year 0) and normalized — did taking office boost or sink the name? |
| **Up & Coming** | Breakout, surging, and fading names of the last few years |
| **Gender Flips** | Names that crossed the boy–girl line (Leslie, Ashley, Madison…), per-decade % girls, with ♀/♂ poles labeled |
| **Decades** | The most distinctively *of-their-decade* names, 1880s–2020s, picked with a slider |
| **One-Hit Wonders** | Names that spiked and vanished, with pop-culture annotations |
| **Letters** | Letter fashions as 26 small multiples (each letter on its own scale, peak marked) plus mean name length |
| **Big Picture** | Name-diversity collapse: top-10/100/1000 share and the effective number of names in use |
| **Guess Who** | Given a name: the most likely gender, age today, and birth state of a living American with it (births weighted by survival) |

All maps cover the continental U.S. (lower 48 + D.C.); Alaska and Hawaii are
excluded.

## Architecture

Fully static — no backend. A Python pipeline precomputes compact JSON
artifacts from the ~150 MB of raw SSA data; the site lazy-loads them
(per-letter shards are ~1 MB each). Charts and maps are D3 v7 with animated
transitions; the US atlas and D3 are vendored, so the site has zero runtime
CDN dependencies.

```
data/                  raw SSA files (names/, namesbystate/, namesbyterritory/)
scripts/build_data.py  data pipeline -> docs/data/*.json
docs/                  the site (GitHub Pages root)
  index.html
  css/style.css
  js/                  ES modules: router, store, chart/map components, pages
  vendor/              d3, topojson-client, us-atlas (vendored)
  data/                precomputed JSON artifacts
```

### Rebuilding the data

```sh
python3 scripts/build_data.py   # ~2 min, stdlib only
```

### Running locally

```sh
cd docs && python3 -m http.server 8000
# open http://localhost:8000
```

### Deploying

The included workflow (`.github/workflows/pages.yml`) deploys `docs/` to
GitHub Pages on pushes to `main` — enable Pages with source "GitHub Actions"
in the repo settings. Alternatively, set Pages to serve from the `main`
branch's `/docs` folder.

## Data notes

- Names with fewer than 5 occurrences in a year/state are excluded by the
  SSA for privacy.
- "Per million" rates are relative to all SSA-recorded births of the
  selected sex that year, so different eras are comparable.
- The migration view weights each state's pull on a name's centroid by
  per-capita popularity, so big states don't dominate.
