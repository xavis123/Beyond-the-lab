// ===== map.js: Europe SVG map with choropleth and network lines =====

var mapSvg, mapG, mapProjection, mapPath, mapCountries, mapWidth, mapHeight;
var mapNetworkLinesG, mapNodesG, mapZoomLayer, mapZoom, mapLabelsG, mapNodeGeos = null;
var MAP_BASE_ZOOM = 1.2;  // base zoom applied to every map; legends scale marks to match
// Round a data maximum up to a nice value so axes/legends always label a value at or above the max
function niceTop(v) { return d3.scaleLinear().domain([0, (v && v > 0) ? v : 1]).nice().domain()[1]; }
var mapSmallOpen = false;

// Fixed hub-strength size scale: SAME formula for every year so a given hub value
// always maps to the same radius (kept consistent between the map nodes and the legend).
var HUB_SIZE_SCALE = d3.scaleSqrt().domain([0, 600]).range([4.2, 19.6]);

// Tooltip text for a country path, matching the currently displayed map metric/year
function countryTooltipHtml(cd, name) {
  if (!cd) return "<strong>" + name + "</strong><br>No data";
  var m = state.displayedMetric || "adoption";
  var y = state.displayedYear || state.selectedYear;
  var line;
  if (m === "change") {
    line = "Change 2018-2022: " + fmtChange(cd.change_18_22);
  } else if (m === "industrial") {
    line = "Industrial " + y + ": " + fmtPct(cd["industrial_" + y]);
  } else if (m === "service") {
    line = "Service " + y + ": " + fmtPct(cd["service_" + y]);
  } else if (m === "hub") {
    line = "Hub strength " + y + ": " + (cd["hub_" + y] != null ? fmtNum(cd["hub_" + y]) + " articles" : "N/A");
  } else {
    line = "Adoption " + y + ": " + fmtPct(getAdoptionValue(cd, y));
  }
  return "<strong>" + name + "</strong><br>" + line;
}

