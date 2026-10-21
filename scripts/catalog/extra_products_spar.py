# -*- coding: utf-8 -*-
"""FIX 7 – additional verified products for SPAR 41/26 (loaded by build_catalog_v2.py via exec in its namespace).

Every entry was read visually on the rendered page AND the build script asserts that the typed price, »redna cena«, »x %« and
»PC« strings are printed inside the placement box in the PDF text layer. Anything ambiguous (multi-buy without per-pack price, group
offers, unreadable pack, price ranges) is NOT here and is listed in docs/DATA.md.
Names `q`, `S_NOTE`, `NATUR` come from build_catalog_v2.py.
"""

KG = "Cena velja za 1 kg (tehtano / postrežno)."
ZF = "ZNIŽANI FAVORITI"

# ---------------- SPAR p. 1 (cover): reference page of the leaflet screenshot
q("svinjska-rebra-eu-1kg", 1, "Svinjska rebra EU", None, "1 kg", (1, "kg"), ["meso", "vecerja"], 379, anchor="SVINJSKA",
  descriptor="s kožo in slanino, postrežno", unit="kg", extra="super cena",
  aliases=["svinjska rebra", "svinjskih reber", "rebra", "rebrca", "svinjina", "svinjsko meso", "postrežna svinjina", "rebra eu"],
  printed="SVINJSKA REBRA EU s kožo in slanino, postrežno, 1 kg", img=("embedded", 8514),
  vextra="Cena velja za 1 kg (postrežno). Natisnjena oznaka »super cena«. Na postrežno svinjino z oznako porekla EU ni možno uveljavljati kuponov in dodatnih popustov.")
q("radler-cola-limeta-union-0-5l", 1, "Radler Cola Limeta", "Union", "0,5 l", (0.5, "l"), ["pijace"], 81, 116, 30, anchor="RADLER", pc="PC 1,16",
  descriptor="pločevinka, 0 % alkohola", unit="kos", minpx=5000, bgforce=True,
  aliases=["radler", "radler cola", "radlerja", "union radler", "radler limeta", "pivo z limeto", "brezalkoholni radler", "cola limeta", "pločevinka"],
  printed="RADLER COLA LIMETA pločevinka, Union, 0,5 l, 0 % alkohola VEČ JE CENEJE OB NAKUPU 24 KOSOV",
  cond="cena 0,81 € za kos velja samo ob nakupu 24 kosov (24 kosov 19,44 €); redna cena za 1 kos 1,16 €",
  vextra="POGOJ: natisnjeno »VEČ JE CENEJE – OB NAKUPU 24 KOSOV«; »redna cena za 1 kos 1,16; cena za 24 kosov 19,44«. Cena 0,81 € za kos velja le ob nakupu 24 kosov, posamezna pločevinka stane 1,16 €.")
q("ovsene-tortilje-vital-320g", 1, "Ovsene tortilje", "SPAR Vital", "320 g", (320, "g"), ["pekovsko", "zajtrk"], 179, box=(0.658, 0.05, 0.828, 0.128),
  line="Vital", aliases=["tortilje", "tortilj", "ovsene tortilje", "wraps", "wrap", "vital", "spar vital", "ovsen wrap"],
  printed="VITAL OVSENE TORTILJE 320 g", img=("embedded", 8499))
q("gorcica-estragon-vital-200g", 1, "Gorčica Estragon", "SPAR Vital", "200 g", (200, "g"), ["omake", "osnovna-zivila"], 99, 129, 23, box=(0.335, 0.350, 0.505, 0.482),
  pc="PC 1,29", line="Vital", aliases=["gorčica", "gorčice", "gorčico", "estragon", "gorčica estragon", "vital", "spar vital", "senf"],
  printed="VITAL GORČICA ESTRAGON 200 g", img=("embedded", 8500))
q("zrebickovo-meso-vital-1kg", 1, "Žrebičkovo meso", "SPAR Vital", "1 kg", (1, "kg"), ["meso", "vecerja"], 1699, 2129, 20, box=(0.815, 0.365, 0.985, 0.51),
  descriptor="zrezki, pakirano", line="Vital", aliases=["žrebiček", "žrebičkovo meso", "konjsko meso", "žrebičje meso", "zrezki", "vital", "spar vital", "žrebičji zrezki"],
  printed="VITAL ŽREBIČKOVO MESO zrezki, pakirano, 1 kg", img=("embedded", 8497))

# ---------------- SPAR p. 4 Sveža izbira
q("borovnice-spar-500g", 4, "Borovnice", "SPAR", "500 g", (500, "g"), ["sadje", "zajtrk"], 699, anchor="BOROVNICE", descriptor="pakirano", line="SPAR",
  aliases=["borovnice", "borovnic", "borovnicam", "borovnicami", "gozdni sadeži", "jagodičevje", "spar borovnice"], printed="SPAR BOROVNICE pakirano, 500 g")
q("mango-1kg", 4, "Mango", None, "1 kg", (1, "kg"), ["sadje"], 299, anchor="MANGO", descriptor="iz sončne Španije", unit="kg",
  aliases=["mango", "manga", "mangu", "mangom", "španski mango"], printed="MANGO iz sončne Španije, 1 kg", vextra=KG)
q("bio-motovilec-100g", 4, "Bio motovilec", NATUR, "100 g", (100, "g"), ["zelenjava", "vecerja"], 99, 139, 28, anchor="BIO MOTOVILEC", descriptor="pakirano",
  line="Natur*pur", aliases=["motovilec", "motovilca", "motovilcu", "solata", "bio solata", "zelena solata", "natur pur"], printed="BIO MOTOVILEC pakirano, 100 g")
q("slovenski-cesen-500g", 4, "Slovenski česen", "SPAR", "500 g", (500, "g"), ["zelenjava", "zacimbe"], 469, 599, 21, anchor="SLOVENSKI ČESEN", descriptor="pakirano",
  line="SPAR", aliases=["česen", "česna", "česnu", "česnom", "slovenski česen", "spar česen"], printed="SLOVENSKI ČESEN pakirano, 500 g")
q("sb-cebula-2kg", 4, "Čebula", "S-BUDGET", "2 kg", (2, "kg"), ["zelenjava", "vecerja"], 179, anchor="ČEBULA", descriptor="pakirano", line="S-BUDGET",
  aliases=["čebula", "čebule", "čebulo", "čebuli", "rumena čebula", "sbudget čebula", "s-budget čebula"], printed="S-BUDGET ČEBULA pakirano, 2 kg", vnote=S_NOTE)
q("slovenski-krompir-za-kuhanje-3-5kg", 4, "Slovenski krompir za kuhanje", "SPAR", "3,5 kg (2,5 kg + 1 kg gratis)", (3.5, "kg"), ["zelenjava", "vecerja", "prilogi"],
  299, anchor="KROMPIR ZA KUHANJE", descriptor="XXL pakiranje, 2,5 kg + 1 kg GRATIS", line="SPAR",
  aliases=["krompir", "krompirja", "krompirju", "krompirjem", "slovenski krompir", "krompir za kuhanje", "xxl krompir"],
  printed="SLOVENSKI KROMPIR ZA KUHANJE XXL pakiranje, 2,5 kg + 1 kg GRATIS", vextra="Cena velja za XXL pakiranje (2,5 kg + 1 kg GRATIS = 3,5 kg).")
q("suhe-marelice-odlicno-250g", 4, "Suhe marelice", "Odlično", "250 g", (250, "g"), ["prigrizki", "sadje"], 329, 468, 29, anchor="SUHE MARELICE", pc="PC 4,68",
  aliases=["marelice", "suhe marelice", "suhih marelic", "suho sadje", "odlično"], printed="SUHE MARELICE Odlično, 250 g")
