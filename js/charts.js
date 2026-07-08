// ===== charts.js: All chart drawing functions =====

var chartSvg, chartWidth, chartHeight;
var currentChart = null;

function getChartDimensions() {
  var container = d3.select("#chart-container");
  var w = container.node().getBoundingClientRect().width || 650;
  var containerH = container.node().getBoundingClientRect().height;
  // Use container height if available (minimap mode gives more space), else fallback
  var h = containerH > 100 ? Math.min(containerH - 4, w * 0.85) : Math.min(w * 0.7, 500);
  return { width: w, height: h };
}

function initChartSvg() {
  var dims = getChartDimensions();
  chartWidth = dims.width;
  chartHeight = dims.height;
  chartSvg = d3.select("#chart-svg")
    .attr("viewBox", "0 0 " + chartWidth + " " + chartHeight)
    .attr("preserveAspectRatio", "xMidYMid meet");
  chartSvg.selectAll("*").remove();
}

// ===== 1. DIVERGING BAR CHART (Step 1: adoption change 2018-2022) =====
function drawDivergingBar(data) {
  initChartSvg();
  currentChart = "diverging";

  var margin = { top: 30, right: 30, bottom: 44, left: 90 };
  var w = chartWidth - margin.left - margin.right;
  var h = chartHeight - margin.top - margin.bottom;

  var g = chartSvg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  // Sort by change
  var sorted = data.slice().sort(function(a, b) { return b.change_18_22 - a.change_18_22; });

  var y = d3.scaleBand().domain(sorted.map(function(d) { return d.geo; })).range([0, h]).padding(0.25);
  var maxAbs = d3.max(sorted, function(d) { return Math.abs(d.change_18_22); }) || 3;
  var x = d3.scaleLinear().domain([-maxAbs * 1.1, maxAbs * 1.1]).range([0, w]);
  // Faint vertical gridlines (one per x-axis unit)
  g.append("g").attr("class", "grid")
    .attr("transform", "translate(0," + h + ")")
    .call(d3.axisBottom(x).ticks(5).tickSize(-h).tickFormat(""));
  g.selectAll(".grid .tick line").attr("stroke", "#313c54");
  g.selectAll(".grid .domain").remove();


  // Zero line
  g.append("line")
    .attr("x1", x(0)).attr("x2", x(0))
    .attr("y1", 0).attr("y2", h)
    .attr("stroke", "#5b6680").attr("stroke-dasharray", "3,3");

  // Bars
  g.selectAll(".bar")
    .data(sorted)
    .join("rect")
    .attr("class", "bar")
    .attr("y", function(d) { return y(d.geo); })
    .attr("height", y.bandwidth())
    .attr("x", function(d) { return d.change_18_22 >= 0 ? x(0) : x(d.change_18_22); })
    .attr("width", function(d) { return Math.abs(x(d.change_18_22) - x(0)); })
    .attr("fill", function(d) { return d.change_18_22 >= 0 ? COLOURS.increase : COLOURS.decrease; })
    .attr("rx", 2)
    .attr("cursor", "pointer")
    .on("mouseover", function(event, d) {
      showTooltip("<strong>" + d.country_name + "</strong><br>Change: " + fmtChange(d.change_18_22) +
        "<br>2018: " + fmtPct(d.adoption_2018) + "<br>2022: " + fmtPct(d.adoption_2022), event);
    })
    .on("mouseout", hideTooltip)
    .on("click", function(event, d) { if (state.selectedCountry === d.geo) { dispatch.call("countryDeselected"); } else { dispatch.call("countrySelected", null, d.geo); } });

  // Y axis (country labels)
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();

  // X axis
  g.append("g").attr("class", "axis")
    .attr("transform", "translate(0," + h + ")")
    .call(d3.axisBottom(x).ticks(5).tickFormat(function(d) { return (d > 0 ? "+" : "") + d3.format(".1f")(d); }));

  // Title
  chartSvg.append("text").attr("class", "chart-title")
    .attr("x", margin.left).attr("y", 16)
    .text("Change in robot adoption 2018-2022 (percentage points)");

  // Legend
  var leg = chartSvg.append("g").attr("transform", "translate(" + (margin.left) + "," + (chartHeight - 10) + ")");
  leg.append("rect").attr("width", 12).attr("height", 12).attr("y", -10).attr("fill", COLOURS.increase).attr("rx", 2);
  leg.append("text").attr("x", 16).attr("y", 0).attr("font-size", 15).attr("fill", "#9aa6be").text("Increase");
  leg.append("rect").attr("x", 95).attr("width", 12).attr("height", 12).attr("y", -10).attr("fill", COLOURS.decrease).attr("rx", 2);
  leg.append("text").attr("x", 111).attr("y", 0).attr("font-size", 15).attr("fill", "#9aa6be").text("Decrease");
}

