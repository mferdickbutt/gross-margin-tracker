#!/usr/bin/env node
/**
 * Bake data/margin.json + js/margin.js analysis into index.html
 * so first paint (curl, no-JS browsers) already contains the table.
 *
 * Usage: node scripts/render-static.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var MarginTracker = require(path.join(root, "js", "margin.js"));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellClass(status) {
  if (status === "above" || status === "near" || status === "below" || status === "na") {
    return status;
  }
  return "na";
}

function renderCell(metrics, target, currency) {
  var status = MarginTracker.statusVsTarget(metrics.marginPct, target);
  var title =
    "Revenue " +
    MarginTracker.formatMoney(metrics.revenue, currency) +
    " · COGS " +
    MarginTracker.formatMoney(metrics.cogs, currency);
  var mom = "";
  if (metrics.momPctDelta !== undefined && metrics.momDollarsDelta !== undefined) {
    mom =
      '<span class="mom">' +
      escapeHtml(MarginTracker.formatSignedPct(metrics.momPctDelta)) +
      " MoM</span>";
  }
  return (
    '<td class="' +
    cellClass(status) +
    '" title="' +
    escapeHtml(title) +
    '">' +
    '<span class="pct">' +
    escapeHtml(MarginTracker.formatPct(metrics.marginPct)) +
    "</span>" +
    '<span class="amt">' +
    escapeHtml(MarginTracker.formatMoney(metrics.marginDollars, currency)) +
    "</span>" +
    mom +
    "</td>"
  );
}

function render(dataset) {
  var analysis = MarginTracker.analyze(dataset);
  var currency = analysis.currency;
  var companyTarget = analysis.targetGrossMarginPct;

  var monthHeaders = analysis.periods
    .map(function (period) {
      return (
        '<th scope="col">' +
        escapeHtml(period.label) +
        '<span class="amt">GM% / GM$</span></th>'
      );
    })
    .join("");

  var lineRows = analysis.byLine
    .map(function (line) {
      var cells = analysis.periods
        .map(function (period) {
          return renderCell(analysis.cells[line.lineId][period.id], line.targetGrossMarginPct, currency);
        })
        .join("");
      var totalMetrics = {
        revenue: line.revenue,
        cogs: line.cogs,
        marginDollars: line.marginDollars,
        marginPct: line.marginPct
      };
      return (
        "<tr>" +
        '<th class="line" scope="row">' +
        escapeHtml(line.name) +
        '<span class="amt">Target ' +
        escapeHtml(MarginTracker.formatPct(line.targetGrossMarginPct)) +
        "</span></th>" +
        cells +
        renderCell(totalMetrics, line.targetGrossMarginPct, currency) +
        "</tr>"
      );
    })
    .join("\n");

  var totalCells = analysis.monthly
    .map(function (month) {
      var payload = {
        revenue: month.revenue,
        cogs: month.cogs,
        marginDollars: month.marginDollars,
        marginPct: month.marginPct
      };
      if (month.index > 0) {
        payload.momPctDelta = month.momPctDelta;
        payload.momDollarsDelta = month.momDollarsDelta;
      }
      return renderCell(payload, companyTarget, currency);
    })
    .join("");

  var overallCell = renderCell(
    {
      revenue: analysis.overall.revenue,
      cogs: analysis.overall.cogs,
      marginDollars: analysis.overall.marginDollars,
      marginPct: analysis.overall.marginPct
    },
    companyTarget,
    currency
  );

  var bestLine = analysis.bestLine
    ? analysis.bestLine.name + " at " + MarginTracker.formatPct(analysis.bestLine.marginPct)
    : "—";
  var worstLine = analysis.worstLine
    ? analysis.worstLine.name + " at " + MarginTracker.formatPct(analysis.worstLine.marginPct)
    : "—";
  var bestMonth = analysis.bestMonth
    ? analysis.bestMonth.label + " at " + MarginTracker.formatPct(analysis.bestMonth.marginPct)
    : "—";
  var worstMonth = analysis.worstMonth
    ? analysis.worstMonth.label + " at " + MarginTracker.formatPct(analysis.worstMonth.marginPct)
    : "—";

  var overallStatus = MarginTracker.statusVsTarget(analysis.overall.marginPct, companyTarget);

  var jsonBlob = JSON.stringify(dataset);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gross margin tracker</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div>
        <h1>Gross margin tracker</h1>
        <p class="lede">Product-line × month gross margin for a public dataset of
          ${analysis.lines.length} lines across ${analysis.periods.length} months.
          First paint is the table below — no JavaScript required.
          Company target is ${escapeHtml(MarginTracker.formatPct(companyTarget))}.</p>
      </div>
      <dl class="formula">
        <dt>Formula</dt>
        <dd>GM$ = revenue − COGS</dd>
        <dd>GM% = (revenue − COGS) / revenue</dd>
        <dd>Zero revenue → GM% is — (not 0, NaN, or Infinity)</dd>
      </dl>
    </header>

    <section class="kpis" aria-label="Headline margins">
      <div class="kpi ${escapeHtml(overallStatus)}">
        <span class="label">Overall GM%</span>
        <span class="value">${escapeHtml(MarginTracker.formatPct(analysis.overall.marginPct))}</span>
        <span class="sub">${escapeHtml(MarginTracker.formatMoney(analysis.overall.marginDollars, currency))} on ${escapeHtml(MarginTracker.formatMoney(analysis.overall.revenue, currency))} revenue</span>
      </div>
      <div class="kpi">
        <span class="label">Best line</span>
        <span class="value">${escapeHtml(analysis.bestLine ? analysis.bestLine.name : "—")}</span>
        <span class="sub">${escapeHtml(analysis.bestLine ? MarginTracker.formatPct(analysis.bestLine.marginPct) : "n/a")}</span>
      </div>
      <div class="kpi">
        <span class="label">Worst line</span>
        <span class="value">${escapeHtml(analysis.worstLine ? analysis.worstLine.name : "—")}</span>
        <span class="sub">${escapeHtml(analysis.worstLine ? MarginTracker.formatPct(analysis.worstLine.marginPct) : "n/a")}</span>
      </div>
      <div class="kpi">
        <span class="label">Best month</span>
        <span class="value">${escapeHtml(analysis.bestMonth ? analysis.bestMonth.label : "—")}</span>
        <span class="sub">${escapeHtml(analysis.bestMonth ? MarginTracker.formatPct(analysis.bestMonth.marginPct) : "n/a")}</span>
      </div>
      <div class="kpi">
        <span class="label">Worst month</span>
        <span class="value">${escapeHtml(analysis.worstMonth ? analysis.worstMonth.label : "—")}</span>
        <span class="sub">${escapeHtml(analysis.worstMonth ? MarginTracker.formatPct(analysis.worstMonth.marginPct) : "n/a")}</span>
      </div>
    </section>

    <div class="table-wrap">
      <table class="margin">
        <caption>Gross margin by product line and month (baked into HTML at render time)</caption>
        <thead>
          <tr>
            <th class="line" scope="col">Product line</th>
            ${monthHeaders}
            <th scope="col">Trailing ${analysis.periods.length} mo<span class="amt">GM% / GM$</span></th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
          <tr class="totals">
            <th class="line" scope="row">Monthly total
              <span class="amt">Company target ${escapeHtml(MarginTracker.formatPct(companyTarget))}</span>
            </th>
            ${totalCells}
            ${overallCell}
          </tr>
        </tbody>
      </table>
    </div>

    <p class="legend">
      Cell color vs that row’s target:
      <span><i class="swatch above"></i> at or above</span>
      <span><i class="swatch near"></i> within 3 pp</span>
      <span><i class="swatch below"></i> more than 3 pp below</span>
      · Hover a cell for revenue and COGS.
    </p>

    <section class="insights" aria-label="Trends">
      <article class="insight">
        <h2>Best / worst</h2>
        <p>Strongest line: ${escapeHtml(bestLine)}. Weakest line: ${escapeHtml(worstLine)}. Strongest month: ${escapeHtml(bestMonth)}. Weakest month: ${escapeHtml(worstMonth)}.</p>
      </article>
      <article class="insight">
        <h2>MoM on company total</h2>
        <p>Monthly total cells show percentage-point change vs the prior month. Hardware Kits is at zero revenue in Aug 2026 (paused), so that cell’s GM% is —.</p>
      </article>
      <article class="insight">
        <h2>Updated</h2>
        <p>Dataset dated ${escapeHtml(dataset.updatedAt || "n/a")}. Currency ${escapeHtml(currency)}. Re-render with <code>node scripts/render-static.js</code>.</p>
      </article>
    </section>

    <p class="notes">Source: <a href="data/margin.json"><code>data/margin.json</code></a>. Optional JS only toggles % / $ density — it does not fetch or replace this table.</p>

    <div class="js-only" hidden>
      <span>View:</span>
      <button type="button" data-view="both" aria-pressed="true">% and $</button>
      <button type="button" data-view="pct" aria-pressed="false">GM% only</button>
      <button type="button" data-view="amt" aria-pressed="false">GM$ only</button>
    </div>
  </div>
  <script type="application/json" id="margin-data">${jsonBlob}</script>
  <script src="js/margin.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
`;
}

var dataPath = path.join(root, "data", "margin.json");
var outPath = path.join(root, "index.html");
var dataset = JSON.parse(fs.readFileSync(dataPath, "utf8"));
fs.writeFileSync(outPath, render(dataset));
process.stdout.write("Wrote " + outPath + "\n");