q("oluscene-pistacije-odlicno-80g", 4, "Oluščene pistacije", "Odlično", "80 g", (80, "g"), ["prigrizki"], 299, 399, 25, anchor="OLUŠČENE", pc="PC 3,99",
  descriptor="suho pražene", aliases=["pistacije", "pistacij", "oluščene pistacije", "oreščki", "orehi", "odlično"], printed="OLUŠČENE PISTACIJE suho pražene, Odlično, 80 g")
q("datlji-brez-koscic-spar-200g", 4, "Datlji brez koščic", "SPAR", "200 g", (200, "g"), ["sadje", "prigrizki"], 99, 116, 14, anchor="DATLJI", pc="PC 1,16",
  line="SPAR", aliases=["datlji", "datljev", "datlje", "suho sadje", "datlji brez koščic"], printed="SPAR DATLJI BREZ KOŠČIC 200 g")

# ---------------- SPAR p. 5 Ribarnica (no drawn grid: manual boxes) + oils
q("fonda-orada-1kg", 5, "Fonda orada", "Fonda", "1 kg", (1, "kg"), ["ribe", "vecerja"], 1399, 1859, 24, box=(0.03, 0.10, 0.50, 0.288),
  descriptor="velikost od 300 g do 600 g, sveže, postrežno", unit="kg", aliases=["orada", "orade", "oradi", "ribe", "riba", "fonda", "dorada", "sveža riba"],
  printed="FONDA ORADA velikost od 300 g do 600 g, sveže, postrežno, 1 kg", vextra=KG)
q("file-atlantskega-lososa-1kg", 5, "File atlantskega lososa", None, "1 kg", (1, "kg"), ["ribe", "vecerja"], 1699, 2499, 32, box=(0.50, 0.075, 0.985, 0.288),
  descriptor="sveže, postrežno", unit="kg", aliases=["losos", "lososa", "lososu", "file lososa", "ribe", "riba", "atlantski losos"],
  printed="FILE ATLANTSKEGA LOSOSA sveže, postrežno, 1 kg", vextra=KG)
q("ocisccena-sarenka-1kg", 5, "Očiščena šarenka", None, "1 kg", (1, "kg"), ["ribe", "vecerja"], 799, 1099, 27, box=(0.03, 0.29, 0.34, 0.525), img=("render", [277]),
  descriptor="sveže, postrežno", unit="kg", aliases=["šarenka", "šarenke", "šarenko", "postrv", "ribe", "riba"],
  printed="OČIŠČENA ŠARENKA sveže, postrežno, 1 kg", vextra=KG)
q("vitki-som-file-coolhouse-1kg", 5, "Vitki som file", "Coolhouse", "1 kg", (1, "kg"), ["ribe", "zamrznjeno", "vecerja"], 559, 699, 20, box=(0.375, 0.29, 0.66, 0.51), img=("render", [279]),
  pc="PC 5,59", badge=ZF, descriptor="zamrznjeno, postrežno", unit="kg", aliases=["som", "soma", "som file", "vitki som", "file", "ribe", "riba", "zamrznjena riba", "coolhouse"],
  printed="VITKI SOM FILE zamrznjeno, postrežno, Coolhouse, 1 kg", vextra=KG)
q("hobotnica-1000-2000-coolhouse-1kg", 5, "Hobotnica 1000/2000", "Coolhouse", "1 kg", (1, "kg"), ["ribe", "zamrznjeno", "vecerja"], 1599, 1999, 20, box=(0.68, 0.29, 0.985, 0.528),
  pc="PC 15,99", badge=ZF, descriptor="zamrznjeno, postrežno", unit="kg", aliases=["hobotnica", "hobotnice", "hobotnico", "ribe", "morski sadeži", "zamrznjena hobotnica", "coolhouse"],
  printed="HOBOTNICA 1000/2000 zamrznjeno, postrežno, Coolhouse, 1 kg", vextra=KG)
q("bakalar-na-belo-olivia-150g", 5, "Bakalar na belo", "Olivia", "150 g", (150, "g"), ["ribe", "vecerja"], 359, 429, 16, box=(0.03, 0.535, 0.30, 0.743),
  pc="PC 3,59", badge=ZF, aliases=["bakalar", "bakalarja", "bakalar na belo", "ribe", "riba", "olivia"], printed="BAKALAR NA BELO Olivia, 150 g")
q("repi-kozic-coolhouse-1kg", 5, "Repi kozic 10/20", "Coolhouse", "1 kg", (1, "kg"), ["ribe", "zamrznjeno", "vecerja"], 1646, 1899, 13, box=(0.302, 0.527, 0.665, 0.743),
  pc="PC 15,49", descriptor="zamrznjeno, postrežno", unit="kg", aliases=["kozice", "kozic", "repi kozic", "kozice 10/20", "morski sadeži", "ribe", "coolhouse"],
  printed="REPI KOZIC 10/20 zamrznjeno, postrežno, Coolhouse, 1 kg", vextra=KG + " Natisnjeni »PC 15,49« je nižji od cene s kartico; shranjen le kot opomba.")
q("mali-gavuni-coolhouse-1kg", 5, "Mali gavuni", "Coolhouse", "1 kg", (1, "kg"), ["ribe", "zamrznjeno", "vecerja"], 399, 549, 27, box=(0.665, 0.53, 0.99, 0.748),
  pc="PC 5,49", descriptor="zamrznjeno, postrežno", unit="kg", aliases=["gavuni", "gavune", "male sardele", "ribe", "riba", "coolhouse"],
  printed="MALI GAVUNI zamrznjeno, postrežno, Coolhouse, 1 kg", vextra=KG)
q("ekstra-devisko-oljcno-olje-gea-1l", 5, "Ekstra deviško oljčno olje", "Gea", "1 l", (1, "l"), ["osnovna-zivila", "zacimbe"], 1019, 1699, 40, box=(0.04, 0.745, 0.345, 0.975),
  pc="PC 16,99", descriptor="Tovarna olja Gea", aliases=["olje", "olja", "oljčno olje", "oljčnega olja", "ekstra deviško", "olivno olje", "gea"],
  printed="EKSTRA DEVIŠKO OLJČNO OLJE Tovarna olja Gea, 1 l")
q("solatno-olje-fram-1l", 5, "Solatno olje", "Fram", "1 l", (1, "l"), ["osnovna-zivila"], 319, 369, 13, box=(0.66, 0.752, 0.985, 0.975),
  pc="PC 3,69", descriptor="Oljarna Fram, PET", aliases=["olje", "olja", "solatno olje", "jedilno olje", "fram"],
  printed="SOLATNO OLJE Oljarna Fram, PET, 1 l")

# ---------------- SPAR p. 6 meso
q("slovenske-pisancje-krace-1kg", 6, "Slovenske piščančje krače ali stegna IK", None, "1 kg", (1, "kg"), ["meso", "vecerja"], 449, 959, 53, anchor="SLOVENSKE",
  descriptor="postrežno", unit="kg", aliases=["piščančje krače", "krače", "stegna", "piščančja stegna", "piščanec", "piščanca", "piščančje meso", "slovenski piščanec"],
  printed="SLOVENSKE PIŠČANČJE KRAČE ALI STEGNA IK postrežno, 1 kg", vextra=KG)
