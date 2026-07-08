#!/usr/bin/env python3
"""
Export all processed data files for the DVP "Beyond the Lab" D3 app.

Reads three raw source files from ./raw/ and writes seven CSVs to ../data/:
  - Eurostat ICT-in-enterprises survey:
      raw/estat_isoc_eb_p3d_en.csv    (robots by country / year / firm size)
      raw/estat_isoc_eb_p3dn2_en.csv  (robots by country / year / NACE sector)
  - Emerging Technology Observatory (ETO):
      raw/Robotics.csv                (cross-border robotics research collaboration)

Method mirrors the Data Exploration Project R scripts (01_wrangling.R, 03, 04, 05):
  * indicators E_RBT / E_RBTI / E_RBTS, unit PC_ENT, aggregate geographies excluded
  * a flagged Eurostat value is dropped, except France 2022 flag "b" which is kept
  * hub strength = weighted degree in the overlap subset, per year (collapse mirrored
    country pairs and take the max num_articles per (year, pair))

Run:  python export_data.py
(no arguments; paths are relative to this script)
"""
import csv, os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW  = os.environ.get("RAW_DIR", os.path.join(HERE, "raw"))
OUT  = os.environ.get("OUT_DIR", os.path.join(HERE, "..", "data"))

AGG = {"EU27_2020", "EU27_2007", "EU28", "EU15", "EA", "EA19", "EA20"}

NAME = {  # Eurostat geo -> country name
 "AL":"Albania","AT":"Austria","BA":"Bosnia and Herzegovina","BE":"Belgium","BG":"Bulgaria",
 "CY":"Cyprus","CZ":"Czechia","DE":"Germany","DK":"Denmark","EE":"Estonia","EL":"Greece",
 "ES":"Spain","FI":"Finland","FR":"France","HR":"Croatia","HU":"Hungary","IE":"Ireland",
 "IT":"Italy","LT":"Lithuania","LU":"Luxembourg","LV":"Latvia","ME":"Montenegro",
 "MK":"North Macedonia","MT":"Malta","NL":"Netherlands","NO":"Norway","PL":"Poland",
 "PT":"Portugal","RO":"Romania","RS":"Serbia","SE":"Sweden","SI":"Slovenia","SK":"Slovakia",
 "TR":"Turkey","UK":"United Kingdom"}

LONLAT = {  # approximate country centroids (lon, lat) for the map
 "AT":(14.55,47.52),"BA":(17.68,43.92),"BE":(4.47,50.5),"BG":(25.49,42.73),"CY":(33.43,35.13),
 "CZ":(15.47,49.82),"DE":(10.45,51.17),"DK":(9.5,56.26),"EE":(25.01,58.6),"EL":(21.82,39.07),
 "ES":(-3.75,40.46),"FI":(25.75,61.92),"FR":(2.21,46.23),"HR":(15.98,45.1),"HU":(19.5,47.16),
 "IE":(-8.24,53.41),"IT":(12.57,41.87),"LT":(23.88,55.17),"LU":(6.13,49.82),"LV":(24.6,56.88),
 "ME":(19.37,42.71),"MK":(21.75,41.51),"MT":(14.38,35.94),"NL":(5.29,52.13),"NO":(8.47,60.47),
 "PL":(19.15,51.92),"PT":(-8.22,39.4),"RO":(24.97,45.94),"RS":(21.01,44.02),"SE":(18.64,60.13),
 "SI":(14.99,46.15),"SK":(19.7,48.67),"TR":(35.24,38.96),"UK":(-3.44,55.38)}

SIZE_LABEL = {"10-49":"Small (10-49 employees)","50-249":"Medium (50-249 employees)","GE250":"Large (250+ employees)"}
SECTOR = {"C":"Manufacturing","G":"Wholesale & retail","J":"Information & communication",
          "F":"Construction","N":"Administrative services","H":"Transport & storage",
          "I":"Accommodation & food","ICT":"ICT sector"}

