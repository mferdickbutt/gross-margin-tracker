# Gross margin tracker

Public, static-first tracker of **gross margin by product line and month**. The table is baked into `index.html` at render time so a no-JavaScript `curl` already shows line names, month labels, and numeric GM% / GM$.

## Formula

\[
\text{GM\$} = \text{revenue} - \text{COGS}
\]

\[
\text{GM\%} = \frac{\text{revenue} - \text{COGS}}{\text{revenue}}
\]

When **revenue is 0** (or the dataset is empty), **GM% is `null`** and the UI prints `—`. The code never returns `NaN` or `Infinity`.

Company target in the sample file is **45%** (`targetGrossMarginPct: 0.45`). Each product line may override that (for example Core Platform 70%, Hardware Kits 30%). Cell color is relative to the **row** target: at/above, within 3 percentage points, or further below.

## Data schema (`data/margin.json`)

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Currently `1` |
| `currency` | ISO code used for formatting (`USD`) |
| `targetGrossMarginPct` | Company target as a decimal (`0.45` = 45%) |
| `updatedAt` | ISO date of the snapshot |
| `lines[]` | Named product lines (`id`, `name`, optional `targetGrossMarginPct`) |
| `periods[]` | Months (`id` like `2025-09`, `label` like `Sep 2025`) |
| `periods[].cells[lineId]` | `{ "revenue": number, "cogs": number }` in currency units |

The sample covers **12 months** (Sep 2025–Aug 2026) and **5 lines**: Core Platform, Analytics Suite, Hardware Kits, Professional Services, Cloud Storage. Hardware Kits is paused in Aug 2026 (`revenue: 0`, `cogs: 0`) so that cell’s GM% is undefined.

## Re-render the static page

After editing `data/margin.json` or the renderer:

```bash
node scripts/render-static.js
```

That overwrites `index.html` with a fresh table (KPIs, monthly totals, trailing-period totals, MoM on the total row). Optional `js/app.js` only reveals a GM% / GM$ density toggle; it does not fetch data or show a loading shell.

Serve locally if you want a browser:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

`.nojekyll` is included so GitHub Pages will not run Jekyll on the `data/` and `js/` paths.

## Tests

```bash
bash scripts/test.sh
```

Expect `Summary: N passed, 0 failed` and exit code 0. Coverage includes empty datasets, zero-revenue cells, allocation/totals, MoM, production JSON shape, and first-paint HTML (no `Loading…`).

## Suggested next improvements

- Plug in a real general ledger export (or warehouse query) instead of the sample JSON.
- Add a contribution-margin view (variable vs fixed COGS) and a mix/volume/price bridge.
- Persist comments on outlier months (e.g. Hardware Kits pause).
- CSV download of the analyzed grid and sparkline small-multiples per line.
- Auth-gated actuals vs a public, lagged snapshot.
