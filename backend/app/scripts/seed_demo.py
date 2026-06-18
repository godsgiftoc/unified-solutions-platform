"""Seed realistic demo content via the running API.

Generates a Faker-based facility-survey dataset, builds charts across every viz
type (column/bar/line/area/pie/scatter/table) from SQL, creates a chart from a
notebook (load_dataset → save_chart), and assembles three dashboards — two
published and one left as a draft.

Run with the API up:  python -m app.scripts.seed_demo
"""

from __future__ import annotations

import random

import httpx
from faker import Faker

API = "http://localhost:8000/api/v1"
fake = Faker()
Faker.seed(42)
random.seed(42)

STATES = {
    "Kano": ["Dala", "Fagge", "Nassarawa", "Tarauni"],
    "Kebbi": ["Argungu", "Bagudo", "Yauri", "Zuru"],
    "Sokoto": ["Gada", "Illela", "Bodinga", "Kebbe"],
    "Katsina": ["Kafur", "Mani", "Batsari", "Dutsi"],
    "Kaduna": ["Zaria", "Kajuru", "Sabon Gari", "Giwa"],
}
MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]


def build_rows() -> tuple[list[str], list[list]]:
    cols = [
        "month",
        "state",
        "lga",
        "facility",
        "anc_visits",
        "deliveries",
        "immunization_rate",
        "malaria_cases",
        "stockout_days",
        "staff_count",
    ]
    rows = []
    for state, lgas in STATES.items():
        for lga in lgas:
            facility = f"{lga} {fake.random_element(['PHC', 'General Hospital', 'Health Post'])}"
            base_visits = random.randint(60, 220)
            staff = random.randint(4, 22)
            for i, month in enumerate(MONTHS):
                visits = max(0, int(base_visits + i * random.randint(-15, 35)))
                rows.append(
                    [
                        month,
                        state,
                        lga,
                        facility,
                        visits,
                        int(visits * random.uniform(0.45, 0.75)),
                        round(random.uniform(55, 96), 1),
                        random.randint(0, 40),
                        random.randint(0, 6),
                        staff,
                    ]
                )
    return cols, rows


