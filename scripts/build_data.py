#!/usr/bin/env python3
"""Precompute JSON artifacts for the Nominal site from raw SSA baby-name data.

Inputs:
  data/names/yob{YYYY}.txt          name,sex,count          (national, 1880-2025)
  data/namesbystate/{ST}.TXT        state,sex,year,name,count (1910-2025)

Outputs (docs/data/):
  meta.json            years, national totals, state decade totals, centroids, decades
  top.json             top 50 names per sex per year
  names/{a-z}.json     per-name national series, sharded by first letter
  states/{a-z}.json    per-name state x decade counts, sharded by first letter
  regional.json        most/least regional names per window
  migration.json       biggest centroid movers per compass direction
  rising.json          fastest rising / falling names
  gender.json          notable gender-shift names
  decades.json         signature names per decade
  wonders.json         one-hit wonder spikes (+ pop-culture annotations)
  bigpicture.json      diversity indices and letter/length trends
"""
import json
import math
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NATL_DIR = os.path.join(ROOT, "data", "names")
STATE_DIR = os.path.join(ROOT, "data", "namesbystate")
OUT = os.path.join(ROOT, "docs", "data")

YEAR_MIN, YEAR_MAX = 1880, 2025
YEARS = list(range(YEAR_MIN, YEAR_MAX + 1))
NYEARS = len(YEARS)
DECADES = list(range(1910, 2030, 10))  # 1910s .. 2020s
NDEC = len(DECADES)

STATE_CENTROIDS = {
    "AL": (32.8, -86.8), "AK": (64.0, -152.0), "AZ": (34.2, -111.6),
    "AR": (34.8, -92.4), "CA": (37.2, -119.3), "CO": (39.0, -105.5),
    "CT": (41.6, -72.7), "DE": (39.0, -75.5), "DC": (38.9, -77.0),
    "FL": (28.6, -82.4), "GA": (32.6, -83.4), "HI": (20.3, -156.4),
    "ID": (44.4, -114.6), "IL": (40.0, -89.2), "IN": (39.9, -86.3),
    "IA": (42.0, -93.5), "KS": (38.5, -98.4), "KY": (37.5, -85.3),
    "LA": (31.0, -92.0), "ME": (45.4, -69.2), "MD": (39.0, -76.8),
    "MA": (42.3, -71.8), "MI": (44.3, -85.4), "MN": (46.3, -94.3),
    "MS": (32.7, -89.7), "MO": (38.4, -92.5), "MT": (47.0, -109.6),
    "NE": (41.5, -99.8), "NV": (39.3, -116.6), "NH": (43.7, -71.6),
    "NJ": (40.2, -74.7), "NM": (34.4, -106.1), "NY": (42.9, -75.5),
    "NC": (35.5, -79.4), "ND": (47.4, -100.5), "OH": (40.3, -82.8),
    "OK": (35.6, -97.5), "OR": (43.9, -120.6), "PA": (40.9, -77.8),
    "RI": (41.7, -71.6), "SC": (33.9, -80.9), "SD": (44.4, -100.2),
    "TN": (35.8, -86.3), "TX": (31.5, -99.3), "UT": (39.3, -111.7),
    "VT": (44.0, -72.7), "VA": (37.5, -78.9), "WA": (47.4, -120.4),
    "WV": (38.6, -80.6), "WI": (44.6, -89.7), "WY": (43.0, -107.6),
}
STATES = sorted(STATE_CENTROIDS)
# Maps and the regional/migration stats cover the continental US only.
CONT_STATES = [s for s in STATES if s not in ("AK", "HI")]


def dump(name, obj):
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  {name}: {os.path.getsize(path) / 1e6:.2f} MB")


# ---------------------------------------------------------------- national
print("Loading national data...")
# natl[name][sex] = [count per year]
natl = defaultdict(lambda: {})
totals = {"F": [0] * NYEARS, "M": [0] * NYEARS}
for yi, year in enumerate(YEARS):
    with open(os.path.join(NATL_DIR, f"yob{year}.txt")) as f:
        for line in f:
            name, sex, cnt = line.strip().split(",")
            cnt = int(cnt)
            series = natl[name].setdefault(sex, [0] * NYEARS)
            series[yi] = cnt
            totals[sex][yi] += cnt