// ===== 2. DUMBBELL CHART (Step 2: industrial vs service 2022) =====
function drawRobotTypeDumbbell(data) {
  initChartSvg();
  currentChart = "dumbbell";

  var margin = { top: 30, right: 40, bottom: 44, left: 90 };
  var w = chartWidth - margin.left - margin.right;
  var h = chartHeight - margin.top - margin.bottom;

  var g = chartSvg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  // Filter valid, sort by industrial; then move Montenegro (ME) to the middle so it is visible
  var valid = data.filter(function(d) { return d.industrial_2022 != null && d.service_2022 != null; });
  valid.sort(function(a, b) { return b.industrial_2022 - a.industrial_2022; });
  var meIdx = valid.findIndex(function(d) { return d.geo === "ME"; });
  if (meIdx !== -1) {
    var me = valid.splice(meIdx, 1)[0];
    valid.splice(Math.floor(valid.length / 2), 0, me);
  }

  var y = d3.scaleBand().domain(valid.map(function(d) { return d.geo; })).range([0, h]).padding(0.3);
  var xMax = d3.max(valid, function(d) { return Math.max(d.industrial_2022, d.service_2022); }) || 15;
  var xStep = 2;
  var xDomainMax = Math.ceil(xMax / xStep) * xStep;
  if (xDomainMax <= xMax) xDomainMax += xStep;        // keep a labelled tick above the largest value
  var x = d3.scaleLinear().domain([0, xDomainMax]).range([0, w]);
  var xTicks = d3.range(0, xDomainMax + 1e-6, xStep);
  // Faint vertical gridlines (one per x-axis unit)
  g.append("g").attr("class", "grid")
    .attr("transform", "translate(0," + h + ")")
    .call(d3.axisBottom(x).tickValues(xTicks).tickSize(-h).tickFormat(""));
  g.selectAll(".grid .tick line").attr("stroke", "#313c54");
  g.selectAll(".grid .domain").remove();


  // Connecting lines
  g.selectAll(".dumbbell-line")
    .data(valid)
    .join("line")
    .attr("class", "dumbbell-line")
    .attr("y1", function(d) { return y(d.geo) + y.bandwidth() / 2; })
    .attr("y2", function(d) { return y(d.geo) + y.bandwidth() / 2; })
    .attr("x1", function(d) { return x(Math.min(d.industrial_2022, d.service_2022)); })
    .attr("x2", function(d) { return x(Math.max(d.industrial_2022, d.service_2022)); })
    .attr("stroke", "#5b6680").attr("stroke-width", 1.5);

  // Industrial dots
  g.selectAll(".dot-ind")
    .data(valid)
    .join("circle")
    .attr("class", "dot-ind")
    .attr("cy", function(d) { return y(d.geo) + y.bandwidth() / 2; })
    .attr("cx", function(d) { return x(d.industrial_2022); })
    .attr("r", 5)
    .attr("fill", COLOURS.industrial)
    .attr("cursor", "pointer")
    .on("mouseover", function(event, d) {
      showTooltip("<strong>" + d.country_name + "</strong><br>Industrial: " + fmtPct(d.industrial_2022) +
        "<br>Service: " + fmtPct(d.service_2022), event);
    })
    .on("mouseout", hideTooltip)
    .on("click", function(event, d) { if (state.selectedCountry === d.geo) { dispatch.call("countryDeselected"); } else { dispatch.call("countrySelected", null, d.geo); } });

  // Service dots
  g.selectAll(".dot-svc")
    .data(valid)
    .join("circle")
    .attr("class", "dot-svc")
    .attr("cy", function(d) { return y(d.geo) + y.bandwidth() / 2; })
    .attr("cx", function(d) { return x(d.service_2022); })
    .attr("r", 5)
    .attr("fill", COLOURS.service)
    .attr("cursor", "pointer")
    .on("mouseover", function(event, d) {
      showTooltip("<strong>" + d.country_name + "</strong><br>Industrial: " + fmtPct(d.industrial_2022) +
        "<br>Service: " + fmtPct(d.service_2022), event);
    })
    .on("mouseout", hideTooltip)
    .on("click", function(event, d) { if (state.selectedCountry === d.geo) { dispatch.call("countryDeselected"); } else { dispatch.call("countrySelected", null, d.geo); } });

  // Axes
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
  g.append("g").attr("class", "axis").attr("transform", "translate(0," + h + ")")
    .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(function(d) { return d + "%"; }));

  // Title
  chartSvg.append("text").attr("class", "chart-title")
    .attr("x", margin.left).attr("y", 16)
    .text("Industrial vs Service robot adoption 2022 (% enterprises)");

  // Legend
  var leg = chartSvg.append("g").attr("transform", "translate(" + (margin.left) + "," + (chartHeight - 10) + ")");
  leg.append("circle").attr("cx", 6).attr("cy", -4).attr("r", 6).attr("fill", COLOURS.industrial);
  leg.append("text").attr("x", 16).attr("y", 0).attr("font-size", 15).attr("fill", "#9aa6be").text("Industrial");
  leg.append("circle").attr("cx", 106).attr("cy", -4).attr("r", 6).attr("fill", COLOURS.service);
  leg.append("text").attr("x", 116).attr("y", 0).attr("font-size", 15).attr("fill", "#9aa6be").text("Service");
}

