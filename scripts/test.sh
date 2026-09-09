#!/usr/bin/env bash
# Gross margin tracker tests. Prints PASS/FAIL lines and a Summary.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

pass() {
  echo "PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FAIL: $1"
  FAIL=$((FAIL + 1))
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    pass "$label"
  else
    fail "$label (expected '$expected', got '$actual')"
  fi
}

if ! command -v node >/dev/null 2>&1; then
  echo "FAIL: node is required"
  echo "Summary: 0 passed, 1 failed"
  exit 1
fi

# --- Module: empty / malformed datasets ---
EMPTY_OUT="$(node -e '
const M = require("./js/margin.js");
const a = M.analyze(null);
const b = M.analyze({});
const c = M.analyze({ lines: [], periods: [] });
function ok(x) {
  return x.overall.marginPct === null
    && x.overall.revenue === 0
    && x.bestLine === null
    && x.worstLine === null
    && x.bestMonth === null
    && x.worstMonth === null
    && Array.isArray(x.monthly) && x.monthly.length === 0
    && Array.isArray(x.byLine) && x.byLine.length === 0;
}
if (!ok(a) || !ok(b) || !ok(c)) process.exit(2);
if (Object.is(a.overall.marginPct, NaN) || a.overall.marginPct === Infinity) process.exit(3);
console.log("ok");
')"
if [ "$EMPTY_OUT" = "ok" ]; then
  pass "empty/null datasets return null GM% and empty best/worst (not NaN)"
else
  fail "empty/null datasets"
fi

# --- Module: zero revenue ---
ZERO_OUT="$(node -e '
const M = require("./js/margin.js");
if (M.grossMarginPct(0, 0) !== null) process.exit(2);
if (M.grossMarginPct(0, 50) !== null) process.exit(3);
if (M.grossMarginDollars(0, 0) !== 0) process.exit(4);
const cell = M.cellMetrics({ revenue: 0, cogs: 12 });
if (cell.marginPct !== null) process.exit(5);
if (cell.marginDollars !== -12) process.exit(6);
const a = M.analyze({
  targetGrossMarginPct: 0.4,
  lines: [{ id: "x", name: "X" }],
  periods: [{ id: "2026-01", label: "Jan 2026", cells: { x: { revenue: 0, cogs: 0 } } }]
});
if (a.overall.marginPct !== null) process.exit(7);
if (a.byLine[0].marginPct !== null) process.exit(8);
if (a.monthly[0].marginPct !== null) process.exit(9);
if (a.bestLine !== null || a.worstLine !== null) process.exit(10);
if (M.formatPct(null) !== "—") process.exit(11);
console.log("ok");
')"
if [ "$ZERO_OUT" = "ok" ]; then
  pass "zero-revenue cells yield null GM% and em-dash format (not NaN/Infinity)"
else
  fail "zero-revenue handling"
fi

# --- Module: fixture GM formula ---
FORMULA_OUT="$(node -e '
const M = require("./js/margin.js");
const dollars = M.grossMarginDollars(200, 80);
const pct = M.grossMarginPct(200, 80);
if (dollars !== 120) process.exit(2);
if (Math.abs(pct - 0.6) > 1e-12) process.exit(3);
console.log("ok");
')"
if [ "$FORMULA_OUT" = "ok" ]; then
  pass "GM\$ = rev-COGS and GM% = (rev-COGS)/rev on fixture 200/80"
else
  fail "basic GM formula"
fi

# --- Module: two-line × two-month allocation / totals ---
ALLOC_OUT="$(node -e '
const M = require("./js/margin.js");
const fixture = {
  currency: "USD",
  targetGrossMarginPct: 0.5,
  lines: [
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" }
  ],
  periods: [
    {
      id: "2026-01",
      label: "Jan 2026",
      cells: {
        alpha: { revenue: 100, cogs: 40 },
        beta: { revenue: 50, cogs: 30 }
      }
    },
    {
      id: "2026-02",
      label: "Feb 2026",
      cells: {
        alpha: { revenue: 120, cogs: 36 },
        beta: { revenue: 0, cogs: 0 }
      }
    }
  ]
};
const a = M.analyze(fixture);
// Jan total: rev 150 cogs 70 GM$ 80 GM% 80/150
if (a.monthly[0].revenue !== 150) process.exit(2);
if (a.monthly[0].cogs !== 70) process.exit(3);
if (a.monthly[0].marginDollars !== 80) process.exit(4);
if (Math.abs(a.monthly[0].marginPct - 80/150) > 1e-12) process.exit(5);
// Feb total: rev 120 cogs 36 (beta contributes 0)
if (a.monthly[1].revenue !== 120) process.exit(6);
if (a.monthly[1].cogs !== 36) process.exit(7);
if (a.monthly[1].marginPct === null) process.exit(8);
// Line Alpha total: 220 / 76
if (a.byLine[0].revenue !== 220) process.exit(9);
if (a.byLine[0].cogs !== 76) process.exit(10);
if (a.byLine[0].marginDollars !== 144) process.exit(11);
// Line Beta total: 50 / 30, GM% defined
if (a.byLine[1].revenue !== 50) process.exit(12);
if (Math.abs(a.byLine[1].marginPct - 20/50) > 1e-12) process.exit(13);
// Overall: 270 / 106
if (a.overall.revenue !== 270) process.exit(14);
if (a.overall.cogs !== 106) process.exit(15);
if (a.overall.marginDollars !== 164) process.exit(16);
if (Math.abs(a.overall.marginPct - 164/270) > 1e-12) process.exit(17);
// MoM GM$ : Feb 84 - Jan 80 = 4
if (a.monthly[1].momDollarsDelta !== 4) process.exit(18);
if (a.monthly[0].momDollarsDelta !== null) process.exit(19);
// Best line should be Alpha (higher GM%)
if (a.bestLine.lineId !== "alpha") process.exit(20);
if (a.worstLine.lineId !== "beta") process.exit(21);
// Feb cell for beta is null pct
if (a.cells.beta["2026-02"].marginPct !== null) process.exit(22);
console.log("ok");
')"
if [ "$ALLOC_OUT" = "ok" ]; then
  pass "allocation/totals: monthly sums, line totals, overall, MoM dollars"
