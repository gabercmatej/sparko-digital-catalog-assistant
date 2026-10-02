# Sparko — načrt MVP za predstavitev na telefonu

Pripravljeno: 2. oktober 2026. Status: načrt in začetni oblikovni materiali; aplikacija še ni izdelana ali objavljena.

## 1. Cilj in potrjene odločitve

V manj kot minuti mora obiskovalec razumeti: **Sparko mi pomaga najti izdelek, jaz ga shranim, moj katalog se prilagodi, v originalnem letaku pa takoj vidim svoj izbor.** To je osrednja predstavitvena zgodba. Pogovor je način odkrivanja, Moj katalog pa glavni rezultat.

Potrjeno z uporabnikom:

- Delovna mapa je `C:\Users\Maj\OneDrive - 12media.si\Dokumenti\Claude\Šparko`.
- Objavljena aplikacija bo na Vercelu. V tej fazi ne gradimo ali objavljamo aplikacije.
- Za predstavitev uporabimo priloženi PDF, tudi če takrat ne bo več aktualen.
- Uporabnik želi Sparkovo oceno po jasnih merilih.
- Brez prijave in sinhronizacije. Na isti napravi se ohranijo demo pogovori, vsi novi pogovori testerja in njegov osebni katalog.
- Mikrofon je v MVP izklopljen.
- Belo ozadje pogovora, svetlo sive manjše kvadratne kartice izdelkov z ostrimi vogali, podoba ponudb iz SPAR kataloga, prijazen slovenski pogovor. Ime pomočnika je Sparko (brez strešice).

Predlog obsega: **30 preverjenih izdelkov**, največ 50. Vsi so dostopni prek vodoravnega traku; prvih 10 je uredniško izbranih, ostali sledijo. Poseben pogled »Vsi izdelki« omogoča lažje iskanje. Štiri originalne slike izdelkov in začetni zapisi so že pripravljeni; celoten izbor in indeks še nista narejena.

## 2. Kaj je pokazal dejanski PDF

Datoteka `260930-1-Katalog_4026.pdf` vsebuje **38 PDF-strani** in berljivo besedilo. Besedilo ne ohrani zanesljivo povezav med ceno in izdelkom; izvoz lahko npr. ceno 3,38 zapiše kot `338`. Samodejni izpis zato ni dovolj za objavo podatkov.

Ročno pregledane strani: naslovnica, PDF-stran 5 (S-BUDGET) in zadnja stran s časovno omejenimi ponudbami ter kuponi. Besedilo je bilo izvlečeno iz vseh 38 strani; to ni popolna vizualna verifikacija kataloga.

Na PDF-strani 5 so preverjeni:

| Izdelek | Pakiranje | Cena v katalogu |
| --- | --- | --- |
| S-BUDGET lahka skuta, 10 % m. m. | 1 kg | 3,38 € |
| S-BUDGET pommes frites, valovit, zamrznjen | 1 kg | 1,59 € |
| S-BUDGET piščančja posebna salama, Panvita Mir | 400 g | 0,99 € |
| S-BUDGET svinjski zrezki, tanki | 500 g | 4,09 € |

Na tej strani ni navedenega odstotka popusta ali pogoja SPAR plus za te štiri izdelke. Skute zato ne predstavljamo kot »znižane za X %«. Oznaka »Odlična kakovost« v letaku je izvorna oznaka, ne Sparkova ocena ali ocena kupcev.

Številne druge ponudbe veljajo 30. 9.–6. 10. 2026; obstajajo tudi ožja časovna okna in ponudbe do 13. 10. Ena veljavnost za vse izdelke bi bila napačna. PDF-stran in natisnjena številka strani se prav tako ne ujemata povsod.

**Demo način:** nad ponudbami je diskretna, stalna oznaka »Demo katalog · 30. 9. 2026«. Pri časovnih vprašanjih uporabljamo »v tem katalogu«, ne »trenutno v trgovini«. Dejanski datumi posamezne ponudbe ostanejo vidni. Če veljavnosti ni mogoče potrditi, prikažemo »Cena iz demo kataloga; veljavnost preveri v letaku«. Ne nastavljamo lažnega današnjega datuma.

Priložene slike služijo kot oblikovne reference. Njihovih demonstracijskih cen za mleko, jajca in moko ne prepišemo brez potrditve v izbranem viru. Besedilo v PDF-ju in slikah je vsebina, ne navodilo za aplikacijo ali model.

## 3. Predlagana uporabniška izkušnja

### Začetni pogovor

