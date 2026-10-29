"""DEMO MOCK: deterministic simulated "Znižano naslednji teden" promos on real, verified products (V3.1).

  python scripts/catalog/v3/future_promos.py        (run by combine.py after src/data/catalog.json is written)

No real future-promo feed exists; the PDFs contain no next-week prices. This file keeps the existing demo
capability alive on the new data and is labelled `mock: true` everywhere (the UI shows "Demo napoved"):
  - products: SPAR 44/26 offers priced per pack whose validity ends with the general catalog (3. 11.), so the simulated
    promo starts the day after (4. 11.) and never overlaps a verified current price;
  - at most 2 per primary category, 12 in total, picked by a stable hash of the product id (reproducible);
  - simulated price = 85 % of the current price, rounded down to ,x9 cents; regular price / percentage only when the
    current offer prints a regular price (percentage then computed from those two numbers, never invented).
Nothing here is written into catalog.json: simulated prices cannot leak into current prices or savings.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys

from common import ROOT

sys.stdout.reconfigure(encoding="utf-8")
CATALOG = "spar-4426"
PERIOD = {"from": "2026-11-04", "to": "2026-11-10"}


def main():
    data = json.loads((ROOT / "src" / "data" / "catalog.json").read_text(encoding="utf-8"))
    products = {p["id"]: p for p in data["products"]}
    cands = [o for o in data["offers"]
             if o["catalogId"] == CATALOG and o["priceUnit"] == "pack" and o["validity"]["to"] == "2026-11-03" and o["priceCents"] >= 129]
    cands.sort(key=lambda o: hashlib.sha1(o["productId"].encode()).hexdigest())
    per_cat: dict[str, int] = {}
    promos = []
    for o in cands:
        p = products[o["productId"]]
        cat = p["categories"][0]
        if per_cat.get(cat, 0) >= 2:
            continue
        price = (o["priceCents"] * 85 // 100) // 10 * 10 + 9
        if price >= o["priceCents"]:
            price -= 10
        if price <= 0:
            continue
        reg = o["regularPriceCents"]
        promos.append({
            "id": f"fp-{p['id']}-w45", "productId": p["id"], "catalogId": CATALOG,
            "validFrom": PERIOD["from"], "validTo": PERIOD["to"], "priceCents": price,
            "regularPriceCents": reg, "discountPercent": round((reg - price) / reg * 100) if reg else None,
            "spPlusRequired": o["conditions"]["spPlusRequired"],
        })
        per_cat[cat] = per_cat.get(cat, 0) + 1
        if len(promos) == 12:
            break
    out = {"version": 1, "mock": True,
           "note": "DEMO MOCK: simulirane akcije za naslednji teden na resničnih izdelkih iz SPAR 44/26; niso iz kataloga in niso uradna ponudba SPAR (scripts/catalog/v3/future_promos.py).",
           "period": PERIOD, "promos": promos}
    target = ROOT / "src" / "data" / "future-promos.json"
    tmp = target.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, target)
    print(f"future-promos.json: {len(promos)} simulated promos, {PERIOD['from']} – {PERIOD['to']}")


if __name__ == "__main__":
    main()