// ===== 3. VERTICAL DOT PLOT (Step 3: size class adoption) =====
function drawSizeDotPlot(data, selectedGeo) {
  initChartSvg();
  currentChart = "sizebar";

  var margin = { top: 50, right: 24, bottom: 40, left: 55 };
  var w = chartWidth - margin.left - margin.right;
  var h = chartHeight - margin.top - margin.bottom;
  var g = chartSvg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  // Full labels (with units) on the x-axis per DEP feedback
  var sizeOrder = ["Small (10-49 employees)", "Medium (50-249 employees)", "Large (250+ employees)"];
  var AGG = { EU27_2020: 1, EU27_2007: 1, EU28: 1, EU15: 1, EA: 1, EA19: 1, EA20: 1 };

  var nameByGeo = {};
  data.forEach(function(d) { nameByGeo[d.geo] = d.country_name; });

  function stats(fullLabel) {
    var vals = data.filter(function(d) { return d.year === 2022 && d.size_label === fullLabel && !AGG[d.geo] && d.value != null && !isNaN(d.value); }).map(function(d) { return d.value; });
    var eu = data.find(function(d) { return d.year === 2022 && d.size_label === fullLabel && d.geo === "EU27_2020"; });
    return { min: d3.min(vals), max: d3.max(vals), eu: eu ? eu.value : null };
  }
  function countryVal(geo, fullLabel) {
    var r = data.find(function(d) { return d.year === 2022 && d.geo === geo && d.size_label === fullLabel; });
    return r ? r.value : null;
  }

  var euColour = "#aeb6c8", cyColour = "#43cfef";
  var series = selectedGeo
    ? [{ key: selectedGeo, name: countryFullName(selectedGeo, nameByGeo[selectedGeo]), colour: cyColour },
       { key: "EU27_2020", name: "EU27 average", colour: euColour }]
    : [{ key: "EU27_2020", name: "EU27 average", colour: euColour }];

  var x0 = d3.scaleBand().domain(sizeOrder).range([0, w]).padding(0.28);
  var x1 = d3.scaleBand().domain(series.map(function(d) { return d.key; })).range([0, x0.bandwidth()]).padding(0.18);
  var y = d3.scaleLinear().domain([0, 45]).range([h, 0]);

  g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickValues([0,10,20,30,40,45]).tickSize(-w).tickFormat("")).select(".domain").remove();
  g.selectAll(".tick line").attr("stroke", "#39425a");

  // European range band: grounded at 0% (0 -> max) with a faint min marker line
  sizeOrder.forEach(function(fullLabel) {
    var st = stats(fullLabel);
    if (st.max == null) return;
    g.append("rect").attr("x", x0(fullLabel)).attr("width", x0.bandwidth())
      .attr("y", y(st.max)).attr("height", h - y(st.max))
      .attr("fill", "#5b6680").attr("fill-opacity", 0.16).attr("rx", 2)
      .on("mouseover", function(event) { showTooltip("<strong>" + fullLabel + "</strong><br>Highest in Europe: " + fmtPct(st.max), event); })
      .on("mouseout", hideTooltip);
  });

  // grouped bars
  sizeOrder.forEach(function(fullLabel) {
    var st = stats(fullLabel);
    series.forEach(function(se) {
      var v = se.key === "EU27_2020" ? st.eu : countryVal(se.key, fullLabel);
      if (v == null || isNaN(v)) return;
      var bx = x0(fullLabel) + x1(se.key), bw = x1.bandwidth();
      var bar = g.append("rect").attr("x", bx).attr("width", bw).attr("rx", 2)
        .attr("fill", se.colour).attr("y", h).attr("height", 0)
        .on("mouseover", function(event) { showTooltip("<strong>" + se.name + "</strong><br>" + fullLabel + "<br>Adoption: " + fmtPct(v), event); })
        .on("mouseout", hideTooltip);
      bar.transition().duration(550).attr("y", y(v)).attr("height", h - y(v));
      g.append("text").attr("x", bx + bw / 2).attr("y", y(v) - 5).attr("text-anchor", "middle")
        .attr("font-size", 12).attr("font-weight", 600).attr("fill", "#cdd5e3").attr("opacity", 0)
        .text(fmtPct(v)).transition().delay(280).duration(300).attr("opacity", 1);
    });
  });

  g.append("g").attr("class", "axis").attr("transform", "translate(0," + h + ")").call(d3.axisBottom(x0).tickSize(0));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickValues([0,10,20,30,40,45]).tickFormat(function(d) { return d + "%"; }));

  // title + hint
  chartSvg.append("text").attr("class", "chart-title").attr("x", margin.left).attr("y", 22).style("font-size", "22px").text("Robot adoption by enterprise size, 2022");
  chartSvg.append("text").attr("x", margin.left).attr("y", 40).attr("font-size", 14).attr("fill", "#9aa6be")
    .text(selectedGeo ? (series[0].name + " compared with the EU27 average") : "Select a country on the map to compare it against the EU27 average");

  // compact legend INSIDE the plot, upper-left near the 40% level, two rows
  var lg = g.append("g").attr("transform", "translate(8," + Math.round(y(38)) + ")");
  var lx = 0;
  series.forEach(function(se) {
    lg.append("rect").attr("x", lx).attr("y", -10).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", se.colour);
    lg.append("text").attr("x", lx + 17).attr("y", 0).attr("font-size", 13).attr("fill", "#9aa6be").text(se.name);
    lx += se.name.length * 7.4 + 32;
  });
  lg.append("rect").attr("x", 0).attr("y", 8).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", "#5b6680").attr("fill-opacity", 0.5);
  lg.append("text").attr("x", 17).attr("y", 18).attr("font-size", 13).attr("fill", "#9aa6be").text("Highest in Europe");
}

