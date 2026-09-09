/**
 * Gross margin tracker — works in the browser (global MarginTracker) and Node (module.exports).
 *
 * Formula: GM$ = revenue − COGS;  GM% = (revenue − COGS) / revenue
 * When revenue is 0 (or the dataset is empty), percentages are null — never NaN or Infinity.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MarginTracker = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function roundMoney(n) {
    return Math.round(n * 100) / 100;
  }

  /**
   * @returns {number} revenue − COGS (0 when inputs are missing)
   */
  function grossMarginDollars(revenue, cogs) {
    return roundMoney(toNumber(revenue) - toNumber(cogs));
  }

  /**
   * @returns {number|null} GM% as a decimal (0.42 = 42%), or null when revenue is 0
   */
  function grossMarginPct(revenue, cogs) {
    var rev = toNumber(revenue);
    if (rev === 0) return null;
    var pct = (rev - toNumber(cogs)) / rev;
    return Number.isFinite(pct) ? pct : null;
  }

  function cellMetrics(cell) {
    var revenue = toNumber(cell && cell.revenue);
    var cogs = toNumber(cell && cell.cogs);
    return {
      revenue: revenue,
      cogs: cogs,
      marginDollars: grossMarginDollars(revenue, cogs),
      marginPct: grossMarginPct(revenue, cogs)
    };
  }

  function vsTarget(marginPct, target) {
    if (marginPct === null || target === null || target === undefined) return null;
    var t = Number(target);
    if (!Number.isFinite(t)) return null;
    var delta = marginPct - t;
    return Number.isFinite(delta) ? delta : null;
  }

  function emptyAnalysis() {
    return {
      currency: "USD",
      targetGrossMarginPct: null,
      periods: [],
      lines: [],
      cells: {},
      monthly: [],
      byLine: [],
      overall: {
        revenue: 0,
        cogs: 0,
        marginDollars: 0,
        marginPct: null,
        vsTarget: null
      },
      bestLine: null,
      worstLine: null,
      bestMonth: null,
      worstMonth: null
    };
  }

  function pickBestWorst(items, idKey, nameKey) {
    var ranked = items.filter(function (item) {
      return item.marginPct !== null && Number.isFinite(item.marginPct);
    });
    if (!ranked.length) {
      return { best: null, worst: null };
    }
    ranked.sort(function (a, b) {
      return b.marginPct - a.marginPct;
    });
    function pack(item) {
      var out = {
        marginPct: item.marginPct,
        marginDollars: item.marginDollars,
        revenue: item.revenue
      };
      out[idKey] = item[idKey];
      out[nameKey] = item[nameKey];
      return out;
    }
    return { best: pack(ranked[0]), worst: pack(ranked[ranked.length - 1]) };
  }

  /**
   * Full analysis of a margin dataset.
   * Accepts null/undefined/{} and returns an empty (non-throwing) result.
   */
  function analyze(dataset) {
    if (!dataset || typeof dataset !== "object") {
      return emptyAnalysis();
    }

    var linesIn = Array.isArray(dataset.lines) ? dataset.lines : [];
    var periodsIn = Array.isArray(dataset.periods) ? dataset.periods : [];
    var companyTarget =
      dataset.targetGrossMarginPct === null || dataset.targetGrossMarginPct === undefined
        ? null
        : Number(dataset.targetGrossMarginPct);
    if (!Number.isFinite(companyTarget)) companyTarget = null;

    var result = emptyAnalysis();
    result.currency = dataset.currency || "USD";
    result.targetGrossMarginPct = companyTarget;

    var lines = linesIn
      .filter(function (line) {
        return line && line.id;
      })
      .map(function (line) {
        var t =
          line.targetGrossMarginPct === null || line.targetGrossMarginPct === undefined
            ? companyTarget
            : Number(line.targetGrossMarginPct);
        if (!Number.isFinite(t)) t = companyTarget;
        return {
          id: String(line.id),
          name: line.name ? String(line.name) : String(line.id),
          targetGrossMarginPct: t
        };
      });

    var periods = periodsIn
      .filter(function (period) {
        return period && period.id;
      })
      .map(function (period, index) {
        return {
          id: String(period.id),
          label: period.label ? String(period.label) : String(period.id),
          index: index,
          cells: period.cells && typeof period.cells === "object" ? period.cells : {}
        };
      });

    result.lines = lines.map(function (line) {
      return {
        id: line.id,
        name: line.name,
        targetGrossMarginPct: line.targetGrossMarginPct
      };
    });
    result.periods = periods.map(function (period) {
      return { id: period.id, label: period.label, index: period.index };
    });

    if (!lines.length || !periods.length) {
      return result;
    }

    var overallRev = 0;
    var overallCogs = 0;
    var cells = {};
    var byLineMap = {};

    lines.forEach(function (line) {
      cells[line.id] = {};
      byLineMap[line.id] = {
        lineId: line.id,
        name: line.name,
        targetGrossMarginPct: line.targetGrossMarginPct,
        revenue: 0,
        cogs: 0,
        marginDollars: 0,
        marginPct: null,
        vsTarget: null,
        monthly: []
      };
    });

    var monthly = periods.map(function (period, index) {
      var monthRev = 0;
      var monthCogs = 0;

      lines.forEach(function (line) {
        var raw = period.cells[line.id];
        var metrics = cellMetrics(raw);
        cells[line.id][period.id] = metrics;

        monthRev += metrics.revenue;
        monthCogs += metrics.cogs;

        var lineAcc = byLineMap[line.id];
        lineAcc.revenue += metrics.revenue;
        lineAcc.cogs += metrics.cogs;
        lineAcc.monthly.push({
          periodId: period.id,
          label: period.label,
          revenue: metrics.revenue,
          cogs: metrics.cogs,
          marginDollars: metrics.marginDollars,
          marginPct: metrics.marginPct,
          vsTarget: vsTarget(metrics.marginPct, line.targetGrossMarginPct),
          momPctDelta: null,
          momDollarsDelta: null
        });
      });

      monthRev = roundMoney(monthRev);
      monthCogs = roundMoney(monthCogs);
      overallRev += monthRev;
      overallCogs += monthCogs;

      var monthPct = grossMarginPct(monthRev, monthCogs);
      var monthDollars = grossMarginDollars(monthRev, monthCogs);

      return {
        periodId: period.id,
        label: period.label,
        index: index,
        revenue: monthRev,
        cogs: monthCogs,
        marginDollars: monthDollars,
        marginPct: monthPct,
        vsTarget: vsTarget(monthPct, companyTarget),
        momPctDelta: null,
        momDollarsDelta: null
      };
    });

    // Month-over-month on company totals
    for (var m = 1; m < monthly.length; m++) {
      var prev = monthly[m - 1];
      var cur = monthly[m];
      cur.momDollarsDelta = roundMoney(cur.marginDollars - prev.marginDollars);
      if (cur.marginPct === null || prev.marginPct === null) {
        cur.momPctDelta = null;
      } else {
        cur.momPctDelta = cur.marginPct - prev.marginPct;
      }
    }

    // Month-over-month per product line
    lines.forEach(function (line) {
      var series = byLineMap[line.id].monthly;
      for (var i = 1; i < series.length; i++) {
        series[i].momDollarsDelta = roundMoney(
          series[i].marginDollars - series[i - 1].marginDollars
        );
        if (series[i].marginPct === null || series[i - 1].marginPct === null) {
          series[i].momPctDelta = null;
        } else {
          series[i].momPctDelta = series[i].marginPct - series[i - 1].marginPct;
        }
      }
    });

    var byLine = lines.map(function (line) {
      var acc = byLineMap[line.id];
      acc.revenue = roundMoney(acc.revenue);
      acc.cogs = roundMoney(acc.cogs);
      acc.marginDollars = grossMarginDollars(acc.revenue, acc.cogs);
      acc.marginPct = grossMarginPct(acc.revenue, acc.cogs);
      acc.vsTarget = vsTarget(acc.marginPct, acc.targetGrossMarginPct);
      return acc;
    });

    overallRev = roundMoney(overallRev);
    overallCogs = roundMoney(overallCogs);
    var overallPct = grossMarginPct(overallRev, overallCogs);
    var overallDollars = grossMarginDollars(overallRev, overallCogs);

    var linePick = pickBestWorst(byLine, "lineId", "name");
    var monthPick = pickBestWorst(
      monthly.map(function (row) {
        return {
          periodId: row.periodId,
          label: row.label,
          marginPct: row.marginPct,
          marginDollars: row.marginDollars,
          revenue: row.revenue
        };
      }),
      "periodId",
      "label"
    );

    result.cells = cells;
    result.monthly = monthly;
    result.byLine = byLine;
    result.overall = {
      revenue: overallRev,
      cogs: overallCogs,
      marginDollars: overallDollars,
      marginPct: overallPct,
      vsTarget: vsTarget(overallPct, companyTarget)
    };
    result.bestLine = linePick.best;
    result.worstLine = linePick.worst;
    result.bestMonth = monthPick.best;
    result.worstMonth = monthPick.worst;
    return result;
  }

  function formatPct(pct, digits) {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
    var d = digits === undefined ? 1 : digits;
    return (pct * 100).toFixed(d) + "%";
  }

  function formatSignedPct(pct, digits) {
    if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
    var d = digits === undefined ? 1 : digits;
    var value = pct * 100;
    var sign = value > 0 ? "+" : "";
    return sign + value.toFixed(d) + " pp";
  }

  function formatMoney(n, currency) {
    if (n === null || n === undefined || !Number.isFinite(n)) return "—";
    var cur = currency || "USD";
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: cur,
        maximumFractionDigits: 0
      }).format(Math.round(n));
    } catch (err) {
      return Math.round(n).toString();
    }
  }

  function formatSignedMoney(n, currency) {
    if (n === null || n === undefined || !Number.isFinite(n)) return "—";
    var abs = formatMoney(Math.abs(n), currency);
    if (n > 0) return "+" + abs;
    if (n < 0) return "-" + abs;
    return abs;
  }

  function statusVsTarget(marginPct, target) {
    var delta = vsTarget(marginPct, target);
    if (delta === null) return "na";
    if (delta >= 0) return "above";
    if (delta >= -0.03) return "near";
    return "below";
  }

  return {
    toNumber: toNumber,
    grossMarginDollars: grossMarginDollars,
    grossMarginPct: grossMarginPct,
    cellMetrics: cellMetrics,
    vsTarget: vsTarget,
    analyze: analyze,
    formatPct: formatPct,
    formatSignedPct: formatSignedPct,
    formatMoney: formatMoney,
    formatSignedMoney: formatSignedMoney,
    statusVsTarget: statusVsTarget
  };
});