ALL_NAMES = sorted(natl)
print(f"  {len(ALL_NAMES)} unique names")


def natl_total(name, sex):
    s = natl[name].get(sex)
    return sum(s) if s else 0


def shard_key(name):
    c = name[0].lower()
    return c if "a" <= c <= "z" else "0"


# names/{letter}.json : {name: {sex: [firstYearIdxOffsetYear, counts...trimmed]}}
print("Writing national name shards...")
shards = defaultdict(dict)
for name in ALL_NAMES:
    entry = {}
    for sex, series in natl[name].items():
        first = next(i for i, v in enumerate(series) if v)
        last = max(i for i, v in enumerate(series) if v)
        entry[sex] = [YEAR_MIN + first] + series[first:last + 1]
    shards[shard_key(name)][name] = entry
for key, data in sorted(shards.items()):
    dump(f"names/{key}.json", data)

# top.json : {sex: {year: [[name, count] x50]}}
print("Writing top names...")
top = {"F": {}, "M": {}}
per_year = {"F": defaultdict(list), "M": defaultdict(list)}
for name in ALL_NAMES:
    for sex, series in natl[name].items():
        for yi, v in enumerate(series):
            if v:
                per_year[sex][yi].append((v, name))
for sex in ("F", "M"):
    for yi, lst in per_year[sex].items():
        lst.sort(reverse=True)
        top[sex][str(YEAR_MIN + yi)] = [[n, c] for c, n in lst[:50]]
del per_year
dump("top.json", top)

# ---------------------------------------------------------------- state
print("Loading state data (this takes a minute)...")
# st[name][sex][state] = [count per decade]
st = defaultdict(lambda: defaultdict(dict))
state_dec_totals = {s: {"F": [0] * NDEC, "M": [0] * NDEC} for s in STATES}
for state in STATES:
    with open(os.path.join(STATE_DIR, f"{state}.TXT")) as f:
        for line in f:
            stc, sex, year, name, cnt = line.strip().split(",")
            di = (int(year) - 1910) // 10
            cnt = int(cnt)
            arr = st[name][sex].setdefault(state, [0] * NDEC)
            arr[di] += cnt
            state_dec_totals[state][sex][di] += cnt

print(f"  {len(st)} unique names in state data")

# states/{letter}.json — only names with state-data total >= 100
print("Writing state shards...")
st_shards = defaultdict(dict)
kept = 0
for name, sexes in st.items():
    total = sum(sum(arr) for sx in sexes.values() for arr in sx.values())
    if total < 100:
        continue
    kept += 1
    st_shards[shard_key(name)][name] = {
        sex: {state: arr for state, arr in sx.items()} for sex, sx in sexes.items()
    }
for key, data in sorted(st_shards.items()):
    dump(f"states/{key}.json", data)
print(f"  kept {kept} names")
del st_shards

# ---------------------------------------------------------------- meta
dump("meta.json", {
    "yearMin": YEAR_MIN,
    "yearMax": YEAR_MAX,
    "totals": totals,
    "decades": DECADES,
    "stateDecadeTotals": state_dec_totals,
    "centroids": {s: [round(la, 2), round(lo, 2)] for s, (la, lo) in STATE_CENTROIDS.items()},
})

# ---------------------------------------------------------------- regional
print("Computing regionality...")