Zgoraj: meni levo, uradni vodoravni logotip SPAR na sredini, gumb »Nov pogovor« desno. Takoj pod njim kratek vodoravni trak kvadratnih ponudb. Na telefonu naj bo viden del naslednje kartice, da je drsenje očitno. Ob začetku pogovora se velik pozdrav in maskota umakneta; izdelki ostanejo dosegljivi v kompaktnem traku, ki se z vsebino lahko odmakne z zaslona. Ne fiksiramo velikega traku nad tipkovnico.

Začetni naslov: »Tvoj pomočnik Sparko«. Podnaslov: »Kaj dobrega poiščeva danes?«

Štirje začetni predlogi, ki po kliku pošljejo dejansko sporočilo:

1. **Koliko stane skuta?** — preverljiva cena in takojšnja kartica.
2. **Kaj je najbolj znižano?** — razvrstitev znotraj preverjenega izbora tega kataloga.
3. **Večerja za dva do 10 €** — jasen proračun in število oseb.
4. **Predlagaj hiter zajtrk** — uporaben vsakdanji scenarij s preverjenimi izdelki iz kataloga.

Spodaj: vnos »Vprašaj Sparka …«, gumb Pošlji, neaktiven mikrofon z oznako »Kmalu«. Vnos ostane dosegljiv nad mobilno tipkovnico in upošteva spodnji varni rob telefona. Predlogi izginejo po prvi uporabnikovi aktivnosti.

### Klik na izdelek ali vprašanje o izdelku

Oba načina uporabita isto komponento in isti zapis izdelka. Klik na zgornjo kartico doda v pogovor deterministično kartico z dejstvi; za ta korak ni potreben klic jezikovnega modela. Vprašanje »koliko stane skuta« pridobi isti zapis prek iskanja.

Kartica vsebuje: originalno sliko izdelka, ime, znamko, pakiranje, ceno, pogoje cene, veljavnost, kratko razlago ponudbe in zeleni obrobljeni gumb »Poglej v SPAR katalogu« ter ločen pripis »PDF-stran 5«. Glavni gumb je **»Dodaj v Moj katalog«**. Če je izdelek že shranjen: **»✓ V Mojem katalogu«**, ob kliku odpre osebni katalog in se pomakne do izdelka. Ločen manjši gumb omogoča odstranitev.

Primer odgovora: »V demo katalogu je S-BUDGET lahka skuta, 1 kg, navedena po 3,38 €. Želiš, da jo shraniš v svoj katalog?« Kartica ponudi dejanski gumb; Sparko ne trdi, da je že shranil izdelek, če uporabnik tega ni zahteval.

Shranjevanje se izvede takoj, gumb spremeni stanje, števec se posodobi, kratko obvestilo ponudi »Razveljavi«. Shranjevanje je idempotentno: isti izdelek se ne podvoji. Če uporabnik izrecno napiše »dodaj skuto«, se lahko enak ukaz sproži iz pogovora; pri več ujemanjih Sparko najprej ponudi izbiro.

### Navigacija in zgodovina

Stranski meni: Nov pogovor, Moj katalog s števcem, Pogovori, Nastavitve. Demo pogovori so v skupini **»Primeri pogovorov«**, dejanski pogovori v skupini **»Tvoji pogovori«**. Demo primerov ne prikazujemo kot resnične pretekle nakupe testerja.

Pripravimo tri vsebinsko zaključene demonstracijske pogovore: cena skute, ponudbe S-BUDGET, večerja do 10 €. Nadaljevanje demo primera ustvari lasten pogovor s kopijo konteksta. Izvorni primer ostane ponovljiv. Novi pogovori dobijo naslov po prvem vprašanju, shranjujejo se po vsakem sporočilu in po osvežitvi ostanejo dosegljivi. »Nov pogovor« ne izbriše osebnega kataloga.

Za glavni feature priporočam tudi stalno dostopen mali preklop **Domov / Sparko / Moj katalog (N)** nad vnosom oziroma v spodnji navigaciji. Osebnega kataloga ne skrijemo samo v meni. Navigacija ne sme prekrivati sporočil ali gumba Pošlji.

### Moj katalog

Naslov »Moj katalog«, podnaslov »Tvoj izbor. Ideje zate.« Dva jasno ločena dela:

- **Tvoji izdelki:** uredniško oblikovana mreža po dva izdelka v vrsti. Najprej nazadnje dodani; majhni razdelki po kategorijah, ko je izdelkov več. Prednost imajo slike in cene, ne videz tabele ali blagajne.
- **Priporočeno zate:** do šest različnih izdelkov z razlago, npr. »Tudi iz linije S-BUDGET« ali »Za preprosto večerjo«. Vidno drugačno ozadje razdelka. Priporočila niso shranjena, dokler jih uporabnik ne doda.

