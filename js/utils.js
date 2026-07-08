// ===== utils.js: Global state, dispatch, constants, helpers =====

// --- ISO 3166-1 numeric to Eurostat geo code mapping ---
const NUM_TO_GEO = {
  "8":"AL","40":"AT","56":"BE","70":"BA","100":"BG","191":"HR","196":"CY",
  "203":"CZ","208":"DK","233":"EE","246":"FI","250":"FR","276":"DE","300":"EL",
  "348":"HU","372":"IE","380":"IT","428":"LV","440":"LT","442":"LU","470":"MT",
  "499":"ME","528":"NL","807":"MK","578":"NO","616":"PL","620":"PT","642":"RO",
  "688":"RS","703":"SK","705":"SI","724":"ES","752":"SE","792":"TR","826":"UK",
  "756":"CH"
};

// --- Global application state ---
const state = {
  currentStep: 0,
  selectedCountry: null,
  selectedYear: 2022,
  mapMetric: "adoption",
  networkThreshold: 0,
  mode: "story",
  networkVisible: true,
  displayedMetric: "adoption",
  countryFilter: null,  // null = all; otherwise a Set of geos shown in the network
  hubYear: 2022,        // year shown by the Key-takeaways bar-race chart
  showLabels: true,     // show 2-letter country codes on the map
  displayedYear: 2022
};

// --- D3 dispatch for linked views ---
const dispatch = d3.dispatch(
  "countrySelected",
  "countryDeselected",
  "yearChanged",
  "metricChanged",
  "stepChanged",
  "thresholdChanged"
);

// --- Empty state messages ---
const EMPTY_MESSAGES = {
  noData: "No valid robot adoption value is available for this country and year.",
  noOverlap: "This country is outside the ETO-Eurostat overlap subset.",
  noLinks: "No collaboration links meet the current threshold.",
  selectCountry: "Select a country on the map or network to view details."
};

// --- Colour scales ---
const COLOURS = {
  // Each information type owns ONE distinct hue family, used consistently
  // across map ramps, chart marks and legends:
  //   Adoption = cyan/blue | Industrial = green | Service = amber
  //   Hub strength = orange | Change = red<->blue diverging | Network = purple/magenta
  increase: "#5b6fe0",     // Change: positive (indigo, matches change ramp high)
  decrease: "#ff6f5e",     // Change: negative (warm red, matches change ramp low)
  neutral: "#8a93a8",
  missing: "#2f3850",
  industrial: "#2fd39a",   // Industrial robots = green
  service: "#ffc83e",      // Service robots = amber
  selected: "#dd54b6",     // Selection highlight (magenta)
  linkDefault: "#5b6680",
  linkHighlight: "#dd54b6",
  adoptionLow: "#21436b",
  adoptionHigh: "#5fe0ff",
  hubLow: "#5e3a1e",
  hubHigh: "#ff9a3c"
};

// Bright-on-dark colour scales (interpolators for d3.scaleSequential / scaleDiverging)
const SCALES = {
  adopt:      function(t) { return d3.interpolateRgb("#21436b", "#5fe0ff")(t); },  // Adoption: cyan/blue
  industrial: function(t) { return d3.interpolateRgb("#0f4a2a", "#5fe6a3")(t); },  // Industrial robots: green
  service:    function(t) { return d3.interpolateRgb("#4d3a12", "#ffd24a")(t); },  // Service robots: amber
  hub:        function(t) { return d3.interpolateRgb("#5e3a1e", "#ff9a3c")(t); },  // Hub strength: orange
  node:       function(t) { return d3.interpolateRgb("#2b6fa8", "#6fe8ff")(t); },  // Node colour = adoption (cyan, brighter for dark bg)
  change:     d3.interpolateRgbBasis(["#ff6f5e", "#b9c2d4", "#5b6fe0"]),           // Change: red <-> grey <-> indigo (diverging)
  sectorHeat: d3.interpolateRgbBasis(["#16407a", "#2fd0ea", "#ff5db1"])            // Sector heatmap: deep blue -> cyan -> pink (multi-hue for contrast)
};