def regional_lists(dec_lo, dec_hi):
    """TVD between a name's state distribution and the baseline birth
    distribution, over the continental US (lower 48 + DC).

    The SSA censors state counts under 5 per year, so a thin name can look
    intensely "regional" just because it cleared the bar in one state. To keep
    the signal-to-noise ratio high we assume every state hides counts just
    under the reporting minimum (4 per year the name was nationally active),
    add those phantom counts in before scoring, and drop any name whose real
    counts don't outweigh the worst-case phantom mass.
    """
    yr_lo = 1910 + dec_lo * 10
    yr_hi = min(YEAR_MAX, 1910 + dec_hi * 10 - 1)
    i_lo, i_hi = yr_lo - YEAR_MIN, yr_hi - YEAR_MIN + 1
    out = {}
    for sexes in (("F",), ("M",), ("F", "M")):
        key = "A" if len(sexes) == 2 else sexes[0]
        base = {s: sum(state_dec_totals[s][sx][di]
                       for sx in sexes for di in range(dec_lo, dec_hi))
                for s in CONT_STATES}
        base_total = sum(base.values())
        baseq = {s: v / base_total for s, v in base.items()}
        scored = []
        for name, sx_data in st.items():
            counts = {s: 0 for s in CONT_STATES}
            total = 0
            for sx in sexes:
                for state, arr in sx_data.get(sx, {}).items():
                    if state not in baseq:
                        continue
                    v = sum(arr[dec_lo:dec_hi])
                    counts[state] += v
                    total += v
            if total < 3000:
                continue
            # phantom counts: 4 per state per year the name was nationally active
            nat = natl.get(name, {})
            active_years = sum(
                1 for yi in range(i_lo, i_hi)
                if any(nat.get(sx) and nat[sx][yi] for sx in sexes))
            hidden = 4 * active_years
            if total < hidden * len(CONT_STATES):  # signal must outweigh worst-case noise
                continue
            sm_total = total + hidden * len(CONT_STATES)
            tvd = sum(abs((counts[s] + hidden) / sm_total - baseq[s]) for s in CONT_STATES) / 2
            lq_of = lambda s: ((counts[s] + hidden) / sm_total) / max(baseq[s], 1e-9)
            # the hotspot must have real counts above the phantom noise floor,
            # otherwise a zero-count tiny state can "win" on phantoms alone
            candidates = [s for s in CONT_STATES if counts[s] >= hidden] or CONT_STATES
            top_state = max(candidates, key=lq_of)
            scored.append((tvd, name, total, top_state, lq_of(top_state)))
        scored.sort(reverse=True)
        fmt = lambda t: [{"name": n, "tvd": round(v, 4), "total": tot,
                          "topState": ts, "lq": round(l, 2)} for v, n, tot, ts, l in t]
        out[key] = {"most": fmt(scored[:60]), "least": fmt(scored[-60:][::-1])}
    return out


regional = {"all": regional_lists(0, NDEC), "recent": regional_lists(9, NDEC)}  # recent = 2000+
dump("regional.json", regional)

# ---------------------------------------------------------------- migration
print("Computing migration...")


def centroid(name, sex, di):
    """Per-capita-rate-weighted centroid of a name in a decade, over the
    continental US. None if thin."""
    wsum = la = lo = 0.0
    n = 0
    for state, arr in st[name].get(sex, {}).items():
        if state in ("AK", "HI"):
            continue
        tot = state_dec_totals[state][sex][di]
        if not tot or not arr[di]:
            continue
        w = arr[di] / tot
        cla, clo = STATE_CENTROIDS[state]
        la += w * cla
        lo += w * clo
        wsum += w
        n += arr[di]
    if wsum == 0 or n < 80:
        return None
    return (la / wsum, lo / wsum, n)


migration = []
for name, sexes in st.items():
    for sex in sexes:
        pts = [centroid(name, sex, di) for di in range(NDEC)]
        valid = [(di, p) for di, p in enumerate(pts) if p]
        if len(valid) < 7:
            continue
        total = sum(p[2] for _, p in valid)
        if total < 8000:
            continue
        # average of first two vs last two valid decades
        head = valid[:2]
        tail = valid[-2:]
        la0 = sum(p[1][0] for p in head) / len(head)
        lo0 = sum(p[1][1] for p in head) / len(head)
        la1 = sum(p[1][0] for p in tail) / len(tail)
        lo1 = sum(p[1][1] for p in tail) / len(tail)
        dla, dlo = la1 - la0, lo1 - lo0
        migration.append({
            "name": name, "sex": sex, "total": total,
            "dLat": round(dla, 3), "dLon": round(dlo, 3),
            "path": [[DECADES[di], round(p[0], 2), round(p[1], 2)] for di, p in valid],
        })