q("goveje-plece-mlado-1kg", 6, "Slovensko mlado goveje pleče IK", None, "1 kg", (1, "kg"), ["meso", "vecerja"], 1439, 1799, 20, anchor="SLOVENSKO MLADO",
  descriptor="brez kosti, postrežno", unit="kg", aliases=["govedina", "govedino", "goveje meso", "goveje pleče", "pleče", "meso za golaž"],
  printed="SLOVENSKO MLADO GOVEJE PLEČE IK brez kosti, postrežno, 1 kg", vextra=KG)
q("pecenice-meso-kamnik-1kg", 6, "Pečenice", "Meso Kamnik", "1 kg", (1, "kg"), ["mesni-izdelki", "meso", "vecerja"], 999, 1299, 23, anchor="PEČENICE",
  descriptor="postrežno", unit="kg", aliases=["pečenice", "pečenic", "klobase", "klobasa", "svinjske klobase", "meso kamnik"],
  printed="PEČENICE postrežno, Meso Kamnik, 1 kg", vextra=KG)
q("kuhani-goveji-vampi-zdezele-750g", 6, "Kuhani goveji vampi", "Z´dežele", "750 g", (750, "g"), ["meso", "vecerja"], 499, anchor="KUHANI", descriptor="pakirano, XXL",
  aliases=["vampi", "vampov", "kuhani vampi", "goveji vampi", "z dežele", "zdezele", "juha z vampi"], printed="KUHANI GOVEJI VAMPI pakirano, Z´dežele, XXL, 750 g")

# ---------------- SPAR p. 7 (mesnine)
q("savinjski-zelodec-zdezele-500g", 7, "Savinjski želodec", "Z´dežele", "500 g", (500, "g"), ["mesni-izdelki", "meso"], 1079, 1349, 20, anchor="SAVINJSKI",
  descriptor="polovica, pakirano", aliases=["želodec", "savinjski želodec", "mesnina", "mesnine", "z dežele", "zdezele"], printed="SAVINJSKI ŽELODEC polovica, pakirano, Z´dežele, 500 g")
q("eko-telecje-hrenovke-cadez-270g", 7, "Eko teleče hrenovke", "Čadež", "270 g", (270, "g"), ["mesni-izdelki", "vecerja"], 615, 769, 20, anchor="EKO TELEČJE",
  descriptor="v naravnem ovoju, pakirano", aliases=["hrenovke", "hrenovk", "teleče hrenovke", "eko hrenovke", "čadež", "klobasice"],
  printed="EKO TELEČJE HRENOVKE v naravnem ovoju, pakirano, Čadež, 270 g")
q("hrenovke-v-naravnem-ovoju-250g", 7, "Hrenovke v naravnem ovoju", None, "250 g", (250, "g"), ["mesni-izdelki", "vecerja"], 855, 1069, 20, box=(0.598, 0.515, 0.80, 0.742),
  badge=ZF, descriptor="pakirano", aliases=["hrenovke", "hrenovk", "hrenovka", "klobasice", "naravni ovoj"], printed="HRENOVKE V NARAVNEM OVOJU pakirano, 250 g")
q("tirolska-salama-narezek-150g", 7, "Tirolska salama", None, "150 g", (150, "g"), ["mesni-izdelki", "prigrizki"], 199, 275, 27, box=(0.805, 0.515, 0.985, 0.742),
  descriptor="narezek", aliases=["salama", "salame", "salamo", "tirolska", "narezek", "suha salama"], printed="TIROLSKA SALAMA narezek, 150 g")

# ---------------- SPAR p. 8 Kras (no drawn grid: 3x3 grid boxes)
C1, C2, C3 = (0.0, 0.331), (0.333, 0.650), (0.652, 1.0)
R1, R2, R3 = (0.22, 0.509), (0.516, 0.742), (0.746, 0.968)
b8 = lambda c, r: (c[0], r[0], c[1], r[1])
KR = ["kras", "kraški", "mesnine", "narezek"]
q("kraski-prsut-12m-narezek-250g", 8, "Kraški pršut 12 mesecev zorjen", "Kras", "250 g", (250, "g"), ["mesni-izdelki"], 999, 1399, 28, box=b8(C1, R1),
  descriptor="narezek", aliases=KR + ["pršut", "pršuta", "pršutu", "kraški pršut", "pršut narezek"], printed="KRAŠKI PRŠUT 12 MESECEV ZORJEN narezek, 250 g")
q("kraska-domaca-salama-narezek-100g", 8, "Kraška domača salama", "Kras", "100 g", (100, "g"), ["mesni-izdelki", "prigrizki"], 209, 279, 25, box=b8(C2, R1),
  descriptor="narezek", aliases=KR + ["salama", "salame", "domača salama", "kraška salama"], printed="KRAŠKA DOMAČA SALAMA narezek, 100 g")
q("cajna-klobasa-kras-500g", 8, "Čajna klobasa", "Kras", "500 g", (500, "g"), ["mesni-izdelki"], 845, 1129, 25, box=b8(C3, R1),
  descriptor="pakirano", aliases=KR + ["čajna", "čajna klobasa", "klobasa", "klobase"], printed="ČAJNA KLOBASA pakirano, 500 g")
q("mortadela-prestige-kras-1kg", 8, "Mortadela Prestige", "Kras", "1 kg", (1, "kg"), ["mesni-izdelki"], 1463, 1829, 20, box=b8(C1, R2),
  badge=ZF, descriptor="postrežno", unit="kg", aliases=KR + ["mortadela", "mortadele", "mortadelo", "prestige"], printed="MORTADELA PRESTIGE postrežno, 1 kg", vextra=KG)
q("kraski-prsut-kos-1kg", 8, "Kraški pršut 12 mesecev zorjen (kos)", "Kras", "1 kg", (1, "kg"), ["mesni-izdelki"], 2399, 3749, 36, box=b8(C2, R2),
  descriptor="kos", unit="kg", aliases=KR + ["pršut", "pršuta", "pršutu", "kraški pršut", "pršut v kosu", "cel pršut"], printed="KRAŠKI PRŠUT 12 MESECEV ZORJEN kos, 1 kg",
  vextra="Natisnjeno »kos, 1 kg«; cena velja za 1 kg.")
q("presana-mesnata-slanina-s-poprom-1kg", 8, "Prešana mesnata slanina s poprom", "Kras", "1 kg", (1, "kg"), ["mesni-izdelki"], 1399, 2099, 33, box=b8(C3, R2),
  descriptor="postrežno", unit="kg", aliases=KR + ["slanina", "slanine", "slanino", "prešana slanina", "mesnata slanina"], printed="PREŠANA MESNATA SLANINA S POPROM postrežno, 1 kg", vextra=KG)
q("delikatesna-plecka-kras-1kg", 8, "Delikatesna plečka", "Kras", "1 kg", (1, "kg"), ["mesni-izdelki"], 949, 1269, 25, box=b8(C1, R3),
  descriptor="postrežno", unit="kg", aliases=KR + ["plečka", "plečke", "delikatesna plečka", "šunka", "pleče"], printed="DELIKATESNA PLEČKA postrežno, 1 kg", vextra=KG)
q("aljazeva-klobasa-kras-1kg", 8, "Aljaževa klobasa", "Kras", "1 kg", (1, "kg"), ["mesni-izdelki"], 1499, 1959, 23, box=b8(C2, R3),
  descriptor="postrežno", unit="kg", aliases=KR + ["aljaževa", "aljaževa klobasa", "klobasa", "klobase"], printed="ALJAŽEVA KLOBASA postrežno, 1 kg", vextra=KG)