// --- Format helpers ---
function fmtPct(v) {
  if (v == null || v === "" || isNaN(v)) return "N/A";
  return d3.format(".1f")(v) + "%";
}

function fmtNum(v) {
  if (v == null || v === "" || isNaN(v)) return "N/A";
  return d3.format(",")(Math.round(v));
}

function fmtChange(v) {
  if (v == null || v === "" || isNaN(v)) return "N/A";
  var sign = v > 0 ? "+" : "";
  return sign + d3.format(".1f")(v) + " pp";
}

// --- Tooltip helpers ---
const tooltip = d3.select("#tooltip");

function showTooltip(html, event) {
  tooltip
    .classed("hidden", false)
    .html(html);
  var ttNode = tooltip.node();
  var ttW = ttNode.offsetWidth;
  var ttH = ttNode.offsetHeight;
  var x = event.clientX + 12;
  var y = event.clientY - ttH - 8;
  if (x + ttW > window.innerWidth - 10) x = event.clientX - ttW - 12;
  if (y < 10) y = event.clientY + 16;
  tooltip.style("left", x + "px").style("top", y + "px");
}

function hideTooltip() {
  tooltip.classed("hidden", true);
}

// --- Country data lookup ---
function getCountryData(geo) {
  if (!window.appData || !window.appData.countries) return null;
  return window.appData.countries.find(function(d) { return d.geo === geo; });
}

function getAdoptionValue(countryData, year) {
  if (!countryData) return null;
  var key = "adoption_" + year;
  return countryData[key];
}

// --- Detail panel update ---
function updateDetailPanel(geo) {
  var panel = d3.select("#detail-panel");
  var titleEl = d3.select("#detail-country");
  var gridEl = d3.select("#detail-grid");

  if (!geo) {
    titleEl.text(EMPTY_MESSAGES.selectCountry);
    gridEl.html("");
    return;
  }

  var d = getCountryData(geo);
  if (!d) {
    titleEl.text("No data available for this country.");
    gridEl.html("");
    return;
  }

  titleEl.text(d.country_name + (d.flag_note ? " *" : ""));

  var items = [
    { label: "Adoption " + state.selectedYear, value: fmtPct(getAdoptionValue(d, state.selectedYear)) },
    { label: "Change 2018-22", value: fmtChange(d.change_18_22) },
    { label: "Industrial " + state.selectedYear, value: fmtPct(d["industrial_" + state.selectedYear]) },
    { label: "Service " + state.selectedYear, value: fmtPct(d["service_" + state.selectedYear]) },
    { label: "Hub strength " + state.selectedYear, value: d.overlap_q3 ? fmtNum(d["hub_" + state.selectedYear]) : "N/A" },
    { label: "Degree " + state.selectedYear, value: d.overlap_q3 ? fmtNum(d["degree_" + state.selectedYear]) : "N/A" }
  ];

  gridEl.html("");
  items.forEach(function(item) {
    var div = gridEl.append("div").attr("class", "detail-item");
    div.append("span").attr("class", "detail-label").text(item.label);
    div.append("span").attr("class", "detail-value").text(item.value);
  });

  if (d.flag_note) {
    gridEl.append("div")
      .attr("class", "detail-item")
      .style("grid-column", "1 / -1")
      .style("font-size", "14px")
      .style("color", "#6c757d")
      .text("* " + d.flag_note);
  }
}

function clearDetailPanel() {
  d3.select("#detail-country").text(EMPTY_MESSAGES.selectCountry);
  d3.select("#detail-grid").html("");
}

// Full country name for display. Abbreviations keep the geo code; only full-name
// contexts are expanded. CH is hardcoded to "Switzerland".
function countryFullName(geo, name) {
  if (geo === "CH") return "Switzerland";
  return name || geo;
}