mig_out = {}
for key, score in (("north", lambda m: m["dLat"]), ("south", lambda m: -m["dLat"]),
                   ("east", lambda m: m["dLon"]), ("west", lambda m: -m["dLon"])):
    mig_out[key] = sorted(migration, key=score, reverse=True)[:30]
# stable: smallest overall movement among high-volume names
mig_out["stable"] = sorted(
    (m for m in migration if m["total"] > 100000),
    key=lambda m: math.hypot(m["dLat"], m["dLon"]))[:30]
dump("migration.json", mig_out)

# ---------------------------------------------------------------- rising / falling
print("Computing rising & falling names...")


def rate(name, sex, yi):
    s = natl[name].get(sex)
    if not s or not totals[sex][yi]:
        return 0.0
    return s[yi] / totals[sex][yi] * 1e6  # per million


rising = {"F": {"rising": [], "surging": [], "falling": []},
          "M": {"rising": [], "surging": [], "falling": []}}
LAST = NYEARS - 1
for name in ALL_NAMES:
    for sex in natl[name]:
        recent = sum(rate(name, sex, LAST - i) for i in range(3)) / 3
        prior = sum(rate(name, sex, LAST - i) for i in range(3, 9)) / 6
        cur_count = natl[name][sex][LAST]
        if cur_count >= 250 and prior > 0.5 and recent > prior:
            growth = recent / prior
            rising[sex]["rising"].append((growth, name, cur_count, round(recent, 1)))
            # absolute per-million gain rewards big names on the move
            rising[sex]["surging"].append((recent - prior, name, cur_count, round(recent, 1)))
        peak_prior = max((rate(name, sex, LAST - i) for i in range(3, 12)), default=0)
        if peak_prior > 100 and recent < peak_prior:  # was at least ~1 in 10k
            drop = recent / peak_prior
            rising[sex]["falling"].append((drop, name, cur_count, round(recent, 1)))

for sex in rising:
    rising[sex]["rising"].sort(reverse=True)
    rising[sex]["surging"].sort(reverse=True)
    rising[sex]["falling"].sort()
    for key in ("rising", "surging", "falling"):
        rising[sex][key] = [{"name": n, "growth": round(g, 2), "count": c, "rate": r}
                            for g, n, c, r in rising[sex][key][:40]]
dump("rising.json", rising)

# ---------------------------------------------------------------- gender shifts
print("Computing gender shifts...")
gender = []
for name in ALL_NAMES:
    f = natl[name].get("F")
    m = natl[name].get("M")
    if not f or not m:
        continue
    tf, tm = sum(f), sum(m)
    if tf + tm < 5000 or min(tf, tm) / (tf + tm) < 0.04:
        continue
    # decade %F profile
    prof = []
    for d0 in range(0, NYEARS, 10):
        cf = sum(f[d0:d0 + 10])
        cm = sum(m[d0:d0 + 10])
        prof.append(round(cf / (cf + cm), 3) if cf + cm >= 100 else None)
    valid = [p for p in prof if p is not None]
    if len(valid) < 4:
        continue
    delta = valid[-1] - valid[0]
    gender.append({"name": name, "total": tf + tm, "pF": prof,
                   "delta": round(delta, 3),
                   "now": valid[-1], "start": valid[0]})

gender.sort(key=lambda g: -abs(g["delta"]))
dump("gender.json", {"decadeStart": YEAR_MIN, "names": gender[:200]})

