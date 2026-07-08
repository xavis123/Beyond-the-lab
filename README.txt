# Beyond the Lab

An interactive scrollytelling visualisation exploring enterprise robot adoption across Europe between 2018 and 2022, and whether it lines up with how central a country is in cross-border robotics research.

**https://xavis123.github.io/Beyond-the-lab/**

## The questions

1. How has enterprise robot use changed over time across countries?
2. What patterns of enterprise robot use show up across enterprise sizes and sectors?
3. Which countries act as hubs in cross-border robotics research, and does hub status line up with enterprise adoption?

The short answer to Q3: not really. Germany, Italy, France and Spain anchor the research network, but the countries that actually adopt the most robots are often somewhere else. Denmark leads adoption at 11.6% while barely registering as a research hub. The rank correlation between hub strength and adoption is weak and not statistically significant (Spearman's rho = 0.140, p = 0.665, n = 12).

## What's in the story

The piece scrolls through eight beats: an opening hook with three headline numbers, a diverging bar chart of adoption change, a dumbbell chart comparing industrial vs service robots, a grouped bar chart by enterprise size, a sector heatmap, a geographic network of research collaboration, an animated bar-chart race comparing hub strength against adoption across 2018/2020/2022, and an open Explore panel where you can filter the network and switch what the map shows.

## Running it locally

The app loads data with `fetch`, so it needs to be served over HTTP. Opening `index.html` directly (`file://`) won't work, the browser blocks the data requests.

```bash
cd DVP_app
python3 -m http.server 8000
```

Then open `http://localhost:8000`. VS Code's Live Server extension works the same way.

## Stack

Plain HTML, CSS and JavaScript, D3.js v7 for every visual. No framework, no build step, no server-side code. D3 is vendored locally in `lib/`, so the whole thing runs offline once you have the files.

```
DVP_app/
├── index.html
├── css/style.css
├── js/
│   ├── app.js        data loading, init, cross-view dispatch
│   ├── charts.js      all the bar/dumbbell/heatmap/bar-race charts
│   ├── map.js         choropleth + geographic network
│   ├── network.js     network helpers
│   ├── scrolly.js     scroll-driven step triggers
│   └── explore.js     Explore panel controls
├── data/               pre-wrangled CSVs and GeoJSON
├── lib/d3.v7.min.js
└── script_export_data/ Python script that built the data/ files from raw sources
```

Data wrangling happens entirely offline in `script_export_data/export_data.py`. The app itself only ever reads the tidy CSVs in `data/`, nothing is cleaned or reshaped in the browser.

## Data sources

- [Eurostat, ICT usage in enterprises](https://ec.europa.eu/eurostat) — robot adoption by country, enterprise size and sector (tables `isoc_eb_p3d`, `isoc_eb_p3dn2`), 2018/2020/2022
- [Emerging Technology Observatory](https://eto.tech) — cross-border robotics research collaboration, filtered to completed articles in the Robotics field
- [Natural Earth](https://www.naturalearthdata.com) — country boundaries, baked into `data/countries-geo.json` ahead of time so there's no runtime dependency on topojson-client

## Notes

- France's 2022 figure carries a Eurostat break-in-series flag and is kept, with the caveat noted in the story.
- The Q3 network subset is the 12 countries that appear in both datasets and connect to at least one other country in that subset: AT, BE, DE, DK, ES, FR, IT, NL, PT, RO, SE, TR.

## Background

Built for FIT5147 Data Exploration and Visualisation at Monash University, as the follow-up to a Data Exploration Project on the same dataset. The design went through the Five Design Sheet process before landing on a martini-glass structure: a guided scroll up front that opens into free exploration.

## Author

Thanh Nghi Le