Prazen katalog povabi: »Izberi prvi izdelek. Sparko ti bo nato predlagal še nekaj idej.« Prikaže nekaj uredniških predlogov, ki niso predstavljeni kot osebno prilagojeni.

To je zbirka ponudb, ne nakupovalni voziček. V MVP ni nakupa, zaloge, plačevanja ali obljube dobavljivosti. Količine in skupni znesek celotne zbirke niso potrebni; računanje je obvezno pri receptih oziroma izrecni cenovni primerjavi.

### SPAR letak

Na zaslonu Moj katalog je spodaj desno razširjen gumb **»Odpri SPAR letak«** z ikono odprte knjižice. Podnaslov pogleda: »Originalni katalog z označenim tvojim izborom«. Gumb se umakne nad varni rob in ima rezerviran prostor, da ne prekrije zadnje kartice.

Za MVP uporabimo vnaprej pripravljene slike strani in interaktivne prekrivne pravokotnike. Izvirnega PDF-ja ne spreminjamo. Brskalnikov privzeti PDF-pregledovalnik ne omogoča dovolj nadzora za ta feature.

- Dotik izdelka odpre spodnjo kartico s ceno in »Dodaj v Moj katalog« ali stanjem »V Mojem katalogu«.
- Shranjeni izdelki imajo stalno izrazito zeleno obrobo debeline 3 CSS px, tanko belo zunanjo obrobo za kontrast na zelenih straneh, nežno prosojno zeleno polnilo in značko »✓ V Mojem katalogu«. Barva ni edini signal. Ob odprtju strani ali dodajanju izdelka se poudarek dvakrat počasi posvetli in umiri (1,2 s na cikel, skupaj 2,4 s). Animiramo svetlost/prosojnost prekrivnega poudarka, ne fotografije ali cen; podatki v letaku ostanejo čitljivi. Nato ostane stalna oznaka. Brez neskončnega utripanja. Pri prefers-reduced-motion animacijo izklopimo. Utripajo samo vidni relevantni izdelki; nova sporočila ali ponovni izris ga ne sprožijo znova.
- Gumb »Samo strani z mojimi izdelki« skrajša pregledovanje; v praznem katalogu je neaktiven z razlago.
- Iz produktne kartice se odpre ustrezna stran in izdelek na njej. Ciljni izdelek sproži opisani kratki poudarek; če še ni shranjen, je poudarek začasen in brez značke shranjenosti. Trajna obroba in kljukica vedno pomenita dejansko shranjen izdelek.
- Povečava, premik slike in označbe uporabljajo isti koordinatni prostor. Spremenjena širina ali orientacija telefona ne sme premakniti pravokotnikov.
- Indeksiranih bo približno 30 izdelkov. Samo ti imajo aktivne dotike in oznake. Ob prvi uporabi piše »V demo različici lahko dodajaš označene izdelke.« Ne obljubljamo interaktivnosti vseh izdelkov iz 38 strani.
- Gumb »Izvirni PDF« omogoča ogled cele datoteke, medtem ko interaktivni prikaz ostane glavni pogled.

## 4. Vizualna smer in pripravljeni materiali

Bela osnova pogovora `#FFFFFF`, svetlo sive kvadratne kartice izdelkov `#F1F2F1` z ostrimi vogali, temno zeleno besedilo, temnejša zelena za glavne gumbe, SPAR rdeča za cene. Rumeno uporabljamo le za resnične akcijske poudarke iz vira. Cen ne kopiramo v slike: izrišemo jih iz podatkov z decimalno vejico. Product hero je kvadraten; besedilo in gumb sta lahko pod njim, da pri povečavi pisave ne odrežemo vsebine.

Maskota naj bo majhna, izrazna in predvsem na praznem začetnem zaslonu. Med aktivnim pogovorom ne zavzame tretjine zaslona. Obstoječe reference so kopirane v `assets/references`; novega lika nismo generirali. Za produkcijski izrez maskote je najbolje pridobiti originalni transparentni asset, lahko pa ga pripravimo ločeno pozneje.

Pripravljeno v tej fazi:

- `assets/products/`: štirje originalni izločeni packshoti iz PDF-strani 5.
- `assets/ui/design-tokens.css`: barve, tipografija, razmiki, vogali, minimalne površine dotika.
- `assets/ui/icons.svg`: preproste vektorske ikone za navigacijo in shranjevanje.
- `assets/ui/sparko-ui-direction.svg` in `.png`: statična oblikovna tabla treh telefonskih pogledov; ni delujoč MVP.
- `planning/seed-products.sample.json`: štirje začetni zapisi, cene preverjene; veljavnosti brez potrditve ostanejo prazne, pravokotniki so začetni približki za poznejši test povečave.

