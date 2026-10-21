# -*- coding: utf-8 -*-
"""FIX 7 – additional verified products for INTERSPAR 14/26 (loaded by build_catalog_v2.py via exec in its namespace).
Same rules as extra_products_spar.py. INTERSPAR pp. 4–7 (appliances, kitchenware, textiles) are not catalogued: their offers run until
20. 10. / 3. 11. 2026, i.e. beyond the catalog's validTo (13. 10.), which the data model does not allow."""

IQ = dict(cat="interspar-1426")

q("vanilijeva-pasta-bourbon-50g", 2, "Bio vanilijeva pasta", NATUR, "50 g", (50, "g"), ["pekovsko", "osnovna-zivila", "sladko"], 199, 269, 26, box=(0.505, 0.685, 0.668, 0.94),
  line="Natur*pur", descriptor="bourbon", aliases=["vanilija", "vanilije", "vanilijeva pasta", "pasta", "bourbon", "bio vanilija", "peka", "natur pur"],
  printed="BIO VANILIJEVA PASTA bourbon, 50 g", **IQ)
q("polnilo-za-peko-viki-600g", 3, "Polnilo za peko", "Viki", "600 g", (600, "g"), ["sladko", "pekovsko", "osnovna-zivila"], 369, 489, 24, box=(0.585, 0.33, 0.93, 0.47),
  pc="PC 4,89", descriptor="kakavov kremni proizvod, termostabilen", aliases=["polnilo", "polnilo za peko", "kakavovo polnilo", "viki", "bake & fill", "krema za peko", "peka"],
  printed="POLNILO ZA PEKO kakavov kremni proizvod, termostabilen, Viki, 600 g", **IQ)
q("polnilo-za-peko-presad-marelicno-700g", 3, "Polnilo za peko marelično", "Presad", "700 g", (700, "g"), ["sladko", "pekovsko", "osnovna-zivila"], 335, 449, 25, box=(0.375, 0.315, 0.545, 0.56),
  pc="PC 4,49", aliases=["polnilo", "polnilo za peko", "marelično polnilo", "marelica", "presad", "marmelada", "peka"], printed="POLNILO ZA PEKO marelično, Presad, 700 g", **IQ)
q("pecena-piscancja-prsa-1kg", 8, "Pečena piščančja prsa", "SPAR to Go", "1 kg", (1, "kg"), ["meso", "vecerja"], 1259, 1399, 10, box=(0.355, 0.479, 0.655, 0.682), unit="kg",
  aliases=["piščančja prsa", "pečena prsa", "pečen piščanec", "piščanec", "piščanca", "to go", "spar to go", "pečeno meso"],
  printed="PEČENA PIŠČANČJA PRSA SPAR to Go, 1 kg", vextra="Cena velja za 1 kg (natisnjeno »kg« ob ceni).", **IQ)
q("tiramisu-to-go-200g", 8, "Tiramisu", "SPAR to Go", "200 g", (200, "g"), ["sladko"], 229, box=(0.664, 0.479, 0.952, 0.68), unit="kos",
  aliases=["tiramisu", "tiramisuja", "sladica", "sladice", "desert", "to go", "spar to go"], printed="TIRAMISU SPAR to Go, 200 g", vextra="Cena natisnjena »kos« (en kozarček 200 g).", **IQ)