NAME2GEO = {  # ETO country name -> Eurostat geo (mirror of DEP 01_wrangling.R)
 "Albania":"AL","Austria":"AT","Belgium":"BE","Bosnia and Herzegovina":"BA","Bosnia & Herzegovina":"BA",
 "Bulgaria":"BG","Croatia":"HR","Cyprus":"CY","Czech Republic":"CZ","Czechia":"CZ","Denmark":"DK",
 "Estonia":"EE","Finland":"FI","France":"FR","Germany":"DE","Greece":"EL","Hungary":"HU","Ireland":"IE",
 "Italy":"IT","Latvia":"LV","Lithuania":"LT","Luxembourg":"LU","Malta":"MT","Montenegro":"ME",
 "Netherlands":"NL","North Macedonia":"MK","Norway":"NO","Poland":"PL","Portugal":"PT","Romania":"RO",
 "Serbia":"RS","Slovakia":"SK","Slovenia":"SI","Spain":"ES","Sweden":"SE","Turkey":"TR","United Kingdom":"UK"}

YEARS = [2018, 2020, 2022]

def is_france_b_keep(geo, year, flag):
    return geo == "FR" and year == 2022 and flag == "b"

def read_eurostat(fname):
    rows = []
    with open(os.path.join(RAW, fname), newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows

# ---------- Eurostat p3d: country x year x size ----------
p3d = read_eurostat("estat_isoc_eb_p3d_en.csv")

def valid(r):
    """Keep any observation that has a usable value."""
    return r["OBS_VALUE"] not in (None, "", ":")

def collect(indic, size_emp):
    """{geo: {year: value_str}} for one indicator and firm-size class."""
    out = {}
    for r in p3d:
        if r["indic_is"] != indic or r["unit"] != "PC_ENT" or r["size_emp"] != size_emp:
            continue
        if r["geo"] in AGG or not valid(r):
            continue
        out.setdefault(r["geo"], {})[int(r["TIME_PERIOD"])] = float(r["OBS_VALUE"])
    return out

rbt   = collect("E_RBT",  "GE10")    # any robot, 10+ employees
rbti  = collect("E_RBTI", "GE10")    # industrial
rbts  = collect("E_RBTS", "GE10")    # service
size_data = {sz: collect("E_RBT", sz) for sz in ["10-49", "50-249", "GE250"]}

# EU27 aggregate by size (kept only for the size view)
eu_size = {sz: {} for sz in ["10-49", "50-249", "GE250"]}
for r in p3d:
    if r["indic_is"]=="E_RBT" and r["unit"]=="PC_ENT" and r["geo"]=="EU27_2020" and r["size_emp"] in eu_size:
        flag=(r["OBS_FLAG"] or "").strip()
        if not flag and r["OBS_VALUE"] not in (None,"",":"):
            eu_size[r["size_emp"]][int(r["TIME_PERIOD"])] = float(r["OBS_VALUE"])

# ---------- ETO network: per-year hub strength / links / degree ----------
def truthy(c): return str(c) in ("TRUE","True","true","1")
pairyear = {}
with open(os.path.join(RAW,"Robotics.csv"), newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        y = int(r["year"])
        if y < 2018 or y > 2022 or not truthy(r["complete"]):
            continue
        a, b = r["country1"], r["country2"]
        pa, pb = min(a,b), max(a,b)
        if pa == pb:
            continue
        pairyear.setdefault((y,pa,pb), []).append(float(r["num_articles"]))

# Q3 overlap subset: every country present in BOTH the ETO collaboration network
# (years 2018/2020/2022) AND the Eurostat robot-adoption data. A country does not
# need data in all three years - having any qualifying year is enough.
eto_geos = set()
for (y, pa, pb) in pairyear:
    if y not in YEARS:
        continue
    ga, gb = NAME2GEO.get(pa), NAME2GEO.get(pb)
    if ga: eto_geos.add(ga)
    if gb: eto_geos.add(gb)
# UK is dropped (no longer an EU member). Remove excluded countries FIRST, then
# keep only countries that still collaborate with another country inside the
# subset. Removing a country can isolate its only partner, so iterate until stable
# (e.g. Greece's only in-subset partner was the UK, so it is dropped too; Finland's
#  only ETO partner is China, outside the subset, so it never qualifies).
EXCLUDE = {"UK"}
candidate = (set(rbt.keys()) & eto_geos) - EXCLUDE
while True:
    deg = {}
    for (y, pa, pb), vals in pairyear.items():
        if y not in YEARS:
            continue
        ga, gb = NAME2GEO.get(pa), NAME2GEO.get(pb)
        if ga in candidate and gb in candidate and max(vals) > 0:
            deg[ga] = deg.get(ga, 0) + 1
            deg[gb] = deg.get(gb, 0) + 1
    isolated = [g for g in candidate if deg.get(g, 0) == 0]
    if not isolated:
        break
    candidate -= set(isolated)
overlap = sorted(candidate)

linkw = {y:{} for y in YEARS}; hub = {y:{} for y in YEARS}; deg = {y:{} for y in YEARS}
for (y,pa,pb),vals in pairyear.items():
    if y not in YEARS: continue
    ga, gb = NAME2GEO.get(pa), NAME2GEO.get(pb); w = max(vals)
    if ga in overlap and gb in overlap and w > 0:
        linkw[y][tuple(sorted([ga,gb]))] = w
for y in YEARS:
    for (a,b),w in linkw[y].items():
        hub[y][a]=hub[y].get(a,0)+w; hub[y][b]=hub[y].get(b,0)+w
        deg[y][a]=deg[y].get(a,0)+1; deg[y][b]=deg[y].get(b,0)+1

# ---------- write helpers ----------
os.makedirs(OUT, exist_ok=True)
def w(name): return open(os.path.join(OUT,name),"w",newline="",encoding="utf-8")
def writer(f): return csv.writer(f, lineterminator="\n")

# country list for the summary: any non-aggregate geo with E_RBT GE10 in any year
summary_geos = sorted(g for g in rbt.keys() if g not in AGG)

# ===== countries_summary.csv =====
with w("countries_summary.csv") as f:
    wr = writer(f)
    wr.writerow(["geo","country_name","adoption_2018","adoption_2020","adoption_2022","change_18_22",
                 "industrial_2018","industrial_2020","industrial_2022","service_2018","service_2020","service_2022",
                 "overlap_q3","flag_note","longitude","latitude",
                 "hub_2018","hub_2020","hub_2022","degree_2018","degree_2020","degree_2022"])
    for g in summary_geos:
        a18,a20,a22 = rbt[g].get(2018,""), rbt[g].get(2020,""), rbt[g].get(2022,"")
        change = (float(a22)-float(a18)) if (a18!="" and a22!="") else ""
        ov = g in overlap
        note = "France 2022 carries Eurostat flag b (break in series)" if g=="FR" else ""
        lon,lat = LONLAT.get(g,("",""))
        ind = rbti.get(g,{}); svc = rbts.get(g,{})
        wr.writerow([g, NAME.get(g,g), a18,a20,a22, change,
                     ind.get(2018,""),ind.get(2020,""),ind.get(2022,""),
                     svc.get(2018,""),svc.get(2020,""),svc.get(2022,""),
                     "True" if ov else "False", note, lon, lat,
                     int(hub[2018].get(g,0)) if ov else "", int(hub[2020].get(g,0)) if ov else "", int(hub[2022].get(g,0)) if ov else "",
                     deg[2018].get(g,0) if ov else "", deg[2020].get(g,0) if ov else "", deg[2022].get(g,0) if ov else ""])

# ===== adoption_change.csv (countries with full 3-year coverage) =====
chg = []
for g in sorted(rbt):
    a18,a22 = rbt[g].get(2018), rbt[g].get(2022)
    if a18 is None or a22 is None: continue
    chg.append([g, float(a22)-float(a18), a18, a22])
chg.sort(key=lambda x:-x[1])
inc = set(r[0] for r in chg[:5]); dec = set(r[0] for r in chg[-5:])
with w("adoption_change.csv") as f:
    wr = writer(f)
    wr.writerow(["geo","country_name","adoption_2018","adoption_2022","change_18_22","flag_note","change_group"])
    for g,c,a18,a22 in chg:
        if g in inc: grp="top_increase"
        elif g in dec: grp="top_decrease"
        else: grp="increase" if c>=0 else "decrease"
        note = "France 2022 carries Eurostat flag b (break in series)" if g=="FR" else ""
        wr.writerow([g, NAME.get(g,g), a18, a22, c, note, grp])

# ===== robot_type_2022.csv (countries with both industrial and service in 2022) =====
with w("robot_type_2022.csv") as f:
    wr = writer(f)
    wr.writerow(["geo","country_name","industrial_2022","service_2022","gap_industrial_service"])
    for g in summary_geos:
        i = rbti.get(g,{}).get(2022); sv = rbts.get(g,{}).get(2022)
        if i is None or sv is None: continue
        wr.writerow([g, NAME.get(g,g), i, sv, float(i)-float(sv)])

# ===== size_profile.csv (non-aggregate geos + EU27_2020) =====
with w("size_profile.csv") as f:
    wr = writer(f)
    wr.writerow(["geo","country_name","year","size_class","size_label","value"])
    size_all = {}
    for sz in ["10-49","50-249","GE250"]:
        for g,yd in size_data[sz].items():
            for y,v in yd.items():
                size_all.setdefault(g,{})[(y,sz)] = v
    for sz,yd in eu_size.items():
        for y,v in yd.items():
            size_all.setdefault("EU27_2020",{})[(y,sz)] = v
    ordered = sorted(g for g in size_all if g != "EU27_2020")
    if "EU27_2020" in size_all: ordered.append("EU27_2020")
    for g in ordered:
        nm = "EU27" if g == "EU27_2020" else NAME.get(g,g)
        for y in YEARS:
            for sz in ["10-49","50-249","GE250"]:
                if (y,sz) in size_all[g]:
                    wr.writerow([g, nm, y, sz, SIZE_LABEL[sz], size_all[g][(y,sz)]])

# ===== sector_country_year.csv (broad NACE sectors, per country, 2018/2020/2022) =====
# Drives the Q2 sector heatmap: the European default is the cross-country mean per
# (sector, year); selecting a country on the map shows that country's own values.
p3dn2 = read_eurostat("estat_isoc_eb_p3dn2_en.csv")
with w("sector_country_year.csv") as f:
    wr = writer(f)
    wr.writerow(["geo","country_name","sector_code","sector_label","year","value"])
    rows=[]
    for r in p3dn2:
        if r["indic_is"]!="E_RBT" or r["unit"]!="PC_ENT" or r["size_emp"]!="GE10": continue
        y=int(r["TIME_PERIOD"])
        if y not in (2018,2020,2022) or r["geo"] in AGG: continue
        code=r["nace_r2"]
        if code not in SECTOR: continue
        if r["OBS_VALUE"] in (None,"",":"): continue
        rows.append([r["geo"], NAME.get(r["geo"],r["geo"]), code, SECTOR[code], y, float(r["OBS_VALUE"])])
    rows.sort(key=lambda x:(x[0], list(SECTOR).index(x[2]), x[4]))
    for row in rows: wr.writerow(row)

# ===== network_nodes.csv =====
with w("network_nodes.csv") as f:
    wr = writer(f)
    wr.writerow(["id","geo","country_name","hub_2018","hub_2020","hub_2022",
                 "degree_2018","degree_2020","degree_2022","adoption_2022","longitude","latitude","overlap_q3"])
    for g in overlap:
        lon,lat = LONLAT.get(g,("",""))
        wr.writerow([g,g,NAME.get(g,g), int(hub[2018].get(g,0)),int(hub[2020].get(g,0)),int(hub[2022].get(g,0)),
                     deg[2018].get(g,0),deg[2020].get(g,0),deg[2022].get(g,0),
                     rbt.get(g,{}).get(2022,""), lon, lat, "True"])

# ===== network_links.csv =====
allpairs=set()
for y in YEARS: allpairs |= set(linkw[y].keys())
with w("network_links.csv") as f:
    wr = writer(f)
    wr.writerow(["source","target","source_geo","target_geo","weight_2018","weight_2020","weight_2022"])
    for (a,b) in sorted(allpairs):
        wr.writerow([a,b,a,b, int(linkw[2018].get((a,b),0)), int(linkw[2020].get((a,b),0)), int(linkw[2022].get((a,b),0))])

print("Exported 7 CSV files to", os.path.normpath(OUT))