else
  fail "allocation/totals math"
fi

MOM_OUT="$(node -e '
const M = require("./js/margin.js");
const a = M.analyze({
  lines: [{ id: "a", name: "A" }],
  periods: [
    { id: "m1", label: "M1", cells: { a: { revenue: 100, cogs: 50 } } },
    { id: "m2", label: "M2", cells: { a: { revenue: 100, cogs: 40 } } },
    { id: "m3", label: "M3", cells: { a: { revenue: 0, cogs: 0 } } }
  ]
});
// M1 50%, M2 60% => +10pp; M3 null MoM pct
if (Math.abs(a.monthly[1].momPctDelta - 0.10) > 1e-12) process.exit(2);
if (a.monthly[2].momPctDelta !== null) process.exit(3);
if (a.monthly[2].momDollarsDelta !== -60) process.exit(4);
if (a.bestMonth.periodId !== "m2") process.exit(5);
if (a.worstMonth.periodId !== "m1") process.exit(6);
console.log("ok");
')"
if [ "$MOM_OUT" = "ok" ]; then
  pass "MoM pct/dollars and best/worst month skip zero-revenue periods"
else
  fail "MoM trends / best-worst month"
fi

VS_OUT="$(node -e '
const M = require("./js/margin.js");
if (M.statusVsTarget(0.50, 0.45) !== "above") process.exit(2);
if (M.statusVsTarget(0.44, 0.45) !== "near") process.exit(3);
if (M.statusVsTarget(0.40, 0.45) !== "below") process.exit(4);
if (M.statusVsTarget(null, 0.45) !== "na") process.exit(5);
if (M.vsTarget(null, 0.45) !== null) process.exit(6);
console.log("ok");
')"
if [ "$VS_OUT" = "ok" ]; then
  pass "target comparison: above / near / below / na on null"
else
  fail "target comparison"
fi

# --- Production dataset shape ---
DATA_OUT="$(node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("data/margin.json", "utf8"));
if (!Array.isArray(data.lines) || data.lines.length < 4) process.exit(2);
if (!Array.isArray(data.periods) || data.periods.length < 12) process.exit(3);
for (const line of data.lines) {
  if (!line.id || !line.name) process.exit(4);
}
for (const period of data.periods) {
  if (!period.id || !period.label || !period.cells) process.exit(5);
  for (const line of data.lines) {
    const cell = period.cells[line.id];
    if (!cell || typeof cell.revenue !== "number" || typeof cell.cogs !== "number") process.exit(6);
  }
}
if (typeof data.targetGrossMarginPct !== "number") process.exit(7);
console.log(data.lines.length + " " + data.periods.length);
')"
if [[ "$DATA_OUT" =~ ^[0-9]+[[:space:]][0-9]+$ ]]; then
  pass "data/margin.json has ≥4 named lines and ≥12 periods with revenue+COGS ($DATA_OUT)"
else
  fail "data/margin.json schema/shape"
fi