function initMap(topoData, countries) {
  var container = d3.select("#map-container");
  mapWidth = container.node().getBoundingClientRect().width || 700;
  mapHeight = Math.min(mapWidth * 0.75, 500);

  mapSvg = d3.select("#map-svg")
    .attr("viewBox", "0 0 " + mapWidth + " " + mapHeight)
    .attr("preserveAspectRatio", "xMidYMid meet");

  mapSvg.selectAll("*").remove();

  // Background
  mapSvg.append("rect")
    .attr("width", mapWidth)
    .attr("height", mapHeight)
    .attr("fill", "none")
    .attr("rx", 4);

  // Map data is baked GeoJSON (no topojson dependency); filter to European countries
  var europeFeatures = topoData.features.filter(function(f) {
    return NUM_TO_GEO[f.id] !== undefined;
  });

  // Add geo code to each feature
  europeFeatures.forEach(function(f) {
    f.properties.geo = NUM_TO_GEO[f.id];
  });

  // Projection centered on Europe
  // Fit ALL European features into the viewBox so every country (incl. Cyprus, the
  // southern-most) is visible rather than clipped by a fixed scale.
  mapProjection = d3.geoMercator();
  mapPath = d3.geoPath().projection(mapProjection);
  // Fit to each country's largest (mainland) polygon so remote territories
  // (Svalbard, the Canaries, French Guiana, ...) do not blow up the framing,
  // while every mainland and Cyprus stay inside the viewBox.
  var mainlandFeatures = europeFeatures.map(function(f) {
    var geom = f.geometry;
    if (!geom || geom.type === "Polygon") return f;
    var best = null, bestA = -1;
    geom.coordinates.forEach(function(poly) {
      var a = d3.geoArea({ type: "Polygon", coordinates: poly });
      if (a > bestA) { bestA = a; best = poly; }
    });
    return { type: "Feature", properties: f.properties, geometry: { type: "Polygon", coordinates: best } };
  });
  mapProjection.fitExtent([[8, 6], [mapWidth - 8, mapHeight - 6]], { type: "FeatureCollection", features: mainlandFeatures });

  // Zoom/pan layer wrapping all geographic layers (legends stay outside, fixed)
  mapZoomLayer = mapSvg.append("g").attr("class", "map-zoom-layer");

  // Country paths (bottom layer)
  mapG = mapZoomLayer.append("g").attr("class", "map-countries");

  // Network lines layer (on top of countries)
  mapNetworkLinesG = mapZoomLayer.append("g").attr("class", "map-network-lines");

  // Map data lookup
  var countryMap = {};
  countries.forEach(function(d) { countryMap[d.geo] = d; });

  // Derive the small-country picker list: the 5 smallest by land area that have data.
  var areaByGeo = {};
  mainlandFeatures.forEach(function(f) {
    var g = f.properties.geo;
    if (g && countryMap[g]) areaByGeo[g] = d3.geoArea(f.geometry);
  });
  MAP_SMALL_COUNTRIES = Object.keys(areaByGeo)
    .sort(function(a, b) { return areaByGeo[a] - areaByGeo[b]; })
    .slice(0, 5)
    .map(function(g) { return [g, (countryMap[g] && countryMap[g].country_name) || g]; });

  // Adoption colour scale (sequential blue)
  var adoptionExtent = d3.extent(countries.filter(function(d) {
    return d.adoption_2022 != null && !isNaN(d.adoption_2022);
  }), function(d) { return d.adoption_2022; });

  window.mapColourScale = d3.scaleSequential(SCALES.adopt)
    .domain([0, niceTop(adoptionExtent[1] || 20)]);

  mapCountries = mapG.selectAll(".country-path")
    .data(europeFeatures)
    .join("path")
    .attr("class", "country-path")
    .attr("d", mapPath)
    .attr("fill", function(f) {
      var cd = countryMap[f.properties.geo];
      if (!cd || cd.adoption_2022 == null || isNaN(cd.adoption_2022)) return COLOURS.missing;
      return window.mapColourScale(cd.adoption_2022);
    })
    .on("mouseover", function(event, f) {
      var cd = countryMap[f.properties.geo];
      var name = cd ? cd.country_name : f.properties.geo;
      showTooltip(countryTooltipHtml(cd, name), event);
    })
    .on("mousemove", function(event) {
      showTooltip(tooltip.html(), event);
    })
    .on("mouseout", function() {
      hideTooltip();
    })
    .on("click", function(event, f) {
      var geo = f.properties.geo;
      if (state.selectedCountry === geo) {
        dispatch.call("countryDeselected");
      } else {
        dispatch.call("countrySelected", null, geo);
      }
    });

  // Overlay nodes for network (plotted after lines)
  mapNodesG = mapZoomLayer.append("g").attr("class", "map-nodes");

  // Zoom + pan: enabled only in explore mode. Wheel is disabled to avoid trapping
  // page scroll; users zoom with the +/- buttons and pan by dragging.
  mapZoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [mapWidth, mapHeight]])
    .filter(function(event) {
      if (state.mode !== "explore") return false;
      if (event.type === "wheel") return false;
      return !event.button;
    })
    .on("zoom", function(event) { mapZoomLayer.attr("transform", event.transform); });
  mapSvg.call(mapZoom).on("dblclick.zoom", null);

  // Map title
  mapSvg.append("text")
    .attr("class", "chart-title")
    .attr("x", 12)
    .attr("y", 18)
    .text("Enterprise robot adoption across Europe");

  // Country-code labels (2-letter) at centroids, above countries, below nodes
  mapLabelsG = mapZoomLayer.insert("g", ".map-nodes").attr("class", "map-code-labels");
  drawCountryLabels(europeFeatures);

  // Legend
  drawMapLegend(adoptionExtent);

  // Small-country picker + label toggle (below the legend, scales with the map)
  drawMapControls();
}

var LABEL_OVERRIDE = { NO: [9.0, 61.2] };  // countries whose polygon centroid sits off the landmass
function labelPoint(f) {
  var geom = f.geometry;
  if (!geom) return [0, 0];
  var gc = f.properties && f.properties.geo;
  if (gc && LABEL_OVERRIDE[gc] && mapProjection) return mapProjection(LABEL_OVERRIDE[gc]);
  if (geom.type === "Polygon") return mapPath.centroid(f);
  // MultiPolygon: use the largest polygon so overseas territories (e.g. France) do not pull the label off-shore
  var best = null, bestA = -1;
  geom.coordinates.forEach(function(poly) {
    var pg = { type: "Polygon", coordinates: poly };
    var a = d3.geoArea(pg);
    if (a > bestA) { bestA = a; best = pg; }
  });
  return best ? mapPath.centroid({ type: "Feature", geometry: best }) : mapPath.centroid(f);
}