# ---------------- SPAR p. 9 Brez glutena
q("cicerika-despar-500g", 9, "Čičerika", "DESPAR", "500 g", (500, "g"), ["osnovna-zivila", "prilogi"], 149, anchor="ČIČERIKA",
  aliases=["čičerika", "čičerike", "čičeriko", "stročnice", "despar", "hummus"], printed="DESPAR ČIČERIKA 500 g")
q("bio-testenine-rdeca-leca-vital-250g", 9, "Bio testenine iz rdeče leče", "DESPAR Vital", "250 g", (250, "g"), ["testenine", "osnovna-zivila", "vecerja"], 139, 189, 26,
  anchor="BIO TESTENINE", pc="PC 1,89", img=("render", [9366, 9381]), line="Vital", descriptor="strozzapreti",
  aliases=["testenine", "testenin", "testenine iz leče", "rdeča leča", "strozzapreti", "brez glutena", "vital", "despar vital"], printed="BIO TESTENINE RDEČA LEČA strozzapreti, 250 g")
q("bio-mandljev-namaz-convivia-190g", 9, "Bio mandljev namaz", "Convivia", "190 g", (190, "g"), ["namazi", "zajtrk"], 879, 1099, 20, anchor="MANDLJEV", pc="PC 10,99",
  aliases=["mandljev namaz", "namaz", "mandlji", "mandljeva krema", "bio namaz", "convivia"], printed="BIO MANDLJEV NAMAZ Convivia, 190 g")

# ---------------- SPAR p. 12 Vital
q("bucno-olje-vital-0-5l", 12, "Bučno olje", "SPAR Vital", "0,5 l", (0.5, "l"), ["osnovna-zivila"], 769, 869, 11, box=(0.655, 0.04, 0.985, 0.51), pc="PC 8,69", line="Vital",
  aliases=["olje", "olja", "bučno olje", "bučnega olja", "vital", "spar vital"], printed="VITAL BUČNO OLJE 0,5 l")
q("vital-kruhki-klasik-150g", 12, "Kruhki klasik", "SPAR Vital", "150 g", (150, "g"), ["zajtrk", "prigrizki"], 179, 205, 12, anchor="KRUHKI KLASIK", pc="PC 2,05", line="Vital",
  aliases=["kruhki", "hrustljavi kruhki", "hrustljavi", "vital", "spar vital", "prigrizek"], printed="VITAL KRUHKI KLASIK 150 g")

# ---------------- SPAR p. 13 Zdravo
q("kefir-spar-500ml", 13, "Kefir", "SPAR", "500 ml", (500, "ml"), ["mlecni-izdelki", "zajtrk", "pijace"], 69, anchor="KEFIR", descriptor="3,5 % m. m.", line="SPAR",
  aliases=["kefir", "kefirja", "kefirju", "fermentiran", "probiotik", "spar kefir"], printed="SPAR KEFIR 3,5 % m. m., 500 ml")
q("kislo-zelje-slovensko-1kg", 13, "Slovensko kislo zelje", "SPAR", "1 kg", (1, "kg"), ["zelenjava", "prilogi"], 149, 199, 25, anchor="KISLO ZELJE", descriptor="pakirano", line="SPAR",
  aliases=["kislo zelje", "kislega zelja", "zelje", "kislo", "spar kislo zelje"], printed="SPAR SLOVENSKO KISLO ZELJE pakirano, 1 kg")
q("jogurt-zelene-doline-1kg", 13, "Navadni jogurt", "Zelene Doline", "1 kg", (1, "kg"), ["mlecni-izdelki", "zajtrk"], 149, 199, 25, anchor="NAVADNI JOGURT",
  descriptor="1,3 % m. m., tekoči, PET", aliases=["jogurt", "jogurta", "jogurtom", "tekoči jogurt", "navadni jogurt", "zelene doline"],
  printed="NAVADNI JOGURT 1,3 % m. m., tekoči, Zelene Doline, PET, 1 kg")
q("miso-juha-saitaku-72g", 13, "Miso juha", "Saitaku", "72 g", (72, "g"), ["osnovna-zivila", "vecerja"], 289, anchor="MISO JUHA",
  aliases=["miso", "miso juha", "juha", "instant juha", "saitaku", "japonska juha"], printed="MISO JUHA Saitaku, 72 g")
q("bio-kimchi-spar-260g", 13, "Bio kimchi", "SPAR", "260 g", (260, "g"), ["zelenjava", "prilogi"], 319, 399, 20, anchor="BIO KIMCHI", pc="PC 3,19",
  descriptor="blagi ali pekoči", line="SPAR", aliases=["kimchi", "kimčiji", "kimči", "fermentirana zelenjava", "bio kimchi", "vegansko"], printed="SPAR BIO KIMCHI blagi ali pekoči, 260 g")

# ---------------- SPAR p. 14 Za poln hladilnik dobrot
q("majoneza-thomy-xl-265g", 14, "Majoneza", "Thomy", "265 g", (265, "g"), ["omake", "osnovna-zivila"], 259, 416, 37, anchor="MAJONEZA", pc="PC 2,99", extra="MEGA CENA",
  descriptor="XL, v tubi", aliases=["majoneza", "majoneze", "majonezo", "thomy", "omaka", "tuba"], printed="MAJONEZA Thomy XL, v tubi, 265 g")
q("sadni-jogurti-mu-1kg", 14, "Sadni jogurti Mu", "Ljubljanske mlekarne", "1 kg", (1, "kg"), ["mlecni-izdelki", "zajtrk"], 174, 249, 30, anchor="JOGURTI MU", line="Mu",
  descriptor="tekoči, več okusov, PET", aliases=["jogurt", "jogurti", "sadni jogurt", "tekoči jogurt", "mu jogurt", "ljubljanske mlekarne"],
  printed="SADNI JOGURTI MU tekoči, več okusov, Ljubljanske mlekarne, PET, 1 kg")
q("mileram-zelene-doline-400g", 14, "Mileram", "Zelene Doline", "400 g", (400, "g"), ["mlecni-izdelki"], 129, 178, 27, anchor="MILERAM",
  aliases=["mileram", "kisla smetana", "smetana", "zelene doline"], printed="MILERAM Zelene Doline, 400 g")
q("smetana-za-kuhanje-spar-500g", 14, "Smetana za kuhanje", "SPAR", "500 g", (500, "g"), ["mlecni-izdelki", "osnovna-zivila"], 169, 199, 15, anchor="SMETANA", line="SPAR",
  aliases=["smetana", "smetane", "smetano", "smetana za kuhanje", "kuhinjska smetana", "spar smetana"], printed="SPAR SMETANA ZA KUHANJE 500 g")
q("proteinski-napitek-zbregov-0-3l", 14, "Proteinski napitek", "'z bregov", "0,3 l", (0.3, "l"), ["mlecni-izdelki", "pijace"], 139, 199, 30, anchor="PROTEINSKI", pc="PC 1,99",
  descriptor="več okusov", aliases=["proteinski napitek", "protein", "beljakovinski napitek", "z bregov", "zbregov", "mlečni napitek"], printed="PROTEINSKI NAPITEK več okusov, 'z bregov, 0,3 l")
q("mlecni-napitek-this-is-food-500g", 14, "Mlečni napitek This is Food", "YFood", "500 g", (500, "g"), ["mlecni-izdelki", "pijace"], 359, 449, 20, anchor="MLEČNI NAPITEK", pc="PC 3,59",
  descriptor="več okusov", aliases=["mlečni napitek", "this is food", "yfood", "napitek", "proteinski napitek"], printed="MLEČNI NAPITEK THIS IS FOOD več okusov, YFood, 500 g")
