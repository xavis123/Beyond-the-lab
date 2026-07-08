Data export script - "Beyond the Lab" DVP
==========================================

This folder reproduces the seven processed CSV files used by the D3 app
(in ../data/) directly from the raw source files (in ./raw/).

Contents
--------
  export_data.py   Python 3 script (standard library only - no packages needed)
  raw/             Raw source data:
                     estat_isoc_eb_p3d_en.csv    Eurostat: robots by country/year/firm size
                     estat_isoc_eb_p3dn2_en.csv  Eurostat: robots by country/year/NACE sector
                     Robotics.csv                ETO: cross-border robotics research collaboration

How to run
----------
  1. Open a terminal in THIS folder (script_export_data).
  2. Run:
       python export_data.py
     (or "py export_data.py" / "python3 export_data.py")
  3. The seven CSVs are (re)written to ../data/.

Outputs (../data/)
------------------
  countries_summary.csv   per-country adoption, change, robot type, and per-year hub strength/degree
  adoption_change.csv     2018->2022 change for countries with both years
  robot_type_2022.csv     industrial vs service adoption, 2022
  size_profile.csv        adoption by enterprise size class (+ EU27 aggregate)
  sector_2022.csv         adoption by NACE sector, 2022
  network_nodes.csv       Q3 overlap-subset nodes (per-year hub strength, degree, adoption)
  network_links.csv       Q3 overlap-subset collaboration edges (per-year weights)

Note: ../data/countries-110m.json is a public-domain Natural Earth / world-atlas
TopoJSON map file used as-is for the map boundaries; it is not produced by this
script.

Method (mirrors the Data Exploration Project R scripts 01/03/04/05)
-------------------------------------------------------------------
  * Eurostat indicators E_RBT / E_RBTI / E_RBTS, unit PC_ENT; aggregate
    geographies (EU27_2020 etc.) excluded from country-level tables.
  * Country-level adoption uses firm-size class GE10.
  * ETO network: keep complete observations for 2018-2022, collapse mirrored
    country pairs (min,max) and take the max num_articles per (year, pair).
  * Hub strength = weighted degree within the Q3 overlap subset: countries in both datasets that have at
    least one collaboration link to another subset country (Finland,
    whose only ETO partner is China, has no in-subset link and is excluded;
    the UK is also excluded as a non-EU country to keep the chart uncluttered),
    computed separately for each of 2018, 2020 and 2022.
