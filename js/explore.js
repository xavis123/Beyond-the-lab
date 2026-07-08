// ===== explore.js: Explore mode control handlers =====

function initExploreControls() {
  // Year slider (drag across 2018 / 2020 / 2022)
  d3.select("#sl-year").on("input", function() {
    var year = parseInt(this.value, 10);
    d3.select("#year-val").text(year);
    state.selectedYear = year;
    dispatch.call("yearChanged", null, year);
  });

  // Map metric selector
  d3.select("#sel-metric").on("change", function() {
    var metric = this.value;
    state.mapMetric = metric;
    dispatch.call("metricChanged", null, metric);
  });

  // Network threshold slider
  d3.select("#sl-threshold").on("input", function() {
    var val = parseInt(this.value, 10);
    d3.select("#threshold-val").text(val);
    state.networkThreshold = val;
    dispatch.call("thresholdChanged", null, val);
  });

  // Country multi-select filter (replaces the old text search)
  buildCountryFilter();

  // Key-takeaways bar-race year slider
  d3.select("#sl-hub-year").on("input", function() {
    var yr = parseInt(this.value, 10);
    d3.select("#hub-year-val").text(yr);
    state.hubYear = yr;
    if (typeof hubRaceUpdate === "function") hubRaceUpdate(yr, true);
  });

  // Map zoom buttons (explore only)
  d3.select("#map-zoom-in").on("click", function(event) { event.stopPropagation(); mapZoomBy(1.5); });
  d3.select("#map-zoom-out").on("click", function(event) { event.stopPropagation(); mapZoomBy(1 / 1.5); });

  // Network show/hide toggle
  d3.select("#btn-network-toggle").on("click", function() {
    state.networkVisible = !state.networkVisible;
    if (state.networkVisible) {
      drawMapNetworkLines(window.appData.links, window.appData.nodes, state.selectedYear);
      d3.select(this).text("Hide network").classed("toggle-off", false);
    } else {
      clearMapNetwork();
      d3.select(this).text("Show network").classed("toggle-off", true);
    }
  });

  // Reset button
  d3.select("#btn-reset").on("click", function() {
    // Reset state
    state.selectedCountry = null;
    state.selectedYear = 2022;
    state.mapMetric = "adoption";
    state.networkThreshold = 0;
    state.networkVisible = true;
    d3.select("#btn-network-toggle").text("Hide network").classed("toggle-off", false);

    // Reset controls
    d3.select("#sl-year").property("value", 2022);
    d3.select("#year-val").text("2022");
    d3.select("#sel-metric").property("value", "adoption");
    d3.select("#sl-threshold").property("value", 0);
    d3.select("#threshold-val").text("0");
    state.countryFilter = null;
    d3.selectAll("#ms-list .ms-country").property("checked", true);
    d3.select("#ms-select-all").property("checked", true);
    d3.select("#country-filter-btn").text("All countries");
    d3.select("#country-filter-menu").classed("hidden", true);

    // Dispatch resets
    dispatch.call("countryDeselected");
    dispatch.call("yearChanged", null, 2022);
    dispatch.call("metricChanged", null, "adoption");
    dispatch.call("thresholdChanged", null, 0);
    if (state.mode === "explore") {
      drawMapNetworkLines(window.appData.links, window.appData.nodes, state.selectedYear);
    }
  });
}

// ===== Country multi-select filter =====
function buildCountryFilter() {
  if (!window.appData || !window.appData.nodes) return;
  var nodes = window.appData.nodes.slice().sort(function(a, b) {
    return a.country_name.localeCompare(b.country_name);
  });

  var list = d3.select("#ms-list");
  list.selectAll("*").remove();
  nodes.forEach(function(n) {
    var lab = list.append("label").attr("class", "ms-item");
    lab.append("input").attr("type", "checkbox").attr("class", "ms-country")
      .attr("value", n.geo).property("checked", true);
    lab.append("span").text(n.country_name);
  });
  list.selectAll(".ms-country").on("change", applyCountryFilter);

  d3.select("#ms-select-all").on("change", function() {
    var on = this.checked;
    list.selectAll(".ms-country").property("checked", on);
    applyCountryFilter();
  });

  // open/close the dropdown
  d3.select("#country-filter-btn").on("click", function(event) {
    event.stopPropagation();
    var menu = d3.select("#country-filter-menu");
    var nowHidden = !menu.classed("hidden");
    menu.classed("hidden", nowHidden);
    d3.select(this).attr("aria-expanded", String(!nowHidden));
  });
  d3.select("#country-filter-menu").on("click", function(event) { event.stopPropagation(); });
  d3.select("body").on("click.msfilter", function() {
    d3.select("#country-filter-menu").classed("hidden", true);
    d3.select("#country-filter-btn").attr("aria-expanded", "false");
  });
}

function applyCountryFilter() {
  var boxes = d3.selectAll("#ms-list .ms-country").nodes();
  var checked = boxes.filter(function(c) { return c.checked; }).map(function(c) { return c.value; });

  d3.select("#ms-select-all").property("checked", checked.length === boxes.length && boxes.length > 0);

  var btn = d3.select("#country-filter-btn");
  if (checked.length === boxes.length) btn.text("All countries");
  else if (checked.length === 0) btn.text("None selected");
  else btn.text(checked.length + " selected");

  // null = no filter (show all); otherwise a Set of the chosen geos
  state.countryFilter = (checked.length === boxes.length) ? null : new Set(checked);

  if (state.networkVisible && (state.mode === "explore" || state.mode === "network")) {
    drawMapNetworkLines(window.appData.links, window.appData.nodes, state.selectedYear);
  }
}