# ---------------------------------------------------------------- decade signatures
print("Computing decade signatures...")
decades_out = {}
ALL_DECADES = list(range(1880, 2030, 10))
for sex in ("F", "M"):
    sex_total_all = sum(totals[sex])
    decades_out[sex] = {}
    for d in ALL_DECADES:
        i0 = d - YEAR_MIN
        i1 = min(i0 + 10, NYEARS)
        dec_total = sum(totals[sex][i0:i1])
        scored = []
        for name in ALL_NAMES:
            s = natl[name].get(sex)
            if not s:
                continue
            dc = sum(s[i0:i1])
            if dc < 1500:
                continue
            share_dec = dc / dec_total
            share_all = sum(s) / sex_total_all
            scored.append((share_dec / share_all, name, dc))
        scored.sort(reverse=True)
        decades_out[sex][str(d)] = [{"name": n, "ratio": round(r, 1), "count": c}
                                    for r, n, c in scored[:20]]
dump("decades.json", decades_out)

# ---------------------------------------------------------------- one-hit wonders
print("Computing one-hit wonders...")
ANNOTATIONS = {
    ("Farrah", "F"): "Farrah Fawcett debuts in Charlie's Angels (1976)",
    ("Jaime", "F"): "The Bionic Woman's Jaime Sommers airs (1976)",
    ("Tabatha", "F"): "Bewitched's daughter Tabitha (1966)",
    ("Krystle", "F"): "Krystle Carrington on Dynasty (1981)",
    ("Alexis", "F"): "Alexis Carrington on Dynasty (1981)",
    ("Whitney", "F"): "Whitney Houston's debut album (1985)",
    ("Mariah", "F"): "Mariah Carey's debut (1990)",
    ("Selena", "F"): "Selena Quintanilla's death and biopic (1995-97)",
    ("Aaliyah", "F"): "Aaliyah's death (2001)",
    ("Miley", "F"): "Hannah Montana airs (2006)",
    ("Khaleesi", "F"): "Game of Thrones airs (2011)",
    ("Daenerys", "F"): "Game of Thrones airs (2011)",
    ("Arya", "F"): "Game of Thrones airs (2011)",
    ("Beyonce", "F"): "Destiny's Child peak (2001)",
    ("Ariel", "F"): "The Little Mermaid (1989)",
    ("Tiana", "F"): "The Princess and the Frog (2009)",
    ("Moana", "F"): "Moana (2016)",
    ("Elsa", "F"): "Frozen (2013)",
    ("Shirley", "F"): "Shirley Temple's stardom (1934)",
    ("Marilyn", "F"): "Marilyn Monroe era",
    ("Dewey", "M"): "Admiral Dewey wins Manila Bay (1898)",
    ("Woodrow", "M"): "Woodrow Wilson elected (1912)",
    ("Lindbergh", "M"): "Charles Lindbergh's transatlantic flight (1927)",
    ("Elvis", "M"): "Elvis Presley breaks out (1956)",
    ("Kobe", "M"): "Kobe Bryant's NBA rise (late 1990s)",
    ("Hillary", "F"): "Hillary Clinton becomes First Lady (1993)",
    ("Katina", "F"): "Baby Katina born on soap All My Children (1972)",
    ("Catina", "F"): "Baby Katina born on soap All My Children (1972)",
    ("Ricky", "M"): "I Love Lucy's Little Ricky born (1953)",
    ("Dylan", "M"): "Beverly Hills 90210's Dylan McKay (1990)",
    ("Kylo", "M"): "Star Wars: The Force Awakens (2015)",
    ("Kizzy", "F"): "Roots miniseries airs (1977)",
    ("Kunta", "M"): "Roots miniseries airs (1977)",
    ("Moesha", "F"): "Moesha sitcom premieres (1996)",
    ("Shaquille", "M"): "Shaquille O'Neal's NBA debut (1992)",
    ("Ermias", "M"): "Rapper Nipsey Hussle (Ermias Asghedom) dies (2019)",
    ("Atreus", "M"): "God of War Ragnarok (2022)",
    ("Nakia", "F"): "Nakia TV series (1974)",
    ("Jermajesty", "M"): "Jermaine Jackson's son makes headlines",
    ("Oprah", "F"): "The Oprah Winfrey Show goes national (1986)",
    ("Espn", "M"): "Parents really named kids after the sports network",
    ("Talullah", "F"): "Tallulah Bankhead's fame",
    ("Catalina", "F"): "Telenovela era",
}