q("kinder-maxi-king-3x35g", 14, "Mlečna rezina Kinder Maxi King", "Ferrero", "3 × 35 g", (105, "g"), ["sladko", "sladkarije"], 189, 239, 20, anchor="KINDER MAXI KING", line="Kinder",
  aliases=["kinder", "maxi king", "kinder maxi king", "mlečna rezina", "rezina", "ferrero", "sladkarija"], printed="MLEČNA REZINA KINDER MAXI KING Ferrero, 3 x 35 g")

# ---------------- SPAR p. 15 sir, zamrznjeno
q("sir-gaudar-1kg", 15, "Sir Gaudar", "Ljubljanske mlekarne", "1 kg", (1, "kg"), ["mlecni-izdelki", "sir"], 999, 1499, 33, anchor="SIR GAUDAR", descriptor="postrežno", unit="kg",
  aliases=["sir", "sira", "siru", "gauda", "gaudar", "ljubljanske mlekarne", "trdi sir"], printed="SIR GAUDAR postrežno, Ljubljanske mlekarne, 1 kg", vextra=KG)
q("ovcji-sir-castellano-1kg", 15, "Ovčji sir Castellano", "SPAR Premium", "1 kg", (1, "kg"), ["mlecni-izdelki", "sir"], 2199, 2601, 15, anchor="OVČJI SIR", line="Premium",
  descriptor="postrežno, iz Španije", unit="kg", aliases=["sir", "sira", "siru", "ovčji sir", "castellano", "španski sir", "spar premium"],
  printed="OVČJI SIR CASTELLANO postrežno, iz Španije, 1 kg", vextra=KG)
q("sir-livada-pomurske-1kg", 15, "Sir Livada", "Pomurske mlekarne", "1 kg", (1, "kg"), ["mlecni-izdelki", "sir"], 829, 1749, 52, anchor="SIR LIVADA", descriptor="postrežno", unit="kg",
  aliases=["sir", "sira", "siru", "livada", "pomurske mlekarne", "trdi sir"], printed="SIR LIVADA postrežno, Pomurske mlekarne, 1 kg", vextra=KG)
q("cottage-sir-meggle-180g", 15, "Cottage sir", "Meggle", "180 g", (180, "g"), ["mlecni-izdelki", "zajtrk"], 109, 144, 24, anchor="COTTAGE SIR",
  aliases=["cottage", "cottage sir", "skuta", "skuti", "mehki sir", "meggle", "proteinski sir"], printed="COTTAGE SIR Meggle, 180 g")
q("sir-jost-rezine-150g", 15, "Sir Jošt", "Ljubljanske mlekarne", "150 g", (150, "g"), ["mlecni-izdelki", "sir", "zajtrk"], 199, 299, 33, anchor="SIR JOŠT",
  descriptor="v rezinah, več vrst", aliases=["sir", "sira", "siru", "jošt", "sir v rezinah", "rezine sira", "ljubljanske mlekarne"], printed="SIR JOŠT v rezinah, več vrst, Ljubljanske mlekarne, 150 g",
  vextra="Natisnjeno: popust ne velja za izdelke, vključene v promocijo ZNIŽANI FAVORITI.")
q("margarina-becel-225g", 15, "Margarina Becel", "Becel", "225 g", (225, "g"), ["namazi", "zajtrk"], 159, 209, 23, anchor="MARGARINA BECEL", pc="PC 2,09",
  aliases=["margarina", "margarine", "margarino", "becel", "namaz", "maslo"], printed="MARGARINA BECEL 225 g")
q("sir-president-salakis-250g", 15, "Sir President Salakis", "President", "250 g", (250, "g"), ["mlecni-izdelki", "sir"], 219, 299, 26, anchor="SALAKIS", badge=ZF,
  aliases=["sir", "sira", "siru", "president", "salakis", "kremni sir", "namaz"], printed="SIR PRESIDENT SALAKIS 250 g",
  vnote="Akcija ZNIŽANI FAVORITI: natisnjeno »ZNIŽANI FAVORITI 26%« in redna cena 2,99.")
q("sojini-polpeti-oplant-400g", 15, "Sojini polpeti ali zelenjavni zrezki", "O´plant", "400 g", (400, "g"), ["zamrznjeno", "vecerja"], 389, 499, 22, anchor="SOJINI POLPETI", pc="PC 4,99",
  descriptor="zamrznjeno", aliases=["polpeti", "sojini polpeti", "zelenjavni zrezki", "vegansko", "veganski", "oplant", "o'plant", "zamrznjeno"],
  printed="SOJINI POLPETI ALI ZELENJAVNI ZREZKI O´plant, 400 g", vextra="Zamrznjen izdelek (oznaka snežinke).")

# ---------------- SPAR p. 16 Mlečno
q("kozje-mleko-spar-0-75l", 16, "Kozje mleko", "SPAR", "0,75 l", (0.75, "l"), ["mlecni-izdelki", "pijace"], 179, 209, 14, anchor="KOZJE MLEKO", descriptor="sveže", line="SPAR",
  aliases=["mleko", "mleka", "kozje mleko", "kozjega mleka", "spar mleko"], printed="SPAR KOZJE MLEKO sveže, 0,75 l")
q("sir-edamec-spar-1kg", 16, "Sir Edamec", "SPAR", "1 kg", (1, "kg"), ["mlecni-izdelki", "sir"], 669, 959, 30, anchor="SIR EDAMEC", descriptor="postrežno", unit="kg", line="SPAR",
  aliases=["sir", "sira", "siru", "edamec", "edamer", "spar sir"], printed="SPAR SIR EDAMEC postrežno, 1 kg", vextra=KG)
q("ayran-spar-250g", 16, "Ayran", "SPAR", "250 g", (250, "g"), ["mlecni-izdelki", "pijace"], 39, 49, 20, anchor="AYRAN", line="SPAR",
  aliases=["ayran", "ajran", "jogurtov napitek", "spar ayran"], printed="SPAR AYRAN 250 g")
q("bio-pinjenec-naturpur-500ml", 16, "Bio pinjenec", NATUR, "500 ml", (500, "ml"), ["mlecni-izdelki", "pijace"], 109, anchor="BIO PINJENEC", img=("render", [8977]), descriptor="naravni", line="Natur*pur",
  aliases=["pinjenec", "pinjenca", "bio pinjenec", "buttermilch", "natur pur", "mlečni napitek"], printed="BIO PINJENEC naravni, 500 ml")
q("ovcje-mleko-spar-0-5l", 16, "Ovčje mleko", "SPAR", "0,5 l", (0.5, "l"), ["mlecni-izdelki", "pijace"], 183, anchor="OVČJE MLEKO", descriptor="sveže", line="SPAR",
  aliases=["mleko", "mleka", "ovčje mleko", "ovčjega mleka", "spar mleko"], printed="SPAR OVČJE MLEKO sveže, 0,5 l")

# ---------------- SPAR p. 17 Športniki (3x2 grid, manual cell boxes: the names repeat on the page)
G = {"c1": (0.0, 0.332), "c2": (0.341, 0.649), "c3": (0.659, 1.0), "r1": (0.517, 0.739), "r2": (0.746, 0.968)}
b17 = lambda c, r: (G[c][0], G[r][0], G[c][1], G[r][1])
HP = ["high protein", "protein", "proteinski", "beljakovine", "spar high protein", "šport"]
q("high-protein-whey-500g", 17, "High Protein Whey", "SPAR", "500 g", (500, "g"), ["osnovna-zivila", "pijace"], 1299, box=b17("c1", "r1"), descriptor="več vrst", line="High Protein",
  aliases=HP + ["whey", "whey protein", "proteinski prah"], printed="SPAR HIGH PROTEIN WHEY več vrst, 500 g")
