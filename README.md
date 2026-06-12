# Nominal.

*What 145 years of American baby names reveal.*

An interactive visualization site built on the U.S. Social Security
Administration baby-name applications database (national 1880–2025,
state-level 1910–2025).

## The site

Eight interactive views, all sharing one persistent name list (kept in your
browser's local storage, so it follows you between tabs and sessions):

| Tab | What it shows |
| --- | --- |
| **Trends** | Any names' popularity over time (defaults to the current top 10), per-million or raw counts, girls/boys/both |
| **Maps** | Most/least *regional* names (choropleth of location quotients), and name *migration* — animated trails of a name's geographic center of gravity per decade |
| **Meanings** | Curated thematic groups (biblical, presidential, virtue, nature, gems, mythological, royal) over time, with war-years context bands |
| **Up & Coming** | Breakout, surging, and fading names of the last few years |
| **Gender Flips** | Names that crossed the boy–girl line (Leslie, Ashley, Madison…), per-decade % girls |
| **Decades** | The most distinctively *of-their-decade* names, 1880s–2020s |
| **One-Hit Wonders** | Names that spiked and vanished, with pop-culture annotations |
| **Big Picture** | Name-diversity collapse (top-10/100/1000 share, effective name count), letter fashions heatmap, mean name length |

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