function drawCountryLabels(features) {
  if (!mapLabelsG) return;
  mapLabelsG.selectAll("text").data(features).join("text")
    .attr("class", "country-code-label")
    .attr("x", function(f) { return labelPoint(f)[0]; })
    .attr("y", function(f) { return labelPoint(f)[1]; })
    .attr("text-anchor", "middle").attr("dy", "0.32em")
    .text(function(f) { return f.properties.geo; });
  refreshLabelVisibility();
}

function setMapLabels(v) {
  state.showLabels = v;
  refreshLabelVisibility();
}

function refreshLabelVisibility() {
  if (!mapLabelsG) return;
  mapLabelsG.style("display", null);
  mapLabelsG.selectAll(".country-code-label").style("display", function(f) {
    if (!state.showLabels) return "none";
    return (mapNodeGeos && mapNodeGeos[f.properties.geo]) ? "none" : null;
  });
}

// Derived at map init from land area (5 smallest countries with data) rather than hardcoded.
var MAP_SMALL_COUNTRIES = [];

function drawMapControls() {
  if (!mapSvg) return;
  mapSvg.selectAll(".map-controls").remove();
  var XR = 245, cw = 130;
  var cg = mapSvg.append("g").attr("class", "map-controls").attr("transform", "translate(" + (mapWidth - 250) + ",300)");

  // 1) country-label toggle (width = legend bar, text = legend title size)
  var lbl = cg.append("g").style("cursor", "pointer").on("click", function() { setMapLabels(!state.showLabels); drawMapControls(); });
  lbl.append("rect").attr("x", XR - cw).attr("y", 0).attr("width", cw).attr("height", 24).attr("rx", 4).attr("fill", "#282f42").attr("stroke", "#3a4358");
  lbl.append("text").attr("x", XR - cw / 2).attr("y", 16).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#cdd5e3").text("Country names: " + (state.showLabels ? "ON" : "OFF"));

  // 2) small-country dropdown
  var dd = cg.append("g").style("cursor", "pointer").on("click", function() { mapSmallOpen = !mapSmallOpen; drawMapControls(); });
  dd.append("rect").attr("x", XR - cw).attr("y", 30).attr("width", cw).attr("height", 24).attr("rx", 4).attr("fill", "#282f42").attr("stroke", "#3a4358");
  dd.append("text").attr("x", XR - cw + 9).attr("y", 46).attr("font-size", 14).attr("fill", "#cdd5e3").text("Small country");
  dd.append("text").attr("x", XR - 9).attr("y", 46).attr("text-anchor", "end").attr("font-size", 13).attr("fill", "#9aa6be").text(mapSmallOpen ? "\u25B4" : "\u25BE");

  if (mapSmallOpen) {
    var list = cg.append("g");
    MAP_SMALL_COUNTRIES.forEach(function(c, i) {
      var yy = 56 + i * 20;
      var row = list.append("g").style("cursor", "pointer").on("click", function(event) {
        if (event) event.stopPropagation();
        mapSmallOpen = false;
        if (state.selectedCountry === c[0]) dispatch.call("countryDeselected");
        else dispatch.call("countrySelected", null, c[0]);
        drawMapControls();
      });
      row.append("rect").attr("x", XR - cw).attr("y", yy).attr("width", cw).attr("height", 19)
        .attr("fill", state.selectedCountry === c[0] ? "#3a4d7a" : "#1f2636").attr("stroke", "#3a4358");
      row.append("text").attr("x", XR - cw + 9).attr("y", yy + 14).attr("font-size", 12).attr("fill", "#cdd5e3").text(c[1] + " (" + c[0] + ")");
    });
  }
}