PROD_MATH="$(node -e '
const fs = require("fs");
const M = require("./js/margin.js");
const data = JSON.parse(fs.readFileSync("data/margin.json", "utf8"));
const a = M.analyze(data);
let rev = 0, cogs = 0;
for (const p of data.periods) {
  let mrev = 0, mcogs = 0;
  for (const line of data.lines) {
    mrev += p.cells[line.id].revenue;
    mcogs += p.cells[line.id].cogs;
  }
  const month = a.monthly.find(x => x.periodId === p.id);
  if (Math.abs(month.revenue - mrev) > 1e-6) process.exit(2);
  if (Math.abs(month.cogs - mcogs) > 1e-6) process.exit(3);
  rev += mrev; cogs += mcogs;
}
if (Math.abs(a.overall.revenue - rev) > 1e-6) process.exit(4);
if (Math.abs(a.overall.cogs - cogs) > 1e-6) process.exit(5);
const expectedPct = rev === 0 ? null : (rev - cogs) / rev;
if (expectedPct === null) {
  if (a.overall.marginPct !== null) process.exit(6);
} else if (Math.abs(a.overall.marginPct - expectedPct) > 1e-9) {
  process.exit(7);
}
if (!a.bestLine || !a.worstLine || !a.bestMonth || !a.worstMonth) process.exit(8);
console.log("ok");
')"
if [ "$PROD_MATH" = "ok" ]; then
  pass "production dataset monthly/overall totals match independent summation"
else
  fail "production dataset totals"
fi

# --- Static HTML (re-render then inspect) ---
if node scripts/render-static.js >/dev/null; then
  pass "scripts/render-static.js writes index.html"
else
  fail "scripts/render-static.js failed"
fi

HTML="$(cat index.html)"

if echo "$HTML" | grep -q "Loading"; then
  fail "index.html must not contain a Loading… shell"
else
  pass "index.html has no Loading… placeholder"
fi

# Product line names from JSON must appear in markup
LINES_OK="$(node -e '
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const data = JSON.parse(fs.readFileSync("data/margin.json", "utf8"));
const missing = data.lines.map(l => l.name).filter(n => !html.includes(n));
if (missing.length) { console.error(missing.join(",")); process.exit(2); }
if (data.lines.length < 4) process.exit(3);
console.log("ok");
')"
if [ "$LINES_OK" = "ok" ]; then
  pass "static HTML contains all ≥4 product line names"
else
  fail "static HTML missing product line names"
fi

MONTHS_OK="$(node -e '
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const data = JSON.parse(fs.readFileSync("data/margin.json", "utf8"));
const missing = data.periods.map(p => p.label).filter(n => !html.includes(n));
if (missing.length) { console.error(missing.join(",")); process.exit(2); }
if (data.periods.length < 12) process.exit(3);
console.log("ok");
')"
if [ "$MONTHS_OK" = "ok" ]; then
  pass "static HTML contains all ≥12 month labels"
else
  fail "static HTML missing month labels"
fi

PCT_COUNT="$(node -e '
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const pcts = html.match(/-?\d+\.\d%/g) || [];
const amts = html.match(/\$[\d,]+/g) || [];
if (pcts.length < 12) process.exit(2);
if (amts.length < 12) process.exit(3);
console.log(pcts.length + " " + amts.length);
')"
if [[ "$PCT_COUNT" =~ ^[0-9]+[[:space:]][0-9]+$ ]]; then
  pass "static HTML contains numeric GM% and \$ amounts (counts $PCT_COUNT)"
else
  fail "static HTML missing numeric margin % / amounts"
fi

# Simulated curl -sL of a file URL: first bytes include table, not a spinner
CURL_SNIP="$(node -e '
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
if (!html.includes("<table")) process.exit(2);
if (!html.includes("Core Platform")) process.exit(3);
if (!html.includes("Sep 2025")) process.exit(4);
console.log("ok");
')"
if [ "$CURL_SNIP" = "ok" ]; then
  pass "first-paint markup includes <table>, Core Platform, Sep 2025"
else
  fail "first-paint table missing expected tokens"
fi

if [ -f .nojekyll ]; then
  pass ".nojekyll present for GitHub Pages"
else
  fail ".nojekyll missing"
fi

if [ -f css/style.css ]; then
  pass "minimal CSS present at css/style.css"
else
  fail "css/style.css missing"
fi

# Dual runtime: browser global factory still exports analyze via Node require
EXPORT_OUT="$(node -e '
const M = require("./js/margin.js");
const keys = ["analyze","grossMarginPct","grossMarginDollars","cellMetrics","formatPct","formatMoney"];
for (const k of keys) if (typeof M[k] !== "function") process.exit(2);
console.log("ok");
')"
if [ "$EXPORT_OUT" = "ok" ]; then
  pass "js/margin.js exports analyze and formatters for Node"
else
  fail "js/margin.js exports"
fi

# Zero-revenue production cell should bake as em dash, not NaN in cell values
DASH_OUT="$(node -e '
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
if (/<span class="pct">NaN/.test(html) || /<span class="pct">Infinity/.test(html)) process.exit(2);
if (!/<td class="na"/.test(html)) process.exit(3);
if (!/<span class="pct">—/.test(html)) process.exit(4);
console.log("ok");
')"
if [ "$DASH_OUT" = "ok" ]; then
  pass "static HTML has em-dash for undefined GM% and no NaN/Infinity in cells"
else
  fail "NaN/Infinity or missing em-dash in HTML cells"
fi

echo "Summary: ${PASS} passed, ${FAIL} failed"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
exit 0