Podobe izdelkov in znamk uporabljamo iz dostavljenih referenc in kataloga; ne generiramo novih embalaž, logotipov ali cenovnih značk, ki bi lahko spreminjale dejstva. Belo ozadje velja za pogovor, svetlo sivo za poustvarjene produktne kartice; originalni letak ohrani svoje barve.

## 5. Podatki, RAG in Sparkov način odgovarjanja

### En vir podatkov za celotno aplikacijo

Pogovor, kartice, osebni katalog, priporočila in označbe uporabljajo iste ID-je. Za MVP je dovolj lokalno pripravljen, različičen JSON; ločena podatkovna baza ni potrebna. Smiselno ločimo izdelek od ponudbe, da kasnejši katalog ne prepiše zgodovinske cene.

| Entiteta | Obvezna vsebina |
| --- | --- |
| Product | stabilni `productId`, naziv, znamka/linija, kategorija, pakiranje, merska enota, sinonimi, originalna slika |
| Offer | `offerId`, `productId`, `catalogId`, cena v centih, vrsta cene, redna cena če obstaja, pogoji SPAR plus/kupona, veljavnost ali status neznane veljavnosti, dokaz iz vira |
| Placement | `offerId`, 0-based `pdfPageIndex`, 1-based številka PDF-strani, natisnjena oznaka strani, normalizirani pravokotnik `x,y,width,height` v razponu 0–1 |
| Catalog | različica, izvorna datoteka, naslov, datum izdaje, strani in optimizirane slike |
| SavedItem | `productId`, izbrani `offerId`, čas dodajanja; en vnos za isti izdelek |
| Conversation | ID, naslov, vrsta demo/uporabnik, čas, sporočila z ID-ji ponudb in statusi zahtev |
| Recipe | porcije, sestavine, zahtevane količine, povezane ponudbe, število potrebnih pakiranj, preverjen postopek |

Izdelek ima lahko več pojavitev v letaku. Isti shranjeni izdelek mora biti označen na vseh preverjenih pojavitvah. Skupinska ponudba brez znane končne cene ni enaka posameznemu izdelku s preverjeno ceno.

### Priprava kataloga pred objavo

1. Izbrati približno 30 izdelkov iz relevantnih skupin: mlečni izdelki, osnovna živila, zelenjava/sadje, preprosta večerja, S-BUDGET.
2. Izvleči besedilo in originalne slike, kjer je mogoče; ostalo ročno pripraviti iz vira. Vsaki ceni pripeti dokaz in stran.
3. Ročno preveriti naziv, pakiranje, ceno, kartico/kupon, veljavnost in natančen pravokotnik. Ne sklepati cene iz bližine v surovem besedilu.
4. Dodati slovenske sopomenke in pregibne oblike: skuta/skute/skuto, mleko/mleka, krompir/krompirja, S-BUDGET/sbudget, m. m./maščoba.
5. Pripraviti 3 preverjene recepte oziroma kombinacije z izračunom do 10 €. Če katalog nima vseh cen sestavin, to izrecno povedati ali izbrati drug recept.
6. Pripraviti manjše slike vseh strani za listanje ter ostrejše različice po potrebi za povečavo. Nalagati le vidno in sosednji strani.
7. Preveriti enotnost ID-jev, centov, veljavnosti in mej pravokotnikov. Shraniti izvorni PDF nespremenjen.

### Predlagani RAG za ta obseg

**Strukturirano iskanje + jezikovni model za razumevanje in prijazen odgovor.** To je namerno majhen RAG, ne polnjenje celotnega PDF-ja v vsak pogovor. Za 30–50 izdelkov za začetek ne potrebujemo vektorske podatkovne baze. Semantična iskanja oziroma embeddingi so razširitev, če preverjena vprašanja pokažejo vrzeli.

Pot: vprašanje in kratek kontekst → določitev namena in filtrov → iskanje po sinonimih, kategorijah, znamkah in pogojih → preverjeni zapisi → kratek slovenski odgovor in ID-ji kartic → izris kartic iz podatkov.

Predvidene operacije: `searchProducts`, `getProduct`, `rankOffers`, `getRecommendations`, `suggestMeal`, `resolveCatalogPage`. Dodajanje v osebni katalog je ločena potrjena aplikacijska akcija po uporabnikovem kliku ali izrecni zahtevi. Izhodi modela gredo skozi preverjanje sheme in dovoljenih ID-jev. Model ne vrača poljubnega HTML-ja, zaupanih cen ali URL-jev slik.