function drawMapLegend(domain) {
  var legendW = 140, legendH = 10;
  var lx = mapWidth - legendW - 20, ly = mapHeight - 44;

  var legendG = mapSvg.append("g")
    .attr("class", "map-adopt-legend")
    .attr("transform", "translate(" + lx + "," + ly + ")");

  legendG.append("text")
    .attr("class", "legend-title")
    .attr("y", -6)
    .attr("font-size", 14)
    .text("Adoption (%)");

  var defs = mapSvg.append("defs");
  var grad = defs.append("linearGradient").attr("id", "map-legend-grad");
  grad.append("stop").attr("offset", "0%").attr("stop-color", SCALES.adopt(0));
  grad.append("stop").attr("offset", "100%").attr("stop-color", SCALES.adopt(1));

  legendG.append("rect")
    .attr("width", legendW).attr("height", legendH)
    .attr("fill", "url(#map-legend-grad)")
    .attr("rx", 2);

  legendG.append("text").attr("y", legendH + 14).attr("font-size", 14).attr("fill", "#9aa6be").text("0%");
  legendG.append("text").attr("x", legendW).attr("y", legendH + 14).attr("text-anchor", "end")
    .attr("font-size", 14).attr("fill", "#9aa6be").text(d3.format(".0f")(niceTop(domain[1] || 20)) + "%");

  legendG.append("rect").attr("x", 0).attr("y", legendH + 20).attr("width", 12).attr("height", 12).attr("fill", COLOURS.missing).attr("rx", 2);
  legendG.append("text").attr("x", 17).attr("y", legendH + 30).attr("font-size", 14).attr("fill", "#9aa6be").text("No data");
}

function updateMapMetric(metric, year) {
  if (!window.appData) return;
  state.displayedMetric = metric;
  state.displayedYear = year;
  var countries = window.appData.countries;
  var countryMap = {};
  countries.forEach(function(d) { countryMap[d.geo] = d; });

  var colourScale;

  if (metric === "adoption") {
    var ext = d3.extent(countries.filter(function(d) {
      var v = getAdoptionValue(d, year); return v != null && !isNaN(v);
    }), function(d) { return getAdoptionValue(d, year); });
    colourScale = d3.scaleSequential(SCALES.adopt).domain([0, niceTop(ext[1] || 20)]);
    mapCountries.transition().duration(400).attr("fill", function(f) {
      var cd = countryMap[f.properties.geo];
      if (!cd) return COLOURS.missing;
      var v = getAdoptionValue(cd, year);
      if (v == null || isNaN(v)) return COLOURS.missing;
      return colourScale(v);
    });
  } else if (metric === "change") {
    var absMax = d3.max(countries.filter(function(d) { return d.change_18_22 != null; }),
      function(d) { return Math.abs(d.change_18_22); }) || 3;
    absMax = niceTop(absMax);
    colourScale = d3.scaleDiverging(SCALES.change).domain([-absMax, 0, absMax]);
    mapCountries.transition().duration(400).attr("fill", function(f) {
      var cd = countryMap[f.properties.geo];
      if (!cd || cd.change_18_22 == null || isNaN(cd.change_18_22)) return COLOURS.missing;
      return colourScale(cd.change_18_22);
    });
  } else if (metric === "industrial") {
    var ik = "industrial_" + year;
    var ext2 = d3.extent(countries.filter(function(d) { return d[ik] != null; }), function(d) { return d[ik]; });
    colourScale = d3.scaleSequential(SCALES.industrial).domain([0, niceTop(ext2[1] || 15)]);
    mapCountries.transition().duration(400).attr("fill", function(f) {
      var cd = countryMap[f.properties.geo];
      if (!cd || cd[ik] == null) return COLOURS.missing;
      return colourScale(cd[ik]);
    });
  } else if (metric === "service") {
    var sk = "service_" + year;
    var ext3 = d3.extent(countries.filter(function(d) { return d[sk] != null; }), function(d) { return d[sk]; });
    colourScale = d3.scaleSequential(SCALES.service).domain([0, niceTop(ext3[1] || 10)]);
    mapCountries.transition().duration(400).attr("fill", function(f) {
      var cd = countryMap[f.properties.geo];
      if (!cd || cd[sk] == null) return COLOURS.missing;
      return colourScale(cd[sk]);
    });
  } else if (metric === "hub") {
    var hubKey = "hub_" + year;
    var ext4 = d3.extent(countries.filter(function(d) { return d[hubKey] != null; }),
      function(d) { return d[hubKey]; });
    colourScale = d3.scaleSequential(SCALES.hub).domain([0, niceTop(ext4[1] || 600)]);
    mapCountries.transition().duration(400).attr("fill", function(f) {
      var cd = countryMap[f.properties.geo];
      if (!cd || cd[hubKey] == null) return COLOURS.missing;
      return colourScale(cd[hubKey]);
    });
  } else if (metric === "neutral") {
    // All countries uniform light blue (for explore mode)
    mapCountries.transition().duration(400).attr("fill", "#36405c");
  }
}