q("high-protein-whey-30g", 17, "High Protein Whey", "SPAR", "30 g", (30, "g"), ["osnovna-zivila", "pijace"], 85, 109, 22, box=b17("c2", "r1"), pc="PC 1,09", descriptor="več vrst",
  line="High Protein", aliases=HP + ["whey", "whey protein", "vrečka"], printed="SPAR HIGH PROTEIN WHEY več vrst, 30 g")
q("high-protein-kasa-cokolada-60g", 17, "High Protein beljakovinska kaša", "SPAR", "60 g", (60, "g"), ["zajtrk", "osnovna-zivila"], 109, box=b17("c3", "r1"), descriptor="čokolada",
  line="High Protein", aliases=HP + ["kaša", "porridge", "beljakovinska kaša", "ovsena kaša"], printed="SPAR HIGH PROTEIN BELJAKOVINSKA KAŠA čokolada, 60 g")
q("high-protein-musli-500g", 17, "High Protein musli", "SPAR", "500 g", (500, "g"), ["zajtrk", "osnovna-zivila"], 245, 329, 25, box=b17("c1", "r2"), pc="PC 3,29",
  descriptor="čokolada, bučna semena", line="High Protein", aliases=HP + ["musli", "mueslija", "müsli"], printed="SPAR HIGH PROTEIN MUSLI čokolada, bučna semena, 500 g")
q("high-protein-jogurt-natur-500g", 17, "High Protein jogurt", "SPAR", "500 g", (500, "g"), ["mlecni-izdelki", "zajtrk"], 119, 159, 25, box=b17("c2", "r2"), descriptor="navadni",
  line="High Protein", aliases=HP + ["jogurt", "jogurta", "navadni jogurt"], printed="SPAR HIGH PROTEIN JOGURT navadni, 500 g")
q("high-protein-puding-200g", 17, "High Protein puding", "SPAR", "200 g", (200, "g"), ["mlecni-izdelki", "sladko"], 99, box=b17("c3", "r2"), descriptor="čokolada ali vanilija",
  line="High Protein", aliases=HP + ["puding", "pudinga", "desert", "proteinski puding"], printed="SPAR HIGH PROTEIN PUDING čokolada ali vanilija, 200 g")

# ---------------- SPAR p. 18 Shramba (top rows: drawn cells; bottom row: manual boxes)
q("ravioli-divita-250g", 18, "Ravioli Divita", "Divita", "250 g", (250, "g"), ["testenine", "vecerja"], 249, 375, 33, anchor="RAVIOLI", pc="PC 3,75",
  descriptor="s špinačo in z ricotto ali z žlahtnimi siri", aliases=["ravioli", "raviol", "testenine", "polnjene testenine", "divita", "mlinotest"], printed="RAVIOLI DIVITA s špinačo in z ricotto ali z žlahtnimi siri, 250 g")
q("tuna-rio-mare-3x65g", 18, "Tuna Rio Mare", "Rio Mare", "3 × 65 g", (195, "g"), ["osnovna-zivila", "ribe"], 419, 599, 30, anchor="TUNA RIO", pc="PC 5,99",
  descriptor="v oljčnem olju pikant ali z limono in poprom", aliases=["tuna", "tune", "tuno", "tunina", "rio mare", "konzerva", "ribe"], printed="TUNA RIO MARE v oljčnem olju pikant ali z limono in poprom, 3 x 65 g")
q("gorcica-thomy-700g", 18, "Gorčica", "Thomy", "700 g", (700, "g"), ["omake", "osnovna-zivila"], 319, 459, 30, anchor="GORČICA", pc="PC 4,59", descriptor="v kozarcu",
  aliases=["gorčica", "gorčice", "gorčico", "senf", "thomy", "omaka"], printed="GORČICA v kozarcu, Thomy, 700 g")
q("zitne-blazinice-lino-500g", 18, "Žitne blazinice Lino", "Podravka", "500 g", (500, "g"), ["zajtrk", "sladko"], 345, 575, 40, box=(0.01, 0.746, 0.215, 0.968), pc="PC: 3,69", minpx=5000,
  descriptor="mlečne, nougat", line="Lino", aliases=["blazinice", "žitne blazinice", "lino", "žitarice", "kosmiči", "podravka"], printed="ŽITNE BLAZINICE LINO mlečne, nougat, 500 g",
  vextra="Natisnjeno »PC: 3,69« (višje od cene s kartico); shranjeno le kot opomba.")
q("polzki-zlato-polje-500g", 18, "Polžki", "Zlato polje", "500 g", (500, "g"), ["testenine", "osnovna-zivila", "vecerja"], 93, 187, 50, box=(0.215, 0.746, 0.405, 0.968), pc="PC: 1,87",
  descriptor="jajčni", aliases=["polžki", "polžkov", "testenine", "testenin", "jajčne testenine", "zlato polje"], printed="POLŽKI ZLATO POLJE jajčni, 500 g")
q("tunina-solata-eva-160g", 18, "Tunina solata Eva", "Eva", "160 g", (160, "g"), ["osnovna-zivila", "ribe", "vecerja"], 189, 349, 45, box=(0.41, 0.746, 0.60, 0.968), pc="PC: 3,49",
  descriptor="Mexicana, z rdečo kvinojo, kus-kus, Protein, Balance, Asiana", aliases=["tunina solata", "tuna", "tune", "solata", "eva", "konzerva"],
  printed="TUNINA SOLATA EVA Mexicana, z rdečo kvinojo, kus-kus, Protein, Balance, Asiana, 160 g")
q("golaz-podravka-300g", 18, "Golaž Podravka", "Podravka", "300 g", (300, "g"), ["osnovna-zivila", "vecerja"], 239, 435, 45, box=(0.605, 0.746, 0.79, 0.968), pc="PC: 4,35",
  descriptor="goveji", aliases=["golaž", "golaža", "goveji golaž", "konzerva", "podravka"], printed="GOLAŽ PODRAVKA goveji, 300 g")
q("ragu-podravka-200g", 18, "Ragu Podravka", "Podravka", "200 g", (200, "g"), ["osnovna-zivila", "omake", "vecerja"], 179, 245, 26, box=(0.795, 0.746, 0.985, 0.968), pc="PC: 2,45", minpx=3000,
  descriptor="mesni, mesni bolognese", aliases=["ragu", "mesni ragu", "bolognese", "omaka", "podravka"], printed="RAGU PODRAVKA mesni, mesni bolognese, 200 g")

# ---------------- SPAR p. 19
q("turisticna-pasteta-delamaris-95g", 19, "Turistična pašteta", "Delamaris", "95 g", (95, "g"), ["osnovna-zivila", "namazi"], 129, 184, 29, anchor="TURISTIČNA", pc="PC 1,84",
  descriptor="classic", aliases=["pašteta", "pašteta turistična", "turistična pašteta", "delamaris", "namaz", "ribja pašteta"], printed="TURISTIČNA PAŠTETA classic, Delamaris, 95 g")
q("isostar-hydrate-perform-400g", 19, "Isostar granulat", "Isostar", "400 g", (400, "g"), ["pijace"], 799, 1147, 30, anchor="ISOSTAR", pc="PC 11,47",
  descriptor="več vrst", aliases=["isostar", "športna pijača", "granulat", "hydrate", "izotonična pijača"], printed="ISOSTAR GRANULAT več vrst, 400 g")

