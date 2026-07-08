// ===== app.js: Data loading, initialisation, dispatch handlers =====

(function() {
  "use strict";

  // ===== DATA LOADING =====
  function loadData() {
    return Promise.all([
      d3.json("data/countries-geo.json"),
      d3.csv("data/countries_summary.csv", parseCountrySummary),
      d3.csv("data/adoption_change.csv", parseAdoptionChange),
      d3.csv("data/robot_type_2022.csv", parseRobotType),
      d3.csv("data/size_profile.csv", parseSizeProfile),
      d3.csv("data/sector_country_year.csv", parseSectorData),
      d3.csv("data/network_nodes.csv", parseNetworkNode),
      d3.csv("data/network_links.csv", parseNetworkLink)
    ]);
  }

  // ===== PARSERS =====
  function parseCountrySummary(d) {
    return {
      geo: d.geo,
      country_name: d.country_name,
      adoption_2018: d.adoption_2018 ? +d.adoption_2018 : null,
      adoption_2020: d.adoption_2020 ? +d.adoption_2020 : null,
      adoption_2022: d.adoption_2022 ? +d.adoption_2022 : null,
      change_18_22: d.change_18_22 ? +d.change_18_22 : null,
      industrial_2018: d.industrial_2018 ? +d.industrial_2018 : null,
      industrial_2020: d.industrial_2020 ? +d.industrial_2020 : null,
      industrial_2022: d.industrial_2022 ? +d.industrial_2022 : null,
      service_2018: d.service_2018 ? +d.service_2018 : null,
      service_2020: d.service_2020 ? +d.service_2020 : null,
      service_2022: d.service_2022 ? +d.service_2022 : null,
      hub_strength: d.hub_strength ? +d.hub_strength : null,
      degree: d.degree ? +d.degree : null,
      hub_2018: d.hub_2018 !== "" ? +d.hub_2018 : null,
      hub_2020: d.hub_2020 !== "" ? +d.hub_2020 : null,
      hub_2022: d.hub_2022 !== "" ? +d.hub_2022 : null,
      degree_2018: d.degree_2018 !== "" ? +d.degree_2018 : null,
      degree_2020: d.degree_2020 !== "" ? +d.degree_2020 : null,
      degree_2022: d.degree_2022 !== "" ? +d.degree_2022 : null,
      overlap_q3: d.overlap_q3 === "True",
      flag_note: d.flag_note || "",
      longitude: +d.longitude,
      latitude: +d.latitude
    };
  }

  function parseAdoptionChange(d) {
    return {
      geo: d.geo,
      country_name: d.country_name,
      adoption_2018: +d.adoption_2018,
      adoption_2022: +d.adoption_2022,
      change_18_22: +d.change_18_22,
      flag_note: d.flag_note || "",
      change_group: d.change_group
    };
  }

  function parseRobotType(d) {
    return {
      geo: d.geo,
      country_name: d.country_name,
      industrial_2022: d.industrial_2022 ? +d.industrial_2022 : null,
      service_2022: d.service_2022 ? +d.service_2022 : null,
      gap_industrial_service: d.gap_industrial_service ? +d.gap_industrial_service : null
    };
  }

  function parseSizeProfile(d) {
    return {
      geo: d.geo,
      country_name: d.country_name,
      year: +d.year,
      size_class: d.size_class,
      size_label: d.size_label,
      value: d.value ? +d.value : null
    };
  }

  function parseSectorData(d) {
    return {
      geo: d.geo,
      country_name: d.country_name,
      sector_code: d.sector_code,
      sector_label: d.sector_label,
      year: +d.year,
      value: (d.value === "" || d.value == null) ? null : +d.value
    };
  }

  function parseNetworkNode(d) {
    return {
      id: d.id,
      geo: d.geo,
      country_name: d.country_name,
      hub_2018: +d.hub_2018, hub_2020: +d.hub_2020, hub_2022: +d.hub_2022,
      degree_2018: +d.degree_2018, degree_2020: +d.degree_2020, degree_2022: +d.degree_2022,
      hub_strength: +d.hub_2022, degree: +d.degree_2022,
      adoption_2022: d.adoption_2022 ? +d.adoption_2022 : null,
      longitude: +d.longitude,
      latitude: +d.latitude,
      overlap_q3: d.overlap_q3 === "True"
    };
  }

  function parseNetworkLink(d) {
    return {
      source: d.source,
      target: d.target,
      source_geo: d.source_geo,
      target_geo: d.target_geo,
      weight_2018: +d.weight_2018, weight_2020: +d.weight_2020, weight_2022: +d.weight_2022,
      weight: +d.weight_2022
    };
  }

  // ===== INITIALISATION =====
  function init(results) {
    var topoData = results[0];
    var countries = results[1];
    var adoptionChange = results[2];
    var robotType = results[3];
    var sizeProfile = results[4];
    var sectorData = results[5];
    var nodes = results[6];
    var links = results[7];

    // Store globally for cross-module access
    window.appData = {
      topo: topoData,
      countries: countries,
      adoptionChange: adoptionChange,
      robotType: robotType,
      sizeProfile: sizeProfile,
      sectorData: sectorData,
      nodes: nodes,
      links: links
    };

    // Hide loading, show app
    d3.select("#app-loading").classed("hidden", true);
    d3.select("#app-main").classed("hidden", false);
    buildProgressDots();

    // Init map
    initMap(topoData, countries);
    setAdoptLegendVisible(false);
    drawMetricLegend("adoption", 2022);

    // Set initial layout (full map for step 0)
    setVisLayout("intro");

    // Init chart for step 0
    updateChartForStep(0, null);

    // Populate big numbers
    populateBigNumbers(countries);

    // Populate takeaway cards
    populateTakeaways();

    // Populate Spearman note
    d3.select("#spearman-note").text(
      "Spearman rank correlation: rho = 0.140, p = 0.665 (n = 12). Not statistically significant at alpha = 0.05."
    );

    // Populate overlap count
    var overlapCount = nodes.length;
    d3.select("#overlap-count").text(overlapCount);

    // Setup modals
    setupModals();

    // Auto-show About modal on first load so users know how to use the app
    d3.select("#modal-help").classed("hidden", false);

    // Setup dispatch handlers
    setupDispatchHandlers();

    // Init explore controls
    initExploreControls();

    // Init scrolly (last, after DOM is ready)
    initScrolly();
  }

  // ===== BIG NUMBERS =====
  function populateBigNumbers(countries) {
    var container = d3.select("#big-numbers");
    var validCount = countries.filter(function(d) { return d.adoption_2022 != null; }).length;
    var avg = d3.mean(countries.filter(function(d) { return d.adoption_2022 != null; }), function(d) { return d.adoption_2022; });
    var maxC = countries.filter(function(d) { return d.adoption_2022 != null; }).sort(function(a, b) { return b.adoption_2022 - a.adoption_2022; })[0];

    var nums = [
      { num: validCount, label: "Countries with data" },
      { num: fmtPct(avg), label: "Average adoption 2022" },
      { num: maxC ? maxC.geo : "N/A", label: maxC ? "Highest (" + fmtPct(maxC.adoption_2022) + ")" : "Highest" }
    ];

    container.html("");
    nums.forEach(function(item) {
      var card = container.append("div").attr("class", "big-num");
      card.append("span").attr("class", "num").text(item.num);
      card.append("span").attr("class", "label").text(item.label);
    });
  }

  // ===== TAKEAWAY CARDS =====
  function populateTakeaways() {
    var container = d3.select("#takeaway-cards");
    var takeaways = [
      "Adoption changed unevenly: some countries gained several percentage points while others declined between 2018 and 2022.",
      "Enterprise size matters: large firms (250+ employees) adopt robots at much higher rates than small or medium enterprises.",
      "Research centrality does not predict adoption: countries leading in robotics collaboration are not automatically the highest adopters (Spearman rho = 0.140, p = 0.665)."
    ];
    container.html("");
    takeaways.forEach(function(t) {
      container.append("div").attr("class", "takeaway-card").text(t);
    });
  }

  // ===== MODALS =====
  function setupModals() {
    d3.select("#btn-help").on("click", function() { d3.select("#modal-help").classed("hidden", false); });
    d3.select("#btn-source").on("click", function() { d3.select("#modal-source").classed("hidden", false); });

    d3.selectAll(".modal-close").on("click", function() {
      d3.select(this.closest(".modal")).classed("hidden", true);
    });

    d3.selectAll(".modal").on("click", function(event) {
      if (event.target === this) d3.select(this).classed("hidden", true);
    });
  }

  // ===== LAYOUT MODES =====
  function setVisLayout(mode) {
    var vc = d3.select("#vis-container");
    var detailPanel = d3.select("#detail-panel");
    var exploreSlot = d3.select("#explore-detail-slot");
    var visPanel = d3.select("#vis-panel");

    // Reset all layout classes
    vc.classed("minimap-active", false).classed("fullmap-active", false).classed("minimap-bottom", false).classed("sector-active", false).classed("takeaway-active", false).classed("size-active", false);

    if (mode === "intro") {
      // Step 0: full map visible, chart hidden, detail panel visible
      vc.classed("fullmap-active", true);
      d3.select("#chart-container").classed("hidden", true);
      d3.select("#network-container").classed("hidden", true);
      visPanel.node().appendChild(detailPanel.node());
      detailPanel.classed("detail-compact", false).classed("detail-hidden", false);
    } else if (mode === "minimap") {
      // Steps 1-4: small map in corner, chart fills space, detail hidden
      vc.classed("minimap-active", true);
      d3.select("#chart-container").classed("hidden", false);
      d3.select("#network-container").classed("hidden", true);
      visPanel.node().appendChild(detailPanel.node());
      detailPanel.classed("detail-compact", false).classed("detail-hidden", true);
    } else if (mode === "fullmap") {
      // Steps 5-6: map fills all space with network overlay, detail hidden
      vc.classed("fullmap-active", true);
      d3.select("#chart-container").classed("hidden", true);
      d3.select("#network-container").classed("hidden", true);
      visPanel.node().appendChild(detailPanel.node());
      detailPanel.classed("detail-compact", false).classed("detail-hidden", true);
    } else if (mode === "explore") {
      // Explore: fullmap, detail panel moves to narrative column, visible
      vc.classed("fullmap-active", true);
      d3.select("#chart-container").classed("hidden", true);
      d3.select("#network-container").classed("hidden", true);
      exploreSlot.node().appendChild(detailPanel.node());
      detailPanel.classed("detail-compact", true).classed("detail-hidden", false);
    }
  }

  // ===== DISPATCH HANDLERS =====
  function setupDispatchHandlers() {

    // Track whether the pointer is currently over the (mini)map. When the step
    // changes while hovering, force the minimap back to its collapsed corner so
    // the new chart is visible; restore normal hover-expand once the pointer leaves.
    var mapHovered = false;
    d3.select("#map-container")
      .on("mouseenter.minimap", function() { mapHovered = true; })
      .on("mouseleave.minimap", function() {
        mapHovered = false;
        d3.select("#map-container").classed("suppress-hover", false);
      });

    // X button collapses the expanded minimap immediately (mouse can stay inside);
    // it re-enables normal hover-expand once the pointer leaves.
    d3.select("#map-x-close").on("click", function(event) {
      event.stopPropagation();
      d3.select("#map-container").classed("suppress-hover", true);
    });

    dispatch.on("stepChanged", function(stepNum) {
      updateProgressDots(stepNum);

      // If the step changed while the minimap was hover-expanded, collapse it.
      d3.select("#map-container").classed("suppress-hover", mapHovered);

      // Metric legend only exists in explore mode
      // Leaving explore resets the map year to 2022 (the main reference year)
      if (stepNum !== 7 && state.selectedYear !== 2022) {
        state.selectedYear = 2022;
        d3.select("#sl-year").property("value", 2022);
        d3.select("#year-val").text("2022");
        if (state.selectedCountry) updateDetailPanel(state.selectedCountry);
      }

      // Country labels default: off on the network maps (steps 5, 7), on elsewhere
      state.showLabels = !(stepNum === 5 || stepNum === 7);

      clearMetricLegend();
      setAdoptLegendVisible(false);

      if (stepNum === 0) {
        setVisLayout("intro");
        clearMapNetwork();
        updateMapMetric("adoption", 2022);
        drawMetricLegend("adoption", 2022);
        setMapTitle("Enterprise robot adoption across Europe");
      } else if (stepNum <= 4) {
        setVisLayout("minimap");
        clearMapNetwork();
        if (stepNum === 1) {
          updateMapMetric("change", 2022);
          drawMetricLegend("change", 2022);
          setMapTitle("Change in robot adoption, 2018 to 2022");
        } else {
          updateMapMetric("adoption", 2022);
          drawMetricLegend("adoption", 2022);
          setMapTitle("Enterprise robot adoption across Europe");
        }
      } else if (stepNum === 5) {
        setVisLayout("fullmap");
        state.mode = "network";
        updateMapMetric("adoption", 2022);
        drawMetricLegend("adoption", 2022);
        drawMapNetworkLines(window.appData.links, window.appData.nodes, 2022);
        setMapTitle("Robotics research collaboration across", "Europe 2022");
      } else if (stepNum === 6) {
        // Key takeaways: chart fills the panel; the reference map is hidden.
        setVisLayout("minimap");
        state.mode = "story";
        clearMapNetwork();
      } else if (stepNum === 7) {
        // Explore: choropleth follows the selected metric (+ legend); network follows the selected year
        setVisLayout("explore");
        state.mode = "explore";
        updateMapMetric(state.mapMetric, state.selectedYear);
        drawMetricLegend(state.mapMetric, state.selectedYear);
        if (state.networkVisible) {
          drawMapNetworkLines(window.appData.links, window.appData.nodes, state.selectedYear);
        } else {
          clearMapNetwork();
        }
        setMapTitle("Robotics research collaboration across", "Europe " + state.selectedYear);
      }

      if (stepNum !== 5 && stepNum !== 6 && stepNum !== 7) {
        state.mode = "story";
      }

      // Zoom controls + drag-pan only on the explore map; reset zoom when leaving.
      var inExplore = (stepNum === 7);
      d3.select("#map-zoom-controls").classed("hidden", !inExplore);
      d3.select("#map-svg").classed("zoomable", inExplore);
      if (!inExplore) mapZoomReset();

      // Update chart
      updateChartForStep(stepNum, state.selectedCountry);

      // Sector heatmap step: move the minimap to the left so the right-aligned grid is clear
      d3.select("#vis-container").classed("sector-active", stepNum === 4);
      // Key takeaways step: hide the reference map so the summary chart fills the panel
      d3.select("#vis-container").classed("takeaway-active", stepNum === 6);
      // Size step: minimap to the top-right corner
      d3.select("#vis-container").classed("size-active", stepNum === 3);
      if (typeof setMapLabels === "function") { setMapLabels(state.showLabels); drawMapControls(); }
      if (typeof setMapBaseZoom === "function") setMapBaseZoom(typeof MAP_BASE_ZOOM !== "undefined" ? MAP_BASE_ZOOM : 1.2);
    });

    dispatch.on("countrySelected", function(geo) {
      state.selectedCountry = geo;

      // Highlight on map
      highlightMapCountry(geo);

      // Update detail panel
      updateDetailPanel(geo);

      // Highlight on chart
      highlightChartCountry(geo);

      // Highlight on network
      highlightNetworkNode(geo);
      highlightMapNetworkLinks(geo);

      // For size/sector charts, redraw with selected country
      if (state.currentStep === 3) {
        drawSizeDotPlot(window.appData.sizeProfile, geo);
      } else if (state.currentStep === 4) {
        drawSectorHeatmap(window.appData.sectorData, geo);
      }
    });

    dispatch.on("countryDeselected", function() {
      state.selectedCountry = null;

      resetMapHighlight();
      clearDetailPanel();
      resetChartHighlight();
      resetNetworkHighlight();
      resetMapNetworkHighlight();

      if (state.currentStep === 3) {
        drawSizeDotPlot(window.appData.sizeProfile, null);
      } else if (state.currentStep === 4) {
        drawSectorHeatmap(window.appData.sectorData, null);
      }
    });

    dispatch.on("yearChanged", function(year) {
      state.selectedYear = year;
      updateMapMetric(state.mapMetric, year);
      if (state.mode === "explore") {
        drawMetricLegend(state.mapMetric, year);
        setMapTitle("Robotics research collaboration across", "Europe " + year);
        if (state.networkVisible) {
          clearMapNetwork();
          drawMapNetworkLines(window.appData.links, window.appData.nodes, year);
        }
      }
      if (state.selectedCountry) {
        updateDetailPanel(state.selectedCountry);
      }
    });

    dispatch.on("metricChanged", function(metric) {
      state.mapMetric = metric;
      updateMapMetric(metric, state.selectedYear);
      if (state.mode === "explore") {
        drawMetricLegend(metric, state.selectedYear);
      }
    });

    dispatch.on("thresholdChanged", function(threshold) {
      state.networkThreshold = threshold;
      if (state.currentStep >= 5 && state.networkVisible) {
        var y = (state.mode === "explore") ? state.selectedYear : 2022;
        clearMapNetwork();
        drawMapNetworkLines(window.appData.links, window.appData.nodes, y);
      }
    });
  }

  // ===== PROGRESS DOTS (visual structuring / signposting) =====
  function updateProgressDots(step) {
    var dots = document.querySelectorAll("#progress-dots .pdot");
    for (var i = 0; i < dots.length; i++) {
      var s = +dots[i].getAttribute("data-step");
      dots[i].classList.toggle("done", s < step);
      dots[i].classList.toggle("active", s === step);
    }
  }
  function buildProgressDots() {
    var c = document.getElementById("progress-dots");
    if (!c) return;
    var labels = ["Overview", "Change", "Robot type", "Firm size", "Sectors", "Network", "Takeaways", "Explore"];
    c.innerHTML = "";
    labels.forEach(function(lab, i) {
      var b = document.createElement("button");
      b.className = "pdot"; b.type = "button";
      b.setAttribute("data-step", i);
      b.title = (i + 1) + ". " + lab;
      b.setAttribute("aria-label", "Go to " + lab);
      b.addEventListener("click", function() {
        var el = document.querySelector('.story-step[data-step="' + i + '"]');
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      c.appendChild(b);
    });
    updateProgressDots(typeof state.currentStep === "number" ? state.currentStep : 0);
  }

  // ===== START =====
  loadData()
    .then(init)
    .catch(function(err) {
      console.error("Data loading error:", err);
      d3.select("#app-loading").classed("hidden", true);
      d3.select("#app-error").classed("hidden", false);
    });

})();