function highlightMapCountry(geo) {
  if ((state.mode === "explore" || state.mode === "network") && state.displayedMetric === "neutral") {
    // Neutral base (network-only): selected = bright, others = neutral grey
    mapCountries
      .classed("selected", function(f) { return f.properties.geo === geo; })
      .classed("dimmed", false)
      .transition().duration(200)
      .attr("fill", function(f) { return f.properties.geo === geo ? "#43cfef" : "#36405c"; });
  } else {
    // A choropleth is shown: keep the metric colours, just outline the selected and dim the rest
    mapCountries
      .classed("selected", function(f) { return f.properties.geo === geo; })
      .classed("dimmed", function(f) { return f.properties.geo !== geo; });
  }
}

function resetMapHighlight() {
  mapCountries.classed("selected", false).classed("dimmed", false);
  if (state.mode === "explore" || state.mode === "network") {
    if (state.displayedMetric === "neutral") {
      mapCountries.transition().duration(200).attr("fill", "#36405c");
    } else {
      // restore the choropleth for the current metric + year
      updateMapMetric(state.displayedMetric, state.displayedYear || state.selectedYear);
    }
  }
}

function mapZoomBy(k) {
  if (!mapSvg || !mapZoom || state.mode !== "explore") return;
  mapSvg.transition().duration(250).call(mapZoom.scaleBy, k);
}

function mapZoomReset() {
  if (mapSvg && mapZoom) mapSvg.transition().duration(200).call(mapZoom.transform, d3.zoomIdentity);
}

// Base zoom applied to the (mini)map so the small corner map reads larger.
function setMapBaseZoom(k) {
  if (!mapSvg || !mapZoom) return;
  if (!k || Math.abs(k - 1) < 0.001) { mapSvg.call(mapZoom.transform, d3.zoomIdentity); return; }
  // Horizontally centred, biased downward so the southern edge (Cyprus) stays in view
  // and the mostly-empty far north is what gets trimmed instead.
  var t = d3.zoomIdentity.translate(-((k - 1) / 2) * mapWidth, -(k - 1) * mapHeight).scale(k);
  mapSvg.call(mapZoom.transform, t);
}