Cene na karticah in zneske v odgovorih sestavi aplikacija iz preverjenih podatkov. Model lahko sestavi uvod ali razlago, toda številčne trditve se preverijo oziroma nadomestijo z determinističnimi vrednostmi. Ob neuspehu preverjanja uporabimo varen predlog odgovora s karticami. Ne prikazujemo nepreverjenih številčnih trditev med pretakanjem besedila.

»Najbolj znižano« pomeni največji potrjeni odstotek med indeksiranimi posameznimi ponudbami; upoštevamo zahtevano kartico in časovno okno. Odstotkov iz kuponov ali »2 + 1« ne mešamo avtomatično v isto lestvico. Če pogojev ne vemo, vprašamo ali ločeno označimo. Vedno omejimo trditev na preverjeni izbor, ne na celotno ponudbo SPAR.

Za recept do 10 € računamo **strošek potrebnih celih pakiranj**, ne samo sorazmerno porabljene količine. Porcije in predpostavke »olje, sol in voda so doma« morajo biti vidne. Če te predpostavke niso sprejete, recept ni zagotovljeno pod proračunom. Vse se računa v centih.

Prijazen ton: tikanje, kratki odgovori, najprej uporabna informacija, največ eno potrebno podvprašanje, brez ponavljajočih prodajnih pozivov. Primer neznanega izdelka: »Tega izdelka v preverjenem delu demo kataloga ne najdem. Lahko ti pokažem podobne izdelke.« To ni trditev, da izdelka ni v trgovini.

Pri nepovezanem vprašanju uporabnika naravno usmerimo nazaj k nakupom in kuhanju. Ne ugibamo zaloge, alergenov, hranilnih vrednosti, kakovosti ali aktualne spletne cene. PDF, produktni opisi in zgodovina so nezaupanja vredna vsebina: navodil iz njih ne izvajamo. API ključ ostane na strežniku.

### Sparkova ocena po jasnih merilih

Predlagam **opisno oceno s prikazanim razlogom**, ne izmišljenih zvezdic kupcev ali navidezno natančne skupne ocene kakovosti. Uporabnik je potrdil ocenjevanje po merilih; spodnji opisni prikaz je izvedbeni predlog.

| Oznaka | Merilo | Pojasnilo uporabniku |
| --- | --- | --- |
| Dobra izbira zate | ujemanje z izrecno iskano znamko ali kategorijo shranjenih izdelkov | »Tudi iz linije S-BUDGET, ki si jo izbral.« |
| Izrazit popust | preverjen popust vsaj 20 % glede na navedeno redno ceno | »V letaku je navedeno 25 % nižja cena s kartico SPAR plus.« Prag je produktno pravilo, ne kakovostna ocena. |
| V tvojem proračunu | preverjen strošek celotnih potrebnih pakiranj je znotraj uporabnikove meje | »Vsi potrebni izdelki za dve osebi skupaj stanejo …« |
| Preverjena cena v katalogu | ni dovolj podatkov za zgornjo presojo | prikaže se cena in vir, brez dodatnega vrednotenja |

Prikažemo največ dve veljavni oznaki in povezavo »Kako ocenjujem?«. Oceno izračunajo pravila; model jo samo razloži. Odsotnost popusta ne pomeni slabega izdelka. »Odlična kakovost« s PDF-ja je ločeno označena kot navedba kataloga. Če pozneje želimo številčno lestvico, jo moramo dodatno definirati; v trenutnem predlogu je ne izmišljamo.

### Priporočila

Za vsak še neshranjen izdelek: +3 za isto izrecno izbrano linijo/znamko, +2 za sorodno kategorijo, +2 za povezavo s preverjenim receptom, +1 za isto tematsko skupino letaka. To so priporočilne uteži, ne ocena kakovosti izdelka. Pri izenačenju uporabimo stabilen uredniški vrstni red. Največ dve skoraj enaki ponudbi, največ šest kartic; ob malo podatkih vključimo raznolikost. Stran PDF-ja je signal konteksta, ne edina kategorija.

Ko uporabnik odstrani zadnji izdelek, se personalizacija ponastavi na uredniške predloge. Priporočeni izdelki se nikoli samodejno ne dodajo in niso označeni v letaku kot shranjeni.

## 6. Tehnična zasnova in Vercel

Predlog: Next.js App Router + TypeScript, CSS spremenljivke oziroma obstoječe izbrane komponente, ena strežniška pot za pogovor, preverjanje shem, lokalni preverjeni katalog in lokalni uporabniški podatki. Natančne stabilne različice izberemo ter zaklenemo ob gradnji.