// ===== 4. SECTOR HEATMAP (Step 4: sector x year, 2018-2022) =====
// Default = cross-country mean per (sector, year); selecting a country shows that
// country's values. The colour legend sits in the upper-right; the (smaller)
// minimap sits below it in the same right column. Grid fills the rest.
function drawSectorHeatmap(data, selectedGeo) {
  initChartSvg();
  currentChart = "sector";

  var margin = { top: 46, bottom: 30, left: 200 };
  var rightReserve = 140;                       // right column: legend (top) + minimap (below)
  var w = Math.min(chartWidth - margin.left - rightReserve, 860);
  w = Math.max(w, 260);
  var h = chartHeight - margin.top - margin.bottom;
  var g = chartSvg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var years = [2018, 2020, 2022];
  var withVal = data.filter(function(d) { return d.value != null && !isNaN(d.value); });

  var meanBy = d3.rollup(withVal, function(v) { return d3.mean(v, function(d) { return d.value; }); }, function(d) { return d.sector_label; });
  var sectors = Array.from(meanBy.keys()).sort(function(a, b) { return meanBy.get(a) - meanBy.get(b); });

  var disp = {};
  if (selectedGeo) {
    withVal.forEach(function(d) { if (d.geo === selectedGeo) disp[d.sector_label + "|" + d.year] = { value: d.value }; });
  } else {
    var mc = d3.rollup(withVal, function(v) { return { value: d3.mean(v, function(d) { return d.value; }), n: v.length }; },
      function(d) { return d.sector_label; }, function(d) { return d.year; });
    mc.forEach(function(byYear, sec) { byYear.forEach(function(o, yr) { disp[sec + "|" + yr] = o; }); });
  }

  var dvals = Object.keys(disp).map(function(k) { return disp[k].value; }).filter(function(v) { return v != null; });
  var maxV = 20;  // fixed scale max (%) so colour + legend are comparable across selections

  var cName = null;
  if (selectedGeo) { var row = data.find(function(d) { return d.geo === selectedGeo; }); cName = countryFullName(selectedGeo, row ? row.country_name : null); }

  var x = d3.scaleBand().domain(years).range([0, w]).padding(0.06);
  var y = d3.scaleBand().domain(sectors).range([0, h]).padding(0.08);
  var colour = d3.scaleSequentialSqrt(function(t) { return SCALES.sectorHeat(t); }).domain([0, maxV]);

  sectors.forEach(function(sec) {
    years.forEach(function(yr) {
      var o = disp[sec + "|" + yr];
      var cx = x(yr), cy = y(sec);
      if (!o || o.value == null) {
        g.append("rect").attr("x", cx).attr("y", cy).attr("width", x.bandwidth()).attr("height", y.bandwidth())
          .attr("rx", 3).attr("fill", COLOURS.missing).attr("fill-opacity", 0.5)
          .on("mouseover", function(event) { showTooltip("<strong>" + sec + " &middot; " + yr + "</strong><br>No data", event); })
          .on("mouseout", hideTooltip);
        g.append("text").attr("x", cx + x.bandwidth() / 2).attr("y", cy + y.bandwidth() / 2 + 4)
          .attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#6c7691").text("\u2013");
        return;
      }
      var fillCol = colour(o.value);
      var lightCell = d3.hsl(fillCol).l > 0.62;
      g.append("rect").attr("x", cx).attr("y", cy).attr("width", x.bandwidth()).attr("height", y.bandwidth())
        .attr("rx", 3).attr("fill", fillCol)
        .on("mouseover", function(event) {
          var extra = (o.n != null) ? ("<br>Cross-country mean &middot; " + o.n + " countries") : "";
          showTooltip("<strong>" + sec + " &middot; " + yr + "</strong><br>" + fmtPct(o.value) + extra, event);
        })
        .on("mouseout", hideTooltip);
      g.append("text").attr("x", cx + x.bandwidth() / 2).attr("y", cy + y.bandwidth() / 2 + 4)
        .attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", 600)
        .attr("fill", lightCell ? "#0c1a24" : "#eaf3f8").text(d3.format(".1f")(o.value));
    });
  });

  g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();
  g.append("g").attr("class", "axis").attr("transform", "translate(0," + h + ")")
    .call(d3.axisBottom(x).tickSize(0).tickFormat(d3.format("d"))).select(".domain").remove();

  // Vertical colour legend in the upper-right (above the minimap)
  var lgW = 14, lgH = Math.round(h * 0.65), lgX = chartWidth - 82, lgY = margin.top + 8;
  var defs = chartSvg.select("defs").empty() ? chartSvg.append("defs") : chartSvg.select("defs");
  defs.select("#sector-grad").remove();
  var grad = defs.append("linearGradient").attr("id", "sector-grad").attr("x1", "0").attr("y1", "1").attr("x2", "0").attr("y2", "0");
  d3.range(0, 1.001, 0.1).forEach(function(t) { grad.append("stop").attr("offset", (t * 100) + "%").attr("stop-color", colour(t * maxV)); });
  var lg = chartSvg.append("g").attr("transform", "translate(" + lgX + "," + lgY + ")");
  lg.append("text").attr("x", -2).attr("y", -18).attr("font-size", 13).attr("fill", "#b6c0d4").text(cName ? "Value (%)" : "Mean (%)");
  lg.append("rect").attr("width", lgW).attr("height", lgH).attr("fill", "url(#sector-grad)").attr("rx", 2);
  var lScale = d3.scaleLinear().domain([0, maxV]).range([lgH, 0]);
  lg.append("g").attr("class", "axis").attr("transform", "translate(" + lgW + ",0)")
    .call(d3.axisRight(lScale).tickValues([0, 5, 10, 15, 20]).tickSize(3).tickFormat(function(v) { return v + "%"; })).select(".domain").remove();

  // Title + subtitle
  chartSvg.append("text").attr("class", "chart-title").attr("x", 8).attr("y", 16).text("Robot adoption across sectors, 2018 to 2022");
  chartSvg.append("text").attr("x", 8).attr("y", 34).attr("font-size", 13).attr("fill", "#9aa6be")
    .text(cName ? (cName + " - click again to return to the European average") : "Cross-country mean for each sector-year cell");
}