function drawMapNetworkLines(links, nodes, year) {
  if (!mapNetworkLinesG || !mapProjection) return;
  year = year || 2022;

  // Country filter (explore): show only checked countries' nodes + links between them.
  if (state.countryFilter) {
    var _f = state.countryFilter;
    nodes = nodes.filter(function(n) { return _f.has(n.geo); });
    links = links.filter(function(l) { return _f.has(l.source) && _f.has(l.target); });
  }

  function nodeAdopt(d) {
    var cd = getCountryData(d.geo);
    var v = cd ? cd["adoption_" + year] : null;
    if (v == null || isNaN(v)) v = d.adoption_2022;
    return (v == null || isNaN(v)) ? null : v;
  }

  var nodeMap = {};
  nodes.forEach(function(n) { nodeMap[n.geo] = n; });

  // Filter by threshold
  var weightKey = "weight_" + year;
  var filteredLinks = links.filter(function(l) { return l[weightKey] > 0 && l[weightKey] >= state.networkThreshold; });

  // Draw lines
  var widthScale = d3.scaleLinear().domain([0, 130]).range([1.2, 9.6]);

  var linesSel = mapNetworkLinesG.selectAll(".network-line")
    .data(filteredLinks, function(d) { return d.source + "-" + d.target; });

  linesSel.exit().transition().duration(300).attr("opacity", 0).remove();

  linesSel.enter()
    .append("line")
    .attr("class", "network-line")
    .merge(linesSel)
    .attr("x1", function(d) { var n = nodeMap[d.source]; return n ? mapProjection([n.longitude, n.latitude])[0] : 0; })
    .attr("y1", function(d) { var n = nodeMap[d.source]; return n ? mapProjection([n.longitude, n.latitude])[1] : 0; })
    .attr("x2", function(d) { var n = nodeMap[d.target]; return n ? mapProjection([n.longitude, n.latitude])[0] : 0; })
    .attr("y2", function(d) { var n = nodeMap[d.target]; return n ? mapProjection([n.longitude, n.latitude])[1] : 0; })
    .attr("stroke-width", function(d) { return widthScale(d[weightKey]); })
    .attr("opacity", 0.7)
    .on("mouseover", function(event, d) {
      var sn = nodeMap[d.source]; var tn = nodeMap[d.target];
      showTooltip(
        "<strong>" + (sn ? sn.country_name : d.source) + " - " + (tn ? tn.country_name : d.target) + "</strong>" +
        "<br>Joint articles (" + year + "): " + fmtNum(d[weightKey]), event
      );
    })
    .on("mouseout", hideTooltip);

  // Draw nodes on map
  var sizeScale = HUB_SIZE_SCALE;

  var adoptVals = nodes.map(nodeAdopt).filter(function(v) { return v != null; });
  var adoptMax = d3.max(adoptVals) || 20;
  var adoptExt = [0, adoptMax];
  var nodeColour = d3.scaleSequential(SCALES.node).domain([0, adoptMax]);
  var explore = (state.mode === "explore" || state.mode === "network");  // choropleth carries adoption colour, so nodes use one fixed colour

  var nodeSel = mapNodesG.selectAll(".network-node")
    .data(nodes, function(d) { return d.geo; });

  nodeSel.exit().remove();

  var nodeEnter = nodeSel.enter()
    .append("circle")
    .attr("class", "network-node");

  nodeEnter.merge(nodeSel)
    .attr("cx", function(d) { return mapProjection([d.longitude, d.latitude])[0]; })
    .attr("cy", function(d) { return mapProjection([d.longitude, d.latitude])[1]; })
    .attr("r", function(d) { return sizeScale(d["hub_" + year]); })
    .attr("fill", function(d) { if (explore) return "#a855f7"; var a = nodeAdopt(d); return a != null ? nodeColour(a) : COLOURS.missing; })
    .on("mouseover", function(event, d) {
      showTooltip(
        "<strong>" + d.country_name + "</strong>" +
        "<br>Hub strength (" + year + "): " + fmtNum(d["hub_" + year]) +
        "<br>Adoption " + year + ": " + fmtPct(nodeAdopt(d)), event
      );
    })
    .on("mouseout", hideTooltip)
    .on("click", function(event, d) {
      if (state.selectedCountry === d.geo) {
        dispatch.call("countryDeselected");
      } else {
        dispatch.call("countrySelected", null, d.geo);
      }
    });

  // Labels for nodes
  var labelSel = mapNodesG.selectAll(".node-label")
    .data(nodes, function(d) { return d.geo; });

  labelSel.exit().remove();

  labelSel.enter()
    .append("text")
    .attr("class", "node-label")
    .merge(labelSel)
    .attr("x", function(d) { return mapProjection([d.longitude, d.latitude])[0]; })
    .attr("y", function(d) { return mapProjection([d.longitude, d.latitude])[1] - sizeScale(d["hub_" + year]) - 3; })
    .text(function(d) { return d.geo; });

  // avoid duplicate labels: hide the centroid code for countries that have a node
  mapNodeGeos = {}; nodes.forEach(function(n) { mapNodeGeos[n.geo] = 1; });
  refreshLabelVisibility();

  // Hide the adoption choropleth legend, show network legend
  mapSvg.selectAll(".map-adopt-legend").style("display", "none");
  drawMapNetworkLegend(sizeScale, adoptExt, year, widthScale, false);
}

