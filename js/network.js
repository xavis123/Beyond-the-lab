// ===== network.js: Force-directed network visualisation =====

var netSvg, netG, netSimulation, netNodes, netLinks, netLabels;
var netWidth, netHeight;

function initNetwork(nodes, links) {
  var container = d3.select("#network-container");
  netWidth = container.node().getBoundingClientRect().width || 650;
  netHeight = Math.min(netWidth * 0.5, 300);

  netSvg = d3.select("#network-svg")
    .attr("viewBox", "0 0 " + netWidth + " " + netHeight)
    .attr("preserveAspectRatio", "xMidYMid meet");

  netSvg.selectAll("*").remove();

  // Background
  netSvg.append("rect")
    .attr("width", netWidth).attr("height", netHeight)
    .attr("fill", "#232a3a").attr("rx", 4);

  netG = netSvg.append("g");

  // Size scale for nodes
  var sizeScale = d3.scaleSqrt()
    .domain(d3.extent(nodes, function(d) { return d.hub_strength; }))
    .range([6, 22]);

  // Colour scale for nodes (adoption) - purple to contrast with blue map
  var adoptExt = d3.extent(nodes.filter(function(d) { return d.adoption_2022 != null; }),
    function(d) { return d.adoption_2022; });
  var nodeColour = d3.scaleSequential(SCALES.node).domain([0, adoptExt[1] || 20]);

  // Width scale for links
  var weightExt = d3.extent(links, function(d) { return d.weight; });
  var linkWidth = d3.scaleLinear().domain(weightExt).range([0.5, 5]);

  // Clone data for simulation
  var simNodes = nodes.map(function(d) { return Object.assign({}, d); });
  var simLinks = links.map(function(d) {
    return { source: d.source, target: d.target, weight: d.weight,
             source_geo: d.source_geo, target_geo: d.target_geo };
  });

  // Filter links by threshold
  var filteredLinks = simLinks.filter(function(l) { return l.weight >= state.networkThreshold; });

  // Force simulation
  netSimulation = d3.forceSimulation(simNodes)
    .force("link", d3.forceLink(filteredLinks).id(function(d) { return d.id || d.geo; }).distance(80).strength(0.4))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(netWidth / 2, netHeight / 2))
    .force("collision", d3.forceCollide().radius(function(d) { return sizeScale(d.hub_strength) + 4; }))
    .force("x", d3.forceX(netWidth / 2).strength(0.05))
    .force("y", d3.forceY(netHeight / 2).strength(0.05));

  // Draw links
  netLinks = netG.selectAll(".net-link")
    .data(filteredLinks)
    .join("line")
    .attr("class", "net-link")
    .attr("stroke", COLOURS.linkDefault)
    .attr("stroke-width", function(d) { return linkWidth(d.weight); })
    .attr("stroke-linecap", "round")
    .attr("opacity", 0.5)
    .on("mouseover", function(event, d) {
      var sn = simNodes.find(function(n) { return (n.id || n.geo) === (typeof d.source === "object" ? d.source.id || d.source.geo : d.source); });
      var tn = simNodes.find(function(n) { return (n.id || n.geo) === (typeof d.target === "object" ? d.target.id || d.target.geo : d.target); });
      showTooltip(
        "<strong>" + (sn ? sn.country_name : "?") + " - " + (tn ? tn.country_name : "?") + "</strong>" +
        "<br>Joint articles: " + fmtNum(d.weight), event
      );
    })
    .on("mouseout", hideTooltip);

  // Draw nodes
  netNodes = netG.selectAll(".net-node")
    .data(simNodes)
    .join("circle")
    .attr("class", "net-node")
    .attr("r", function(d) { return sizeScale(d.hub_strength); })
    .attr("fill", function(d) { return d.adoption_2022 != null ? nodeColour(d.adoption_2022) : COLOURS.missing; })
    .attr("stroke", "#1b2130").attr("stroke-width", 1.5)
    .attr("cursor", "pointer")
    .on("mouseover", function(event, d) {
      showTooltip(
        "<strong>" + d.country_name + "</strong>" +
        "<br>Hub strength: " + fmtNum(d.hub_strength) +
        "<br>Degree: " + d.degree +
        "<br>Adoption 2022: " + fmtPct(d.adoption_2022), event
      );
    })
    .on("mouseout", hideTooltip)
    .on("click", function(event, d) {
      var geo = d.id || d.geo;
      if (state.selectedCountry === geo) {
        dispatch.call("countryDeselected");
      } else {
        dispatch.call("countrySelected", null, geo);
      }
    })
    .call(d3.drag()
      .on("start", function(event, d) {
        if (!event.active) netSimulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on("drag", function(event, d) {
        d.fx = event.x; d.fy = event.y;
      })
      .on("end", function(event, d) {
        if (!event.active) netSimulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
    );

  // Labels
  netLabels = netG.selectAll(".net-label")
    .data(simNodes)
    .join("text")
    .attr("class", "net-label node-label")
    .text(function(d) { return d.geo; })
    .attr("dy", function(d) { return -sizeScale(d.hub_strength) - 4; });

  // Tick function
  netSimulation.on("tick", function() {
    netLinks
      .attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });

    netNodes
      .attr("cx", function(d) { return d.x = Math.max(25, Math.min(netWidth - 25, d.x)); })
      .attr("cy", function(d) { return d.y = Math.max(25, Math.min(netHeight - 25, d.y)); });

    netLabels
      .attr("x", function(d) { return d.x; })
      .attr("y", function(d) { return d.y; });
  });

  // Title
  netSvg.append("text").attr("class", "chart-title")
    .attr("x", 12).attr("y", 18)
    .text("Robotics research collaboration network");

  // Legend
  drawNetworkLegend(sizeScale, nodeColour, adoptExt);
}

function drawNetworkLegend(sizeScale, nodeColour, adoptExt) {
  var legG = netSvg.append("g").attr("transform", "translate(" + (netWidth - 200) + "," + (netHeight - 80) + ")");

  // Size legend (compact row)
  legG.append("text").attr("class", "legend-title").attr("y", 0).text("Node size: hub strength");
  var sizes = [sizeScale.domain()[0], Math.round((sizeScale.domain()[0] + sizeScale.domain()[1]) / 2), sizeScale.domain()[1]];
  sizes.forEach(function(v, i) {
    legG.append("circle").attr("cx", i * 40 + 10).attr("cy", 18).attr("r", Math.min(sizeScale(v), 10))
      .attr("fill", "none").attr("stroke", "#9aa6be").attr("stroke-width", 1);
    legG.append("text").attr("x", i * 40 + 10).attr("y", 34).attr("text-anchor", "middle")
      .attr("font-size", 12).attr("fill", "#9aa6be").text(fmtNum(v));
  });

  // Colour legend (gradient bar, compact)
  legG.append("text").attr("class", "legend-title").attr("y", 50).text("Colour: adoption (%)");
  var gradW = 80;
  var defs = netSvg.append("defs");
  var grad = defs.append("linearGradient").attr("id", "net-legend-grad");
  grad.append("stop").attr("offset", "0%").attr("stop-color", SCALES.node(0.1));
  grad.append("stop").attr("offset", "100%").attr("stop-color", SCALES.node(0.9));
  legG.append("rect").attr("y", 56).attr("width", gradW).attr("height", 8).attr("fill", "url(#net-legend-grad)").attr("rx", 2);
  legG.append("text").attr("y", 76).attr("font-size", 12).attr("fill", "#9aa6be").text("0%");
  legG.append("text").attr("x", gradW).attr("y", 76).attr("text-anchor", "end").attr("font-size", 12).attr("fill", "#9aa6be").text(d3.format(".0f")(adoptExt[1] || 20) + "%");
}

function highlightNetworkNode(geo) {
  if (!netNodes) return;
  netNodes
    .attr("opacity", function(d) {
      if ((d.id || d.geo) === geo) return 1;
      // Check if connected
      var connected = netLinks.data().some(function(l) {
        var sg = typeof l.source === "object" ? (l.source.id || l.source.geo) : l.source;
        var tg = typeof l.target === "object" ? (l.target.id || l.target.geo) : l.target;
        return (sg === geo && tg === (d.id || d.geo)) || (tg === geo && sg === (d.id || d.geo));
      });
      return connected ? 0.8 : 0.2;
    })
    .classed("selected", function(d) { return (d.id || d.geo) === geo; });

  netLinks
    .attr("opacity", function(l) {
      var sg = typeof l.source === "object" ? (l.source.id || l.source.geo) : l.source;
      var tg = typeof l.target === "object" ? (l.target.id || l.target.geo) : l.target;
      return (sg === geo || tg === geo) ? 0.8 : 0.1;
    })
    .attr("stroke", function(l) {
      var sg = typeof l.source === "object" ? (l.source.id || l.source.geo) : l.source;
      var tg = typeof l.target === "object" ? (l.target.id || l.target.geo) : l.target;
      return (sg === geo || tg === geo) ? COLOURS.linkHighlight : COLOURS.linkDefault;
    });
}

function resetNetworkHighlight() {
  if (!netNodes) return;
  netNodes.attr("opacity", 1).classed("selected", false);
  netLinks.attr("opacity", 0.5).attr("stroke", COLOURS.linkDefault);
}

function updateNetworkThreshold(threshold) {
  if (!window.appData || !netG) return;
  var allLinks = window.appData.links;
  var filteredLinks = allLinks.filter(function(l) { return l.weight >= threshold; });

  // Re-init with new threshold
  state.networkThreshold = threshold;
  initNetwork(window.appData.nodes, window.appData.links);
}

function showNetwork() {
  d3.select("#network-container").classed("hidden", false);
}

function hideNetwork() {
  d3.select("#network-container").classed("hidden", true);
}