def is_truncation_artifact(name, sex):
    """SSA files (notably 1989) contain truncated names like 'Christop'.
    Treat a name as an artifact if it's a prefix of a 10x-more-popular longer name."""
    if len(name) < 6:
        return False
    own = natl_total(name, sex)
    for other in ALL_NAMES:
        if other != name and other.startswith(name) and natl_total(other, sex) > own * 10:
            return True
    return False


wonders = []
for name in ALL_NAMES:
    for sex, series in natl[name].items():
        peak_yi = max(range(NYEARS), key=lambda i: (series[i] / totals[sex][i]) if totals[sex][i] else 0)
        peak_rate = rate(name, sex, peak_yi)
        if series[peak_yi] < 400 or peak_rate < 80:
            continue
        if peak_yi > NYEARS - 4:  # still climbing — can't be a one-hit wonder yet
            continue
        if is_truncation_artifact(name, sex):
            continue
        # baseline: median rate over the 8 years before and after, excluding peak +/-2
        window = [rate(name, sex, i) for i in range(max(0, peak_yi - 10), min(NYEARS, peak_yi + 11))
                  if abs(i - peak_yi) > 2]
        if not window:
            continue
        window.sort()
        baseline = window[len(window) // 2]
        spike = peak_rate / max(baseline, 0.5)
        if spike < 4:
            continue
        i0, i1 = max(0, peak_yi - 15), min(NYEARS, peak_yi + 16)
        wonders.append({
            "name": name, "sex": sex, "peakYear": YEAR_MIN + peak_yi,
            "peakCount": series[peak_yi], "peakRate": round(peak_rate, 1),
            "spike": round(spike, 1),
            "note": ANNOTATIONS.get((name, sex)),
            "series": [YEAR_MIN + i0] + series[i0:i1],
        })
wonders.sort(key=lambda w: -w["spike"])
dump("wonders.json", wonders[:80])

# ---------------------------------------------------------------- big picture
print("Computing diversity & letters...")
big = {"diversity": {}, "letters": {}}
for sex in ("F", "M"):
    div = {"top10": [], "top100": [], "top1000": [], "effective": [], "distinct": []}
    first = [[0] * 26 for _ in range(NYEARS)]
    last = [[0] * 26 for _ in range(NYEARS)]
    length = [0.0] * NYEARS
    counts_by_year = defaultdict(list)
    for name in ALL_NAMES:
        s = natl[name].get(sex)
        if not s:
            continue
        fi = ord(name[0].lower()) - 97
        li = ord(name[-1].lower()) - 97
        ln = len(name)
        for yi, v in enumerate(s):
            if not v:
                continue
            counts_by_year[yi].append(v)
            if 0 <= fi < 26:
                first[yi][fi] += v
            if 0 <= li < 26:
                last[yi][li] += v
            length[yi] += v * ln
    for yi in range(NYEARS):
        lst = sorted(counts_by_year[yi], reverse=True)
        tot = totals[sex][yi] or 1
        div["top10"].append(round(sum(lst[:10]) / tot, 4))
        div["top100"].append(round(sum(lst[:100]) / tot, 4))
        div["top1000"].append(round(sum(lst[:1000]) / tot, 4))
        simpson = sum((v / tot) ** 2 for v in lst)
        div["effective"].append(round(1 / simpson, 1) if simpson else 0)
        div["distinct"].append(len(lst))
        length[yi] = round(length[yi] / tot, 3)
    big["diversity"][sex] = div
    big["letters"][sex] = {
        "first": [[round(c / (totals[sex][yi] or 1), 4) for c in row] for yi, row in enumerate(first)],
        "last": [[round(c / (totals[sex][yi] or 1), 4) for c in row] for yi, row in enumerate(last)],
        "meanLength": length,
    }
dump("bigpicture.json", big)

print("Done.")