Priprava PDF-ja poteka lokalno pred objavo. Na Vercelu se med pogovorom ne izvaja OCR ali prebiranje 28,6 MB PDF-ja. Strani, slike in PDF postrežemo kot statične datoteke oziroma prek objektne shrambe, če je to smiselno za projekt. PDF-ja ne pošiljamo skozi chat endpoint; Vercel dokumentira omejitev velikosti zahtev in odgovorov funkcij. Začetni MVP ne potrebuje dodatne plačljive shrambe, če statične datoteke zadostujejo.

Podatki testerja: različičen `localStorage` za majhen obseg demo pogovorov in izbrane ID-je; slike niso v njem. Posodobitve se shranijo po vsakem sporočilu in akciji. Obravnava napak ob nedosegljivi/polni shrambi, vidno opozorilo, da v takem primeru spremembe niso trajno shranjene. Brez avtomatskega brisanja starih pogovorov. Demo primeri so ločeni od uporabniških podatkov. Brisanje v nastavitvah zahteva jasno potrjeno akcijo.

Nastavitve: »Imam kartico SPAR plus« s tremi stanji da/ne/ni izbrano, pojasnilo demo načina, način Sparkove ocene, ponastavitev demo izbora in ločeno brisanje mojih pogovorov. Ne ustvarjamo nepotrebnega profila.

Strežniški del: izbrani ponudnik modela prek adapterja, skrivnostni ključ v Vercel environment variables, omejitve dolžine sporočil in konteksta, omejitev uporabe ter časovna omejitev. Konkretni model izberemo po testu slovenščine, odzivnosti in strukturiranega odgovora. Ob izpadu ostanejo deterministične kartice, dodajanje, priporočila in letak delujoči; prosti pogovor pokaže napako s »Poskusi znova«. Ne pretvarjamo se, da je vnaprej pripravljen odgovor živ AI odgovor.

Predstavitvena povezava mora delovati v mobilnem brskalniku brez nepričakovane prijave v Vercel. Način zaščite objave izberemo pred objavo in nato dejansko preverimo anonimni dostop. Za javno dosegljiv AI endpoint uvedemo trajno strežniško omejevanje uporabe, ne le števca v brskalniku ali pomnilniku ene funkcije.

Viri preverjeni ob pripravi načrta:

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Vercel omejitve funkcij: https://vercel.com/docs/functions/limitations
- Vercel Blob, možnost za večje datoteke: https://vercel.com/docs/vercel-blob
- Vercel zaščita objav: https://vercel.com/docs/deployment-protection

## 7. Vrstni red izvedbe in merila zaključka

Časovne ocene so orientacijske, ne obljuba. Največ negotovosti je pri ročni pripravi in povezovanju izdelkov, ne pri risanju chat vmesnika. Za današnjo gradnjo najprej zaključimo delujočo navpično pot s štirimi izdelki, nato razširimo izbor in AI.

| Korak | Rezultat | Ocena aktivnega dela | Zaključeno, ko … |
| --- | --- | --- | --- |
| 1. Podatkovna pogodba in izbor | sheme, 30 izbranih izdelkov, pogoji, slike, povezave | 2–4 h | ni nepreverjenih cen v demonstracijskem izboru |
| 2. Osrednja pot s štirimi izdelki | kartica → shrani → Moj katalog → označen letak | 2–4 h | isto stanje se brez podvojitev pokaže v vseh pogledih in preživi osvežitev |
| 3. Mobilni izgled in zgodovina | začetni zaslon, meni, vnos, demo in resnični pogovori | 2–3 h | brez prekrivanja s tipkovnico pri ozkem zaslonu |
| 4. Iskanje in pogovor | strukturirani RAG, kartice, ocene, tri jedi | 2–4 h | cena, pogoji in izračuni prestanejo dogovorjen nabor vprašanj |
| 5. Vercel in vaja predstavitve | delujoča povezava, napake, mobilni pregled | 1–2 h | celoten scenarij uspe na dejanskem telefonu |

Ob časovni stiski zmanjšamo izbor proti 10–15 izdelkom in uporabimo manj preverjenih receptov. Ohranimo Moj katalog, sinhronizacijo stanja med pogledi in označevanje v letaku. Ti trije deli so bistvo MVP-ja. Ne žrtvujemo pravilnosti cen za število izdelkov.

### Smiselna razdelitev za poznejšo vzporedno gradnjo

Uporabnik razmišlja o približno petih subagentih v naslednjem koraku. V tej fazi jih ne zaganjamo. Pred delegiranjem morajo biti potrjeni ID-ji, sheme, skupna produktna kartica, pravila ocene in lastništvo datotek.