function drawMapNetworkLegend(sizeScale, adoptExt, year, widthScale, showColour) {
  mapSvg.selectAll(".map-net-legend").remove();
  var legG = mapSvg.append("g").attr("class", "map-net-legend")
    .attr("transform", "translate(" + (mapWidth - 250) + ",24)");
  var yr = year || 2022, XR = 245;

  // 1) Joint articles (link width) - same scale as the map lines
  legG.append("text").attr("class", "legend-title").attr("x", XR).attr("text-anchor", "end").attr("y", 0).attr("font-size", 14).text("Joint articles");
  var jvals = [20, 50, 80, 130], segLen = 23, segGap = 16, segY = 18;
  var jtotal = jvals.length * segLen + (jvals.length - 1) * segGap;
  var jx = XR - jtotal;
  jvals.forEach(function(v) {
    legG.append("line").attr("x1", jx).attr("x2", jx + segLen).attr("y1", segY).attr("y2", segY)
      .attr("stroke", "#b56fd0").attr("stroke-width", (widthScale ? widthScale(v) : 2) * MAP_BASE_ZOOM).attr("stroke-linecap", "round");
    legG.append("text").attr("x", jx + segLen / 2).attr("y", segY + 16).attr("text-anchor", "middle")
      .attr("font-size", 13).attr("fill", "#b6c0d4").text(fmtNum(v));
    jx += segLen + segGap;
  });

  // 2) Node size: hub strength (two rows, includes 0, right-aligned)
  legG.append("text").attr("class", "legend-title").attr("x", XR).attr("text-anchor", "end").attr("y", 52).attr("font-size", 14).text("Node size: hub strength");
  function drawSizeRow(items, baseline, labelY) {
    var total = items.reduce(function(a, v) { return a + 2 * sizeScale(v) * MAP_BASE_ZOOM; }, 0) + (items.length - 1) * 14;
    var x = XR - total;
    items.forEach(function(v) {
      var r = sizeScale(v) * MAP_BASE_ZOOM;
      legG.append("circle").attr("cx", x + r).attr("cy", baseline - r).attr("r", r)
        .attr("fill", "#a855f7").attr("fill-opacity", 0.9).attr("stroke", "#fff").attr("stroke-width", 1);
      legG.append("text").attr("x", x + r).attr("y", labelY).attr("text-anchor", "middle")
        .attr("font-size", 13).attr("fill", "#b6c0d4").text(fmtNum(v));
      x += 2 * r + 14;
    });
  }
  drawSizeRow([0, 100, 200, 300], 90, 104);
  drawSizeRow([400, 500, 600], 160, 174);

  // 3) Node colour: adoption (%) - only in the story view (in explore the choropleth carries colour)
  if (showColour !== false) {
    var cy0 = 200, gradW = 130;
    legG.append("text").attr("class", "legend-title").attr("x", XR).attr("text-anchor", "end").attr("y", cy0).attr("font-size", 14).text("Node colour: adoption (%)");
    var defs = mapSvg.select("defs").empty() ? mapSvg.append("defs") : mapSvg.select("defs");
    defs.select("#map-net-grad").remove();
    var grad = defs.append("linearGradient").attr("id", "map-net-grad");
    grad.append("stop").attr("offset", "0%").attr("stop-color", SCALES.node(0.1));
    grad.append("stop").attr("offset", "100%").attr("stop-color", SCALES.node(0.9));
    legG.append("rect").attr("x", XR - gradW).attr("y", cy0 + 8).attr("width", gradW).attr("height", 11).attr("fill", "url(#map-net-grad)").attr("rx", 2);
    legG.append("text").attr("x", XR - gradW).attr("y", cy0 + 34).attr("font-size", 13).attr("fill", "#b6c0d4").text("0%");
    legG.append("text").attr("x", XR).attr("y", cy0 + 34).attr("text-anchor", "end").attr("font-size", 13).attr("fill", "#b6c0d4").text(d3.format(".0f")(adoptExt[1] || 20) + "%");
  }
}

function setMapTitle(line1, line2) {
  if (!mapSvg) return;
  var t = mapSvg.select("text.chart-title");
  t.text(null);
  t.append("tspan").attr("x", 12).attr("dy", 0).text(line1);
  if (line2) t.append("tspan").attr("x", 12).attr("dy", "1.25em").text(line2);
}

function setAdoptLegendVisible(v) {
  if (mapSvg) mapSvg.selectAll(".map-adopt-legend").style("display", v ? null : "none");
}

function clearMetricLegend() {
  if (mapSvg) mapSvg.selectAll(".map-metric-legend").remove();
}