# ---------------- SPAR p. 22 Sladki trenutki
q("proteinski-piskoti-grancereale-250g", 22, "Proteinski piškoti Grancereale", "Grancereale", "250 g", (250, "g"), ["sladko", "zajtrk"], 217, 279, 22, anchor="GRANCEREALE", pc="PC 2,79",
  descriptor="polnozrnati s temno čokolado in pomarančno lupino ali z mandlji in figami", aliases=["piškoti", "piškote", "keksi", "proteinski piškoti", "grancereale", "gran cereale"],
  printed="PROTEINSKI PIŠKOTI GRANCEREALE polnozrnati s temno čokolado in pomarančno lupino ali z mandlji in figami, 250 g")
q("bonboni-ricola-75g", 22, "Bonboni Ricola", "Ricola", "75 g", (75, "g"), ["sladkarije"], 183, 229, 20, anchor="BONBONI RICOLA", pc="PC 2,29",
  descriptor="zeliščni brez sladkorja, žajbelj brez sladkorja, melisa brez sladkorja ali malina", aliases=["bonboni", "bonbone", "ricola", "zeliščni bonboni", "sladkarije"],
  printed="BONBONI RICOLA zeliščni brez sladkorja, žajbelj brez sladkorja, melisa brez sladkorja ali malina, 75 g")
q("karamelni-bonboni-werthers-135g", 22, "Karamelni bonboni Werther's Original", "Storck", "135 g", (135, "g"), ["sladkarije"], 89, anchor="KARAMELNI BONBONI", line="Werther's",
  descriptor="SPAR XXL, +50 % GRATIS", aliases=["bonboni", "bonbone", "karamelni bonboni", "werther", "werthers", "werther's original", "karamele"],
  printed="KARAMELNI BONBONI Werther's original, SPAR XXL, + 50 % GRATIS, 135 g", vextra="Cena velja za XXL pakiranje 135 g (+ 50 % GRATIS).")
q("kava-barcaffe-espresso-250g", 22, "Kava Barcaffè Espresso ali Espresso Cremoso", "Barcaffè", "250 g", (250, "g"), ["kava", "pijace", "zajtrk"], 519, 649, 20, box=(0.775, 0.746, 0.99, 0.968), pc="PC 6,49",
  descriptor="mleta pražena kava", aliases=["kava", "kave", "kavo", "mleta kava", "espresso", "barcaffe", "barcaffè", "kava espresso"],
  printed="KAVA BARCAFFÈ ESPRESSO ali ESPRESSO CREMOSO mleta pražena kava, 250 g")

# ---------------- SPAR p. 23 Pijača
q("kava-v-zrnu-borbone-1kg", 23, "Kava v zrnu Borbone", "Borbone", "1 kg", (1, "kg"), ["kava", "pijace", "zajtrk"], 1519, 1899, 20, anchor="KAVA V ZRNU", pc="PC 18,99",
  descriptor="100 % Arabica", aliases=["kava", "kave", "kavo", "kava v zrnu", "zrnata kava", "borbone", "arabica"], printed="KAVA V ZRNU BORBONE 100 % Arabica, 1 kg")
q("instant-kava-nescafe-classic-200g", 23, "Instant kava Nescafé Classic", "Nescafé", "200 g", (200, "g"), ["kava", "pijace", "zajtrk"], 699, 1049, 33, anchor="INSTANT KAVA", pc="PC 10,49",
  descriptor="Nestlé, original, mild ali kräftig", aliases=["kava", "kave", "kavo", "instant kava", "nescafe", "nescafé", "topna kava", "nestle"],
  printed="INSTANT KAVA NESCAFÉ CLASSIC Nestlé, original, mild ali kräftig, 200 g")
q("herbalna-voda-donatural-500ml", 23, "Herbalna voda DoNatural", "DoNatural", "500 ml", (500, "ml"), ["pijace", "voda"], 149, 199, 25, anchor="HERBALNA VODA", pc="PC 1,99", minpx=4000,
  descriptor="meta, aloe vera, limonska trava, brin ali žajbelj", aliases=["voda", "vode", "herbalna voda", "donatural", "aromatizirana voda", "pijača"],
  printed="HERBALNA VODA DONATURAL meta, aloe vera, limonska trava, brin ali žajbelj, 500 ml")
q("napitek-fruc-1-5l", 23, "Napitek Fruc", "Fructal", "1,5 l", (1.5, "l"), ["pijace", "sokovi"], 119, 164, 27, anchor="NAPITEK FRUC", pc="PC 0,99",
  descriptor="limona-pomaranča ali črni ribez-aronija", aliases=["fruc", "sok", "soka", "napitek", "fructal", "sadni napitek", "pijača"],
  printed="NAPITEK FRUC Fructal, limona-pomaranča ali črni ribez-aronija, 1,5 l")
q("cedevita-pink-grejp-200g", 23, "Cedevita v prahu pink grejp", "Cedevita", "200 g", (200, "g"), ["pijace"], 225, anchor="CEDEVITA V PRAHU",
  aliases=["cedevita", "cedevito", "pink grejp", "instant napitek", "prašek za napitek", "pijača"], printed="CEDEVITA V PRAHU pink grejp, 200 g",
  vextra="Natisnjeno: limitirana izdaja Cedevita Pink Grejp v sodelovanju z Združenjem Europa Donna Slovenija.")
q("gazirana-pijaca-schweppes-1l", 23, "Gazirana pijača Schweppes", "Schweppes", "1 l", (1, "l"), ["pijace"], 135, 193, 30, anchor="GAZIRANA PIJAČA", pc="PC 1,84", minpx=3000,
  descriptor="bitter lemon, tonic water, tangerine, slimline, pink pepper ali cherry", aliases=["schweppes", "tonik", "tonic", "gazirana pijača", "gazirano", "pijača"],
  printed="GAZIRANA PIJAČA SCHWEPPES bitter lemon, tonic water, tangerine, slimline, pink pepper ali cherry, 1 l")
q("energijski-napitek-red-bull-4x250ml", 23, "Energijski napitek Red Bull", "Red Bull", "4 × 250 ml", (1000, "ml"), ["pijace"], 439, 679, 35, anchor="ENERGIJSKI", pc="PC 4,39",
  descriptor="original, četverček", aliases=["red bull", "redbull", "energijska pijača", "energijski napitek", "energetska pijača", "pijača"],
  printed="ENERGIJSKI NAPITEK RED BULL original, četverček, 4 x 250 ml")

# ---------------- SPAR p. 24 Pivo in prigrizki (only clear single-pack, non-alcoholic or snack items)
q("prigrizek-chio-150g", 24, "Prigrizek Chio", "Chio", "150 g", (150, "g"), ["prigrizki"], 195, 269, 27, anchor="PRIGRIZEK CHIO", pc="PC 1,95",
  descriptor="slani, z okusom paprike, s sirom ali s kislo smetano in čebulo", aliases=["čips", "čipsa", "chio", "prigrizek", "slani prigrizek", "grickalice"],
  printed="PRIGRIZEK CHIO slani, z okusom paprike, s sirom ali s kislo smetano in čebulo, 150 g")
q("flips-smoki-stark-150g", 24, "Flips Smoki", "Štark", "150 g", (150, "g"), ["prigrizki"], 129, 169, 23, anchor="FLIPS SMOKI", pc="PC 1,69", descriptor="z arašidi",
  aliases=["smoki", "flips", "flips smoki", "arašidi", "prigrizek", "štark", "stark", "grickalice"], printed="FLIPS SMOKI z arašidi, Štark, 150 g")