// ===== 5. HUB vs ADOPTION DIVERGING (Step 6: Key takeaways, bar-race by year) =====
var hubRaceUpdate = null;  // global; called by the year slider
// Spearman rho is computed live from the data (see spearmanRho).
// The two-sided p-value needs a t-distribution CDF, so it is kept in this small
// precomputed lookup (from scipy.stats.spearmanr on the same n pairs).
var SPEARMAN_P = { 2018: 0.829, 2020: 0.852, 2022: 0.665 };

function spearmanRho(pairs) {
  var n = pairs.length;
  if (n < 3) return null;
  function ranks(vals) {
    var idx = vals.map(function(v, i) { return { v: v, i: i }; });
    idx.sort(function(a, b) { return a.v - b.v; });
    var r = new Array(n);
    for (var k = 0; k < n;) {
      var j = k;
      while (j + 1 < n && idx[j + 1].v === idx[k].v) j++;
      var avg = (k + j) / 2 + 1; // average rank (1-based) for ties
      for (var m = k; m <= j; m++) r[idx[m].i] = avg;
      k = j + 1;
    }
    return r;
  }
  var rx = ranks(pairs.map(function(d) { return d[0]; }));
  var ry = ranks(pairs.map(function(d) { return d[1]; }));
  var mx = d3.mean(rx), my = d3.mean(ry), sxy = 0, sx = 0, sy = 0;
  for (var i = 0; i < n; i++) { var dx = rx[i] - mx, dy = ry[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
  return (sx === 0 || sy === 0) ? null : sxy / Math.sqrt(sx * sy);
}

function spearmanLabel(rd) {
  var pairs = rd.filter(function(d) { return d.adopt != null && !isNaN(d.adopt) && d.hub != null && !isNaN(d.hub); })
    .map(function(d) { return [d.hub, d.adopt]; });
  var rho = spearmanRho(pairs);
  if (rho == null) return "";
  var yr = rd._year;
  var pTxt = SPEARMAN_P[yr] != null ? (", p = " + d3.format(".3f")(SPEARMAN_P[yr])) : "";
  return "rho = " + d3.format(".3f")(rho) + " (" + pTxt.replace(/^, /, "") + ", n = " + pairs.length + ")";
}

function drawHubAdoptionDiverging(nodes, countries, year) {
  initChartSvg();
  currentChart = "diverging-hub";
  year = year || 2022;

  var adoptByYear = {};
  (countries || []).forEach(function(c) { adoptByYear[c.geo] = { 2018: c.adoption_2018, 2020: c.adoption_2020, 2022: c.adoption_2022 }; });

  var margin = { top: 60, right: 24, bottom: 52, left: 24 };
  var w = chartWidth - margin.left - margin.right;
  var h = chartHeight - margin.top - margin.bottom;
  var g = chartSvg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var nameHalf = 82, centerX = w / 2, leftEnd = centerX - nameHalf, rightStart = centerX + nameHalf;
  var hubMax = 600, adMax = 12;
  var hubScale = d3.scaleLinear().domain([0, hubMax]).range([0, leftEnd - 8]);
  var adScale = d3.scaleLinear().domain([0, adMax]).range([0, (w - rightStart) - 8]);
  var hubTicks = [0, 200, 400, 600], adTicks = [0, 2, 4, 6, 8, 10, 12];
  var hubColour = "#ff9a3c", adColour = "#43cfef";
  var y = d3.scaleBand().range([0, h]).padding(0.3);

  hubTicks.forEach(function(t) { var gx = leftEnd - hubScale(t); g.append("line").attr("x1", gx).attr("x2", gx).attr("y1", 0).attr("y2", h).attr("stroke", "#313c54").attr("stroke-width", 1); });
  adTicks.forEach(function(t) { var gx = rightStart + adScale(t); g.append("line").attr("x1", gx).attr("x2", gx).attr("y1", 0).attr("y2", h).attr("stroke", "#313c54").attr("stroke-width", 1); });

  var rowsLayer = g.append("g").attr("class", "hub-rows");

  var lax = g.append("g").attr("transform", "translate(0," + (h + 4) + ")");
  hubTicks.forEach(function(t) { lax.append("text").attr("x", leftEnd - hubScale(t)).attr("y", 12).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#b6c0d4").text(fmtNum(t)); });
  adTicks.forEach(function(t) { lax.append("text").attr("x", rightStart + adScale(t)).attr("y", 12).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#b6c0d4").text(t + "%"); });

  chartSvg.append("text").attr("x", margin.left + leftEnd / 2).attr("y", chartHeight - 8).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#b6c0d4").text("← Hub strength (weighted degree)");
  chartSvg.append("text").attr("x", margin.left + rightStart + (w - rightStart) / 2).attr("y", chartHeight - 8).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#b6c0d4").text("Adoption (% enterprises) →");

  var titleEl = chartSvg.append("text").attr("class", "chart-title").attr("x", 8).attr("y", 18);
  var subEl = chartSvg.append("text").attr("x", 8).attr("y", 38).attr("font-size", 13).attr("fill", "#9aa6be");

  var lg = chartSvg.append("g").attr("transform", "translate(" + margin.left + "," + Math.round(chartHeight * 2 / 3) + ")");
  lg.append("rect").attr("width", 12).attr("height", 12).attr("fill", hubColour).attr("rx", 2);
  lg.append("text").attr("x", 18).attr("y", 11).attr("font-size", 13).attr("fill", "#b6c0d4").text("Research hub strength");
  lg.append("rect").attr("y", 18).attr("width", 12).attr("height", 12).attr("fill", adColour).attr("rx", 2);
  lg.append("text").attr("x", 18).attr("y", 29).attr("font-size", 13).attr("fill", "#b6c0d4").text("Enterprise adoption");

  function rowData(yr) {
    return nodes.map(function(n) {
      var a = (adoptByYear[n.geo] || {})[yr];
      a = (a == null || a === "" || isNaN(a)) ? null : +a;
      return { geo: n.geo, name: countryFullName(n.geo, n.country_name), hub: +n["hub_" + yr], adopt: a };
    }).sort(function(a, b) { return b.hub - a.hub; });
  }

  function update(yr, animate) {
    yr = yr || 2022;
    var rd = rowData(yr); rd._year = yr;
    y.domain(rd.map(function(d) { return d.geo; }));
    var bh = y.bandwidth(), dur = animate ? 850 : 0;
    titleEl.text("Leading research hubs are not the leading robot adopters, " + yr);
    subEl.text("Countries sorted by hub strength. Spearman " + spearmanLabel(rd));

    var sel = rowsLayer.selectAll(".hub-row").data(rd, function(d) { return d.geo; });
    sel.exit().remove();
    var en = sel.enter().append("g").attr("class", "hub-row").attr("transform", function(d) { return "translate(0," + y(d.geo) + ")"; });
    en.append("rect").attr("class", "hub-bar").attr("fill", hubColour).attr("rx", 2).attr("x", leftEnd).attr("width", 0).attr("height", bh);
    en.append("text").attr("class", "hub-val").attr("text-anchor", "end").attr("font-size", 13).attr("fill", "#b6c0d4");
    en.append("rect").attr("class", "adopt-bar").attr("fill", adColour).attr("rx", 2).attr("x", rightStart).attr("width", 0).attr("height", bh);
    en.append("text").attr("class", "adopt-val").attr("font-size", 13).attr("fill", "#b6c0d4");
    en.append("text").attr("class", "row-name").attr("x", centerX).attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", 600).attr("fill", "#f3f3f3");

    var m = en.merge(sel);
    m.select(".hub-bar").on("mouseover", function(event, d) { showTooltip("<strong>" + d.name + "</strong><br>Hub strength (" + yr + "): " + fmtNum(d.hub), event); }).on("mouseout", hideTooltip);
    m.select(".adopt-bar").on("mouseover", function(event, d) { showTooltip("<strong>" + d.name + "</strong><br>Adoption " + yr + ": " + (d.adopt == null ? "N/A" : fmtPct(d.adopt)), event); }).on("mouseout", hideTooltip);

    var T = function(sl) { return animate ? sl.transition().duration(dur) : sl; };
    T(m).attr("transform", function(d) { return "translate(0," + y(d.geo) + ")"; });
    T(m.select(".hub-bar")).attr("x", function(d) { return leftEnd - hubScale(d.hub); }).attr("width", function(d) { return hubScale(d.hub); }).attr("height", bh);
    T(m.select(".hub-val")).attr("x", function(d) { return leftEnd - hubScale(d.hub) - 6; }).attr("y", bh / 2 + 4);
    m.select(".hub-val").text(function(d) { return fmtNum(d.hub); });
    T(m.select(".adopt-bar")).attr("x", rightStart).attr("width", function(d) { return d.adopt == null ? 0 : adScale(d.adopt); }).attr("height", bh);
    T(m.select(".adopt-val")).attr("x", function(d) { return rightStart + (d.adopt == null ? 0 : adScale(d.adopt)) + 6; }).attr("y", bh / 2 + 4);
    m.select(".adopt-val").text(function(d) { return d.adopt == null ? "" : fmtPct(d.adopt); });
    T(m.select(".row-name")).attr("y", bh / 2 + 4);
    m.select(".row-name").text(function(d) { return d.name; });
  }

  hubRaceUpdate = update;
  update(year, false);
  d3.select("#sl-hub-year").property("value", year);
  d3.select("#hub-year-val").text(year);
}

// ===== Highlight helpers =====
function highlightChartCountry(geo) {
  if (!chartSvg) return;
  chartSvg.selectAll(".bar, .dot-ind, .dot-svc, .scatter-dot")
    .attr("opacity", function(d) { return d && d.geo === geo ? 1 : 0.25; });
}

function resetChartHighlight() {
  if (!chartSvg) return;
  chartSvg.selectAll(".bar, .dot-ind, .dot-svc, .scatter-dot")
    .attr("opacity", 1);
}

// ===== Update chart for current step with optional country selection =====
function updateChartForStep(stepNum, selectedGeo) {
  if (!window.appData) return;

  switch (stepNum) {
    case 0:
      // Show big numbers on step 0, no chart
      initChartSvg();
      chartSvg.append("text")
        .attr("x", chartWidth / 2).attr("y", chartHeight / 2)
        .attr("text-anchor", "middle").attr("font-size", 17).attr("fill", "#9aa6be")
        .text("Scroll down to explore the data story");
      break;
    case 1:
      drawDivergingBar(window.appData.adoptionChange);
      break;
    case 2:
      drawRobotTypeDumbbell(window.appData.robotType);
      break;
    case 3:
      drawSizeDotPlot(window.appData.sizeProfile, selectedGeo);
      break;
    case 4:
      drawSectorHeatmap(window.appData.sectorData, selectedGeo);
      break;
    case 5:
      break;
    case 6:
      drawHubAdoptionDiverging(window.appData.nodes, window.appData.countries, state.hubYear || 2022);
      break;
    case 7:
      // Explore mode - keep current chart
      break;
  }
}
