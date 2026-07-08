========================================================================
  Beyond the Lab: Enterprise Robot Adoption and Research Collaboration
  in Europe (2018-2022)

  FIT5147 Data Visualisation Project - Part 2
  Author: Thanh Nghi Le (36410543)
  Semester 1, 2026
========================================================================

DESCRIPTION
-----------
An interactive narrative visualisation exploring enterprise robot
adoption patterns across Europe between 2018 and 2022, built using
D3.js v7. The visualisation investigates three research questions:

  1. How has enterprise robot use changed over time across countries?
  2. What patterns of enterprise robot use can be observed across
     enterprise sizes and sectors over time?
  3. Which European countries act as hubs in cross-border robotics
     research, and how does hub status relate to their enterprise
     robot adoption?

The design follows a martini glass narrative structure (Segel and Heer,
2010): a guided scrollytelling story followed by an open explore mode.


HOW TO RUN
----------
This visualisation MUST be served over a local HTTP server. Browsers
block a page opened directly from disk (a file:// address) from reading
the CSV and JSON data files, so opening index.html by double-clicking
it will show an error screen. Serving the folder over http:// fixes it.

Option 1: Python (recommended)
  1. Open a terminal or command prompt.
  2. Change into the DVP_app folder:
       cd path/to/DVP_app
  3. Start a local server:
       python3 -m http.server 8000
     (on Windows you may need: python -m http.server 8000)
  4. Open a browser at:
       http://localhost:8000

Option 2: VS Code Live Server
  1. Open the DVP_app folder in VS Code.
  2. Install the "Live Server" extension if needed.
  3. Right-click index.html and choose "Open with Live Server".

Option 3: Node.js
  1. Install once: npm install -g http-server
  2. From the DVP_app folder, run: http-server -p 8000
  3. Open http://localhost:8000

Do NOT open index.html via the file:// protocol. The app detects a
failed data load and shows on-screen instructions if this happens.


BROWSER COMPATIBILITY
---------------------
Tested on modern browsers supporting ES6+ and SVG:
  - Google Chrome 90+
  - Mozilla Firefox 88+
  - Microsoft Edge 90+
  - Safari 14+


FILE STRUCTURE
--------------
DVP_app/
  index.html              Main HTML page
  README.txt              This file
  css/
    style.css             Stylesheet
  data/
    countries-geo.json    Europe country boundaries (baked GeoJSON)
    countries_summary.csv Country-level summary (adoption, types, hub)
    adoption_change.csv   Paired 2018 to 2022 adoption change
    robot_type_2022.csv   Industrial vs service robots, 2022
    size_profile.csv      Adoption by enterprise size class
    sector_country_year.csv  Adoption by NACE sector, per country and year
    network_nodes.csv     Research network nodes (overlap subset)
    network_links.csv     Research network edges
    sector_2022.csv       Supplementary sector slice (not loaded at run time)
    sector_heatmap.csv    Supplementary heatmap slice (not loaded at run time)
  js/
    utils.js              State, dispatch, colours, helpers
    map.js                Europe choropleth map and geographic network
    charts.js             All chart types (diverging bars, dumbbell,
                          grouped bars, sector heatmap, hub-vs-adoption)
    network.js            Network helpers
    scrolly.js            IntersectionObserver scroll triggers
    explore.js            Explore mode control handlers
    app.js                Data loading, init, dispatch wiring
  lib/
    d3.v7.min.js          D3.js version 7 (local copy)


DATA SOURCES
------------
1. Eurostat ICT Usage in Enterprises Survey
   - Table isoc_eb_p3d: enterprise robot adoption by size class
   - Table isoc_eb_p3dn2: enterprise robot adoption by NACE sector
   - Indicators E_RBT (all robots), E_RBTI (industrial), E_RBTS (service)
   - Unit PC_ENT (percentage of enterprises with 10 or more employees)
   - Years 2018, 2020, 2022
   - URL: https://ec.europa.eu/eurostat

2. Emerging Technology Observatory (ETO)
   - Cross-border robotics research collaboration articles
   - Filtered: field=Robotics, complete=True, years 2018-2022
   - Mirrored country pairs collapsed, max articles kept per pair-year
   - URL: https://eto.tech

3. Map boundaries
   - Natural Earth administrative boundaries, converted to GeoJSON
     and baked into countries-geo.json (no run-time dependency)
   - URL: https://www.naturalearthdata.com


LIBRARIES
---------
- D3.js v7 (BSD 3-Clause License)
  https://d3js.org

D3 is the only visualisation library used and is included locally in
the lib/ folder. No internet connection is required to run the app.


NOTES
-----
- France 2022 data carries Eurostat flag "b" (break in series) and is
  retained with appropriate caution noted in the visualisation.
- The Q3 overlap subset is the set of countries present in BOTH the
  Eurostat and ETO datasets with valid data and at least one within-
  subset collaboration. This resolves to 12 countries (AT, BE, DE, DK,
  ES, FR, IT, NL, PT, RO, SE, TR). T