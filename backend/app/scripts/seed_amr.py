"""Seed the AMR Surveillance project with geospatial data + an OSM-map dashboard.

Generates antimicrobial-resistance facility data with real Nigerian lat/lon, then
builds charts (incl. an OpenStreetMap point map via Leaflet) and a published
dashboard inside the 'AMR Surveillance' project.

Run with the API up:  python -m app.scripts.seed_amr
"""

from __future__ import annotations

import random

import httpx
from faker import Faker

API = "http://localhost:8000/api/v1"
fake = Faker()
Faker.seed(7)
random.seed(7)

# Approx state centroids (lat, lon) — facilities jitter around these.
STATES = {
    "Kano": (12.00, 8.52),
    "Kebbi": (11.50, 4.20),
    "Sokoto": (13.06, 5.24),
    "Katsina": (12.99, 7.60),
    "Kaduna": (10.52, 7.44),
    "Lagos": (6.52, 3.38),
    "Oyo": (8.16, 3.61),
    "Borno": (11.83, 13.15),
}
ORGANISMS = [
    "E. coli",
    "K. pneumoniae",
    "S. aureus",
    "P. aeruginosa",
    "Salmonella spp.",
    "A. baumannii",
]
MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]


def build_rows():
    cols = [
        "month",
        "state",
        "lga",
        "facility",
        "lat",
        "lon",
        "organism",
        "samples_tested",
        "resistant_count",
        "resistance_rate",
    ]
    rows = []
    for state, (clat, clon) in STATES.items():
        for f in range(3):
            lat = round(clat + random.uniform(-0.4, 0.4), 5)
            lon = round(clon + random.uniform(-0.4, 0.4), 5)
            facility = f"{state} {fake.random_element(['Teaching Hosp.', 'GH', 'PHC'])} {f + 1}"
            lga = fake.city()
            for month in MONTHS:
                organism = random.choice(ORGANISMS)
                samples = random.randint(20, 140)
                resistant = random.randint(0, samples)
                rows.append(
                    [
                        month,
                        state,
                        lga,
                        facility,
                        lat,
                        lon,
                        organism,
                        samples,
                        resistant,
                        round(resistant / samples * 100, 1),
                    ]
                )
    return cols, rows


def main() -> None:
    c = httpx.Client(timeout=120)
    wss = c.get(f"{API}/workspaces").json()
    amr = next((w for w in wss if w["name"] == "AMR Surveillance"), None)
    if not amr:
        amr = c.post(
            f"{API}/workspaces",
            json={
                "name": "AMR Surveillance",
                "description": "Antimicrobial resistance surveillance",
            },
        ).json()
    ws = amr["id"]

    if any(
        d["name"] == "AMR Surveillance Data"
        for d in c.get(f"{API}/datasets?workspace_id={ws}").json()
    ):
        print("AMR project already seeded — skipping.")
        return

    cols, rows = build_rows()
    ds = c.post(
        f"{API}/datasets/from-records",
        json={
            "workspace_id": ws,
            "name": "AMR Surveillance Data",
            "columns": cols,
            "rows": rows,
            "source": "surveillance",
        },
    ).json()
    slug = ds["slug"]
    print(f"dataset: {ds['full_name']} ({ds['row_count']} rows)")

    def chart(name, viz, sql, spec):
        return c.post(
            f"{API}/charts",
            json={"workspace_id": ws, "name": name, "viz_type": viz, "sql": sql, "spec": spec},
        ).json()["id"]

    geo = chart(
        "Resistance hotspots (map)",
        "geomap",
        f"SELECT facility, avg(lat) AS lat, avg(lon) AS lon, round(avg(resistance_rate),1) AS resistance_rate FROM {slug} GROUP BY facility",
        {"lat": "lat", "lon": "lon", "value": "resistance_rate", "label": "facility"},
    )
    by_state = chart(
        "Resistance by state",
        "column",
        f"SELECT state, round(avg(resistance_rate),1) AS resistance_rate FROM {slug} GROUP BY state ORDER BY resistance_rate DESC",
        {"x": "state", "y": "resistance_rate"},
    )
    trend = chart(
        "Resistance trend",
        "line",
        f"SELECT month, round(avg(resistance_rate),1) AS resistance_rate FROM {slug} GROUP BY month ORDER BY month",
        {"x": "month", "y": "resistance_rate"},
    )
    organisms = chart(
        "Resistant cases by organism",
        "bar",
        f"SELECT organism, sum(resistant_count) AS resistant_count FROM {slug} GROUP BY organism ORDER BY resistant_count DESC",
        {"x": "organism", "y": "resistant_count"},
    )
    tbl = chart(
        "Facility detail",
        "table",
        f"SELECT state, facility, organism, samples_tested, resistant_count, resistance_rate FROM {slug} ORDER BY resistance_rate DESC LIMIT 60",
        {"x": "state", "y": "resistance_rate"},
    )

    d = c.post(
        f"{API}/dashboards",
        json={
            "workspace_id": ws,
            "title": "AMR Geospatial Surveillance",
            "description": "Antimicrobial resistance hotspots across Nigerian facilities, on an OpenStreetMap base layer.",
        },
    ).json()
    tiles = [
        (geo, 0, 0, 7, 9),
        (by_state, 7, 0, 5, 5),
        (trend, 7, 5, 5, 4),
        (organisms, 0, 9, 6, 5),
        (tbl, 6, 9, 6, 5),
    ]
    for cid, x, y, w, h in tiles:
        c.post(
            f"{API}/dashboards/{d['id']}/tiles",
            json={"chart_id": cid, "layout": {"x": x, "y": y, "w": w, "h": h}},
        )
    c.patch(f"{API}/dashboards/{d['id']}", json={"status": "published"})
    print("dashboard: AMR Geospatial Surveillance (published) — 5 tiles incl. OSM map")
    print("\nAMR SEED COMPLETE ✅")


if __name__ == "__main__":
    main()