// Bottom-left choropleth legend for the currently displayed map metric (explore mode)
function drawMetricLegend(metric, year) {
  if (!mapSvg) return;
  mapSvg.selectAll(".map-metric-legend").remove();
  if (!metric || metric === "neutral") return;
  var countries = window.appData ? window.appData.countries : [];
  var legW = 130, legH = 11, XR = 245;
  var lg = mapSvg.append("g").attr("class", "map-metric-legend")
    .attr("transform", "translate(" + (mapWidth - 250) + ",230)");
  var defs = mapSvg.select("defs").empty() ? mapSvg.append("defs") : mapSvg.select("defs");
  defs.select("#metric-grad").remove();
  var grad = defs.append("linearGradient").attr("id", "metric-grad");

  var title, interp, maxVal, isDiverging = false, absMax;
  if (metric === "change") {
    isDiverging = true;
    absMax = niceTop(d3.max(countries.filter(function(d) { return d.change_18_22 != null; }), function(d) { return Math.abs(d.change_18_22); }) || 3);
    interp = SCALES.change; title = "Change 2018-2022 (pp)";
  } else if (metric === "industrial") {
    interp = SCALES.industrial; maxVal = niceTop(d3.max(countries, function(d) { return d["industrial_" + year]; }) || 15); title = "Industrial robots (%)";
  } else if (metric === "service") {
    interp = SCALES.service; maxVal = niceTop(d3.max(countries, function(d) { return d["service_" + year]; }) || 10); title = "Service robots (%)";
  } else if (metric === "hub") {
    interp = SCALES.hub; maxVal = niceTop(d3.max(countries, function(d) { return d["hub_" + year]; }) || 600); title = "Hub strength (articles)";
  } else {
    interp = SCALES.adopt;
    maxVal = niceTop(d3.max(countries, function(d) { var v = d["adoption_" + year]; return (v == null || isNaN(v)) ? null : v; }) || 20);
    title = "Robot adoption (%)";
  }

  lg.append("text").attr("class", "legend-title").attr("x", XR).attr("text-anchor", "end").attr("y", -6).attr("font-size", 14).text(title);
  var gx = XR - legW;
  if (isDiverging) {
    grad.append("stop").attr("offset", "0%").attr("stop-color", interp(0));
    grad.append("stop").attr("offset", "50%").attr("stop-color", interp(0.5));
    grad.append("stop").attr("offset", "100%").attr("stop-color", interp(1));
    lg.append("rect").attr("x", gx).attr("width", legW).attr("height", legH).attr("fill", "url(#metric-grad)").attr("rx", 2);
    lg.append("text").attr("x", gx).attr("y", legH + 14).attr("font-size", 13).attr("fill", "#b6c0d4").text("-" + d3.format(".1f")(absMax));
    lg.append("text").attr("x", gx + legW / 2).attr("y", legH + 14).attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#b6c0d4").text("0");
    lg.append("text").attr("x", XR).attr("y", legH + 14).attr("text-anchor", "end").attr("font-size", 13).attr("fill", "#b6c0d4").text("+" + d3.format(".1f")(absMax));
  } else {
    grad.append("stop").attr("offset", "0%").attr("stop-color", interp(0));
    grad.append("stop").attr("offset", "100%").attr("stop-color", interp(1));
    lg.append("rect").attr("x", gx).attr("width", legW).attr("height", legH).attr("fill", "url(#metric-grad)").attr("rx", 2);
    lg.append("text").attr("x", gx).attr("y", legH + 14).attr("font-size", 13).attr("fill", "#b6c0d4").text(metric === "hub" ? "0" : "0%");
    var maxLabel = metric === "hub" ? fmtNum(maxVal) : (d3.format(".0f")(maxVal) + "%");
    lg.append("text").attr("x", XR).attr("y", legH + 14).attr("text-anchor", "end").attr("font-size", 13).attr("fill", "#b6c0d4").text(maxLabel);
  }
  lg.append("rect").attr("x", gx).attr("y", legH + 20).attr("width", 12).attr("height", 12).attr("fill", COLOURS.missing).attr("rx", 2);
  lg.append("text").attr("x", gx + 17).attr("y", legH + 30).attr("font-size", 13).attr("fill", "#b6c0d4").text("No data");
}

function clearMapNetwork() {
  if (mapNetworkLinesG) mapNetworkLinesG.selectAll("*").remove();
  if (mapNodesG) mapNodesG.selectAll("*").remove();
  mapNodeGeos = null;
  refreshLabelVisibility();
  // Remove network legend, restore adoption legend
  if (mapSvg) {
    mapSvg.selectAll(".map-net-legend").remove();
  }
}

function highlightMapNetworkLinks(geo) {
  mapNetworkLinesG.selectAll(".network-line")
    .classed("highlighted", function(d) { return d.source === geo || d.target === geo; })
    .style("stroke", function(d) { return (d.source === geo || d.target === geo) ? "#dd54b6" : "#5b6680"; })
    .attr("opacity", function(d) { return (d.source === geo || d.target === geo) ? 0.95 : 0.3; });

  mapNodesG.selectAll(".network-node")
    .attr("opacity", function(d) {
      if (d.geo === geo) return 1;
      var connected = window.appData.links.some(function(l) {
        return (l.source === geo && l.target === d.geo) || (l.target === geo && l.source === d.geo);
      });
      return connected ? 0.9 : 0.25;
    });
}

function resetMapNetworkHighlight() {
  mapNetworkLinesG.selectAll(".network-line")
    .classed("highlighted", false)
    .style("stroke", null)
    .attr("opacity", 0.7);
  mapNodesG.selectAll(".network-node").attr("opacity", 1);
}