def main() -> None:
    c = httpx.Client(timeout=120)
    ws = c.get(f"{API}/workspaces").json()[0]["id"]

    # Idempotency: skip if already seeded.
    existing = {d["name"] for d in c.get(f"{API}/datasets?workspace_id={ws}").json()}
    if "Health Facility Survey" in existing:
        print("Demo already seeded — skipping.")
        return

    cols, rows = build_rows()
    ds = c.post(
        f"{API}/datasets/from-records",
        json={"workspace_id": ws, "name": "Health Facility Survey", "columns": cols, "rows": rows},
    ).json()
    slug = ds["slug"]
    print(f"dataset: {ds['name']} ({ds['row_count']} rows) -> {slug}")

    def chart(name, viz, sql, x, y):
        ch = c.post(
            f"{API}/charts",
            json={
                "workspace_id": ws,
                "name": name,
                "viz_type": viz,
                "sql": sql,
                "spec": {"x": x, "y": y},
            },
        ).json()
        return ch["id"]

    charts = {
        "anc_trend": chart(
            "ANC visits trend",
            "area",
            f"SELECT month, sum(anc_visits) AS anc_visits FROM {slug} GROUP BY month ORDER BY month",
            "month",
            "anc_visits",
        ),
        "deliveries_state": chart(
            "Deliveries by state",
            "column",
            f"SELECT state, sum(deliveries) AS deliveries FROM {slug} GROUP BY state ORDER BY deliveries DESC",
            "state",
            "deliveries",
        ),
        "immun_state": chart(
            "Immunization coverage by state",
            "bar",
            f"SELECT state, round(avg(immunization_rate),1) AS immunization_rate FROM {slug} GROUP BY state ORDER BY immunization_rate DESC",
            "state",
            "immunization_rate",
        ),
        "malaria_share": chart(
            "Malaria cases share",
            "pie",
            f"SELECT state, sum(malaria_cases) AS malaria_cases FROM {slug} GROUP BY state",
            "state",
            "malaria_cases",
        ),
        "visits_vs_del": chart(
            "ANC visits vs deliveries",
            "scatter",
            f"SELECT anc_visits, deliveries FROM {slug}",
            "anc_visits",
            "deliveries",
        ),
        "monthly_del": chart(
            "Monthly deliveries",
            "line",
            f"SELECT month, sum(deliveries) AS deliveries FROM {slug} GROUP BY month ORDER BY month",
            "month",
            "deliveries",
        ),
        "facility_tbl": chart(
            "Facility detail",
            "table",
            f"SELECT state, lga, facility, anc_visits, deliveries, malaria_cases FROM {slug} ORDER BY malaria_cases DESC LIMIT 50",
            "state",
            "anc_visits",
        ),
        "malaria_map": chart(
            "Malaria cases by state (map)",
            "map",
            f"SELECT state, sum(malaria_cases) AS malaria_cases FROM {slug} GROUP BY state",
            "state",
            "malaria_cases",
        ),
        "bubble_lga": chart(
            "ANC vs malaria by LGA (bubble)",
            "bubble",
            f"SELECT lga, sum(anc_visits) AS anc_visits FROM {slug} GROUP BY lga ORDER BY anc_visits DESC",
            "lga",
            "anc_visits",
        ),
        "immun_hist": chart(
            "Immunization rate distribution",
            "histogram",
            f"SELECT immunization_rate FROM {slug}",
            "immunization_rate",
            "immunization_rate",
        ),
    }
    print(f"created {len(charts)} SQL charts across viz types")

    # Chart from a NOTEBOOK
    nb = c.post(f"{API}/notebooks", json={"workspace_id": ws, "name": "Malaria analysis"}).json()
    cell = nb["cells"][0]["id"]
    code = (
        f"df = load_dataset('{slug}')\n"
        "top = df.groupby('lga', as_index=False)['malaria_cases'].sum()"
        ".sort_values('malaria_cases', ascending=False).head(8)\n"
        "save_chart(top, 'Top LGAs by malaria cases', 'column', 'lga', 'malaria_cases')"
    )
    c.patch(f"{API}/notebooks/{nb['id']}/cells/{cell}", json={"source": code})
    c.post(f"{API}/notebooks/{nb['id']}/cells/{cell}/run")
    nb_chart = next(
        (
            x["id"]
            for x in c.get(f"{API}/charts?workspace_id={ws}").json()
            if x["name"] == "Top LGAs by malaria cases"
        ),
        None,
    )
    print("notebook chart:", "ok" if nb_chart else "missing")

    def dashboard(title, desc, tiles, publish):
        d = c.post(
            f"{API}/dashboards", json={"workspace_id": ws, "title": title, "description": desc}
        ).json()
        for i, cid in enumerate(tiles):
            if not cid:
                continue
            layout = {"x": (i % 2) * 6, "y": (i // 2) * 7, "w": 6, "h": 7}
            c.post(f"{API}/dashboards/{d['id']}/tiles", json={"chart_id": cid, "layout": layout})
        if publish:
            c.patch(f"{API}/dashboards/{d['id']}", json={"status": "published"})
        print(
            f"dashboard: {title} ({'published' if publish else 'draft'}) — {len([t for t in tiles if t])} tiles"
        )

    dashboard(
        "Maternal & Child Health — National",
        "Antenatal care, deliveries, and facility performance across northern states.",
        [
            charts["anc_trend"],
            charts["deliveries_state"],
            charts["monthly_del"],
            charts["visits_vs_del"],
        ],
        publish=True,
    )
    dashboard(
        "Immunization Coverage Tracker",
        "Average immunization coverage by state with a facility-level breakdown.",
        [charts["immun_state"], charts["facility_tbl"]],
        publish=True,
    )
    dashboard(
        "Geospatial & Distributions",
        "Choropleth map, bubble comparison, and a histogram of immunization coverage.",
        [charts["malaria_map"], charts["bubble_lga"], charts["immun_hist"], charts["facility_tbl"]],
        publish=True,
    )
    dashboard(
        "Malaria Surveillance (Draft)",
        "Work-in-progress malaria hotspot analysis — not yet published.",
        [charts["malaria_share"], charts["malaria_map"], nb_chart],
        publish=False,
    )
    print("\nDEMO SEED COMPLETE ✅")


if __name__ == "__main__":
    main()