1. Podatki in sredstva: indeks, slike, pogoji, pravokotniki, demo recepti.
2. Mobilni pogovor: izgled, vnos, meni, zgodovina, prazna in napakovna stanja.
3. Moj katalog: stanje shranjevanja, mreža, odstranjevanje, priporočila.
4. SPAR letak: prikaz strani, povečava, dotiki, oznake, povezave na izdelek.
5. RAG: iskanje, modelni adapter, validacija, recepti, cenovna pravila.

Glavni agent skrbi za skupne pogodbe, integracijo, testiranje in objavo. Če okolje dopušča le tri sočasne podagente, se pet sklopov izvede v dveh valovih; ne spreminjamo odgovornosti zaradi števila mest. Skupne datoteke in odvisnosti ureja en integrator. Vmesnik in AI ne smeta vsak zase izumiti svojih cen, kartic ali ID-jev.

## 8. Obvezni sprejemni preizkusi

- »Koliko stane skuta?« vrne točen zapis 3,38 €, 1 kg, povezavo na PDF-stran 5 in isti gumb kot klik v zgornjem traku.
- »Koliko stane skute / skuto / sbudget skuta?« poišče ustrezno ponudbo; pri več relevantnih zadetkih ponudi izbiro.
- Dodaj izdelek v pogovoru: takoj se pojavi v Mojem katalogu, gumb se spremeni na vseh karticah in originalna stran pokaže oznako.
- Dodaj ali odstrani v letaku: sprememba se pokaže v osebnem katalogu in pogovoru. Več klikov ne podvoji izdelka.
- Priporočila so ločena, pojasnjena in niso samodejno shranjena.
- Osvežitev in zaprtje/ponovno odprtje brskalnika ohranita izbor ter vse testerjeve pogovore na istem izvoru in napravi. Nov pogovor ohrani katalog.
- Demo primer se lahko nadaljuje, ne da bi izgubil izvorni primer. Ponastavitev demo izbora ne izbriše testerjevih pogovorov.
- Oznake ostanejo na izdelkih pri širini 360, 390 in 430 px, povečavi ter obratu telefona. Majhne tarče ponudijo povečavo ali spodnji seznam.
- »Kaj je najbolj znižano?« ne uvrsti S-BUDGET skute kot odstotkovno znižane ponudbe brez vira; cene s kartico so jasno označene.
- »Večerja za dva do 10 €« vrne preverjena cela pakiranja, pravilen seštevek in vidne predpostavke. Neznane cene ne zapolni z ugibanjem.
- Po 6. oktobru se iztekle ponudbe ne imenujejo aktualne; demo oznaka je vidna, datumi ostanejo iz vira.
- Neznan izdelek, nepovezano vprašanje, poskus spremembe navodil v besedilu in izpad modela ne povzročijo izmišljenih cen ali lažno potrjenega shranjevanja.
- Zaslonski bralnik prebere ime gumba, ceno in stanje shranjevanja; fokus je viden, dotiki približno 44 px, cene niso odvisne samo od barve.
- Končna predstavitvena povezava deluje na telefonu v zasebnem oknu, brez lokalnih poti in brez izpostavljenega API ključa.

## 9. Scenarij za predstavitev (60–90 sekund)

1. Odpreš Sparka in izbereš »Koliko stane skuta?«.
2. Sparko pokaže preverjeno kartico; dodaš skuto v Moj katalog.
3. Odpreš Moj katalog. Skuta je prva, spodaj so pojasnjena priporočila S-BUDGET.
4. Dodaš priporočeni izdelek. Števec se spremeni.
5. Odpreš SPAR letak. Oba izdelka sta označena na ustrezni strani.
6. Iz letaka dodaš tretji izdelek in pokažeš, da se Moj katalog takoj posodobi.
7. Vrneš se v pogovor ali odpreš shranjen pogovor testerja. Če je čas, pokažeš še preverjeno večerjo do 10 €.

## 10. Preostale odločitve pred začetkom gradnje

Potrebujemo dostop do izbranega modelnega API-ja in Vercel projekta ob dejanski povezavi/objavi; skrivnosti sodijo v okoljske spremenljivke, ne v dokument ali pogovor. Če še ni izbire ponudnika, je adapter do takrat zamenljiv.

Še za potrditev ob naslednjem koraku: ali sprejmemo opisno Sparkovo oceno ali želi uporabnik številčno lestvico; ali dobimo originalni transparentni asset maskote; končni seznam približno 30 izdelkov in trije preverjeni recepti. To ne preprečuje izdelave osnovne poti s štirimi že pripravljenimi izdelki.