q("slane-palcke-soletti-230g", 24, "Slane palčke Soletti", "Soletti", "230 g", (230, "g"), ["prigrizki"], 167, 239, 30, anchor="SLANE PALČKE", pc="PC 2,39",
  aliases=["palčke", "slane palčke", "soletti", "prigrizek", "grisini", "grickalice"], printed="SLANE PALČKE Soletti, 230 g")
q("brezalkoholno-pivo-union-0-5l", 24, "Brezalkoholno pivo Union", "Union", "0,5 l", (0.5, "l"), ["pijace"], 79, 107, 26, anchor="BREZALKOHOLNO", pc="PC 1,07",
  descriptor="pločevinka, 0 % alkohola", aliases=["brezalkoholno pivo", "union", "pivo", "pločevinka", "0 % alkohola"], printed="BREZALKOHOLNO PIVO Union, pločevinka, 0,5 l")
q("malt-limona-pittinger-0-5l", 24, "Malt Limona Pittinger", "Pittinger", "0,5 l", (0.5, "l"), ["pijace"], 53, anchor="MALT LIMONA", descriptor="pločevinka, 0 % alkohola",
  aliases=["malt", "malt limona", "pittinger", "brezalkoholna pijača", "pločevinka", "0 % alkohola"], printed="PITTINGER MALT LIMONA pločevinka, 0,5 l")

# ---------------- SPAR p. 20 Izdelek meseca
q("vegeta-podravka-250g", 20, "Vegeta", "Podravka", "250 g", (250, "g"), ["zacimbe", "osnovna-zivila"], 189, 259, 27, box=(0.51, 0.185, 0.92, 0.465), pc="PC 1,89", img=("embedded", 1530),
  aliases=["vegeta", "vegete", "vegeto", "začimba", "začimbe", "podravka", "mešanica začimb"], printed="VEGETA Podravka, 250 g")

# ---------------- SPAR p. 10 / 11 breads (photo pages: box = text + price + packshot, packshot = rectangular crop with photo background)
CROPNOTE = "Pravokotni izrez fotografije izdelka (SPAR str. {p}); ozadje fotografije je ohranjeno, ker je izdelek del fotografirane scene."
q("bela-ali-polbela-struca-zito-1kg", 10, "Bela ali polbela štruca", "Žito", "1 kg", (1, "kg"), ["pekovsko", "kruh", "zajtrk"], 144, 170, 15, box=(0.10, 0.14, 0.47, 0.425), unit="kg",
  aliases=["štruca", "štruce", "štrucko", "kruh", "kruha", "bel kruh", "polbel kruh", "žito"], printed="BELA ALI POLBELA ŠTRUCA Žito, 1 kg",
  img=("cropn", (0.12, 0.243, 0.47, 0.42)), imgnote=CROPNOTE.format(p=10), vextra="Cena velja za 1 kg.")
q("jelenov-kruh-zito-1kg", 10, "Jelenov kruh", "Žito", "1 kg", (1, "kg"), ["pekovsko", "kruh", "zajtrk"], 319, 399, 20, box=(0.62, 0.14, 0.995, 0.43), unit="kg",
  aliases=["jelenov kruh", "kruh", "kruha", "kruhom", "žito"], printed="JELENOV KRUH Žito, 1 kg; cena na kg",
  img=("cropn", (0.63, 0.245, 1.0, 0.415)), imgnote=CROPNOTE.format(p=10), vextra="Natisnjeno »1 kg; cena na kg«: cena velja za 1 kg.")
q("proteinsko-pecivo-zito-80g", 10, "Proteinsko pecivo", "Žito", "80 g", (80, "g"), ["pekovsko", "zajtrk"], 39, 49, 20, box=(0.01, 0.43, 0.316, 0.75),
  aliases=["pecivo", "peciva", "proteinsko pecivo", "žemlja", "žito", "pecivo s semeni"], printed="PROTEINSKO PECIVO Žito, 80 g",
  img=("cropn", (0.04, 0.50, 0.33, 0.60)), imgnote=CROPNOTE.format(p=10))
q("jagodno-cokoladna-rezina-150g", 10, "Jagodno-čokoladna rezina", "SPAR", "150 g", (150, "g"), ["sladko", "pekovsko"], 219, 259, 15, box=(0.318, 0.56, 0.66, 0.75), line="SPAR",
  aliases=["rezina", "rezine", "torta", "sladica", "kos torte", "jagodna rezina", "čokoladna rezina"], printed="SPAR JAGODNO-ČOKOLADNA REZINA 150 g",
  img=("cropn", (0.39, 0.56, 0.73, 0.69)), imgnote=CROPNOTE.format(p=10))
q("krof-don-don-75g", 10, "Krof", "Don Don", "75 g", (75, "g"), ["sladko", "pekovsko"], 89, 99, 10, box=(0.70, 0.48, 0.995, 0.75),
  descriptor="čokolada vanilija ali čokolada lešnik", aliases=["krof", "krofi", "krofa", "don don", "sladica", "pecivo"], printed="KROF čokolada vanilija ali čokolada lešnik, Don Don, 75 g",
  img=("cropn", (0.72, 0.485, 1.0, 0.61)), imgnote=CROPNOTE.format(p=10))
q("jaus-psenicni-rzeni-kruh-500g", 11, "Pšenični ržen kruh", "Jaus", "500 g", (500, "g"), ["pekovsko", "kruh", "zajtrk"], 249, 299, 16, box=(0.436, 0.285, 0.71, 0.585),
  descriptor="rezan, pakirano", aliases=["kruh", "kruha", "kruhom", "ržen kruh", "rženi kruh", "pšenični ržen kruh", "jaus"], printed="PŠENIČNI RŽENI KRUH rezan, pakirano, Jaus, 500 g",
  img=("embedded", 4672))
q("bio-polnozrnati-rzeni-kruh-500g", 11, "Bio polnozrnati ržen kruh", NATUR, "500 g", (500, "g"), ["pekovsko", "kruh", "zajtrk"], 169, box=(0.74, 0.37, 0.985, 0.627),
  descriptor="pakirano", line="Natur*pur", aliases=["kruh", "kruha", "kruhom", "ržen kruh", "rženi kruh", "bio kruh", "polnozrnat kruh", "natur pur"],
  printed="BIO POLNOZRNATI RŽENI KRUH pakirano, 500 g", img=("cropn", (0.737, 0.388, 0.968, 0.505)), imgnote=CROPNOTE.format(p=11))
q("rzena-mesana-strucka-4x80g", 11, "Ržena mešana štručka", "SPAR", "4 × 80 g", (320, "g"), ["pekovsko", "zajtrk"], 159, box=(0.02, 0.59, 0.435, 0.905), line="SPAR",
  descriptor="pakirano", aliases=["štručka", "štručke", "štručko", "pecivo", "ržena štručka", "ržene štručke", "žemlje"], printed="SPAR RŽENA MEŠANA ŠTRUČKA pakirano, 4 x 80 g",
  img=("cropn", (0.13, 0.55, 0.45, 0.80)), imgnote=CROPNOTE.format(p=11))
q("rzeni-kruh-kaucic-500g", 11, "Ržen kruh", "Pekarna Kaučič", "500 g", (500, "g"), ["pekovsko", "kruh", "zajtrk"], 219, box=(0.44, 0.628, 0.985, 0.93),
  aliases=["kruh", "kruha", "kruhom", "ržen kruh", "rženi kruh", "kaučič", "pekarna kaučič"], printed="RŽENI KRUH Pekarna Kaučič, 500 g",
  img=("cropn", (0.46, 0.635, 0.93, 0.845)), imgnote=CROPNOTE.format(p=11))