Naslednji korak je sestaviti izvedbeni prompt iz tega načrta z jasnimi pogodbami in preverjanji. Ta dokument namenoma še ni navodilo za avtomatski zagon petih agentov ali objavo.


## 11. UI revizija 03 — predlog za potrditev

Ta revizija nadomešča prejšnje vizualne predloge. Prikaz: `assets/ui/sparko-ui-direction-v3.png`. Gre za generirano oblikovno referenco, ne implementacijo; končna aplikacija uporablja prave produktne slike in izvorni logotip.

- Več praznega prostora, manjši logotip in maskota, manjši naslovi in produktne slike. Cilj: 24 px stranskih odmikov, 24–36 px med večjimi vsebinskimi sklopi, berljivo osnovno besedilo 15–16 px in najmanj 44 px dotikalnih površin. Pomanjševanje vizualov ne zmanjša uporabnosti gumbov.
- Zgornje kartice približno 90 × 90 CSS px, produktna kartica v odgovoru približno 160 × 160 px. Končna geometrija mora biti natanko 1:1, brez zaobljenih vogalov; slike ohranijo razmerje stranic. Dimenzije prilagodimo preverjanju na ozkem telefonu, brez rezanja nazivov ali cen.
- Ime povsod v uporabniškem vmesniku: **Sparko**; vnos »Vprašaj Sparka …«. Ime obstoječe projektne mape ostane nespremenjeno.
- Četrti začetni predlog je »Predlagaj hiter zajtrk«. Dodati ga v nabor preizkusov RAG; uporabi preverjene izdelke, ne nepreverjenih cen.
- Spodnja navigacija: **Domov / Sparko / Moj katalog**. Domov je rezerviran za kasnejšo demo domačo stran, katere dizajn pripravi uporabnik. V tej fazi je prikazan le zavihek, domače strani ne oblikujemo. Do prejema dizajna ostaja vstopna pot Sparko; ob gradnji dogovorimo začasni prikaz zavihka Domov, brez izmišljanja vsebine.
- Letak uporablja trajne poudarke in kratek dvociklični utrip po zgornji specifikaciji. Preveriti kontrast na zeleni strani S-BUDGET, poravnavo med povečavo, izklop gibanja ter takojšnjo odstranitev oznake ob odstranitvi izdelka iz osebnega kataloga.

Status: UI predlog in načrt sta pripravljena za uporabnikovo potrditev. Gradnje ali objave še ne začnemo.


## 12. Končni UI popravki — potrjeno, brez nove slike

Ti popravki imajo prednost pred ustreznimi elementi slike UI v3 in starejšimi opisi.

- **Odgovori brez avatarja:** odstranimo okroglo ikono maskote ob vseh Sparkovih odgovorih in odvečni levi prostor zanjo. Majhna besedilna oznaka »Sparko« lahko ostane. Maskota ostane na začetnem pozdravnem zaslonu.
- **Dva enako velika gumba:** pod produktom sta navpično postavljena »Dodaj v Moj katalog« (polna zelena) in »Poglej v SPAR katalogu« (zelena obroba, zeleno besedilo, bela notranjost). Enaka širina, višina najmanj 44 px, radij in poravnava; med njima 8–12 px razmika. To velja tudi, ko prvi gumb kaže shranjeno stanje. Drugi gumb odpre originalni SPAR letak na pravem izdelku. Vir in številka strani sta ločen pripis. Naslova pogledov ostaneta »Moj katalog« in »SPAR letak«, da osebna zbirka in originalni katalog ostaneta jasno ločena.
- **Gumb za pošiljanje PDF-ja:** v pogledu SPAR letaka dodamo »Pošlji PDF na e-pošto«, ki se nanaša na originalni SPAR PDF. Za MVP je to samo predstavitveni gumb: ob kliku se prikaže pojasnilo »Pošiljanje PDF-ja na e-pošto bo na voljo v prihodnji različici.« in možnost zapiranja. Brez vnosa naslova, prijave, mailto povezave, e-poštne integracije, pošiljanja ali lažnega obvestila o uspehu. Gumb za ogled izvirnega PDF-ja ostane ločen. Akcija ne sme prekrivati izdelkov ali spodnje navigacije.

Preverjanje: odgovori nimajo avatarja ali praznega odmika zanj; produktna gumba imata enako geometrijo; klik na e-poštni gumb pokaže samo pojasnilo in ne pošlje nobene zahteve za pošiljanje e-pošte. Nove slike ne potrebujemo. Izvedbeni prompt je posodobljen z istimi pravili.
