# Food data

Last updated 2026-10-24. The offline food tables in `public/data/`: where they come from, what their licences require, how the values are normalised, the file schema, how to rebuild them, and what they do not cover. The search over them is `src/nutrition/foods.ts`; the build is `scripts/foods/build.mjs`; attributions are in `THIRD_PARTY_NOTICES.md`.

## 1. Sources used

| Source | Publisher | Version | Licence (opened 2026-10-24) | Records in source | Shipped |
|---|---|---|---|---|---|
| USDA FoodData Central, Foundation Foods | USDA Agricultural Research Service | April 2026 (JSON) | CC0 1.0, public domain | 363 (the JSON array also holds 32 null entries) | 227 |
| USDA FoodData Central, SR Legacy | USDA ARS | April 2018 (JSON) | CC0 1.0 | 7,793 | 7,372 |
| USDA FoodData Central, FNDDS 2021-2023 | USDA ARS, Food Surveys Research Group | October 2024 (JSON) | CC0 1.0 | 5,432 | 5,363 |
| Australian Food Composition Database (AFCD) | Food Standards Australia New Zealand | Release 3, December 2025 (Excel) | FSANZ Data User Licence Agreement (based on CC BY-SA 3.0 AU) | 1,588 | 1,588 |
| Composition of Foods Integrated Dataset (CoFID) | Public Health England (now OHID) | 2021 (Excel) | Open Government Licence v3.0 | 2,887 | 2,624 |

Total shipped: 17,174 foods; 1,773,628 bytes raw, 487,116 bytes gzipped (budget 3 MB and 800 KB). Exact counts for every rule below are in `scripts/foods/build-report.json`.

**USDA FoodData Central.** The FDC home page, "Licensing": "USDA FoodData Central data are in the public domain and they are not copyrighted. They are published under CC0 1.0 Universal (CC0 1.0). No permission is needed for their use, but we request that users list FoodData Central as the source of the data". Redistribution in a public repository and an app: allowed. Requested citation: "U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. [Internet]. [cited 2026-10-24]. Available from https://fdc.nal.usda.gov/." Downloads: https://fdc.nal.usda.gov/download-datasets (zipped JSON). Nutrient coverage: Foundation foods are new analyses and often lack saturated fat, sugars or fibre; SR Legacy is near complete; FNDDS has every nutrient for every food and includes mixed dishes as eaten in the United States, with "additional descriptions" that name other cuisines' dishes (lumpia, pan de sal, puto, adobo, Vegemite, bubble tea).

**AFCD.** FSANZ's site is CC BY 4.0 "unless expressly noted otherwise"; the AFCD is expressly covered by the Data User Licence Agreement at https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement (page dated 25 February 2025), which is followed here. It allows copying, adapting and distributing, including derivative works, on these conditions, all met:
- a derivative work is distributed only under the same licence agreement (clause 4B). `public/data/foods-afcd.*.json` is therefore its own file under that licence; the licence does not extend to the rest of the repository or the app (clause 4B(b));
- every copy carries the licence link, the Limitation of Data Statement and a statement that the work is based on Australian data, which may not be appropriate for other countries (4A(b)). All three are in the file header and in `THIRD_PARTY_NOTICES.md`;
- attribution to FSANZ with the title and link, changes identified, and no suggestion of endorsement (4C). The file header lists the changes.

Downloads: https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/australian-food-composition-database-download-excel-files ("Food details" and "Nutrient profiles" workbooks). Nutrient coverage: every food reports energy, protein, fat, available carbohydrate, fibre, sugars, saturated fat and sodium.

**CoFID.** The GOV.UK publication page states "All content is available under the Open Government Licence v3.0, except where otherwise stated"; the dataset and its user guide state nothing otherwise. OGL v3.0 allows copying, adapting and distributing, commercially or not, with the attribution "Contains public sector information licensed under the Open Government Licence v3.0." and, where possible, a link to the licence. Download: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid. Nutrient coverage: AOAC fibre is given for about half the foods (1,548 of 2,887); the others give Englyst NSP fibre, which is not used (section 3), or none.

## 2. Sources considered and not used

| Source | Decision | Reason |
|---|---|---|
| Philippine Food Composition Tables (FNRI-DOST, PhilFCT) | not used | No licence for reuse could be found: search results for the PhilFCT pages show only a copyright notice (FNRI and DOST) and describe free online access to individual food reports, with no bulk download. Taking the data would mean scraping a site that grants no reuse. On 2026-10-24 every page of i.fnri.dost.gov.ph returned FNRI's own "Service Temporarily Unavailable" page, so the site and any terms on it could not be opened; this is unverified beyond the search results. Permission can be asked at philfct@fnri.dost.gov.ph. |
| ASEAN Food Composition Database (INMU, Mahidol University) | not used | Terms of use (https://inmu.mahidol.ac.th/aseanfoods/terms_of_use.php): "All rights reserved"; non-commercial use authorised, but "Applications for permission to reproduce or disseminate ASEANFOODS copyright materials" go to the Director of INMU. Bundling in a public repository is reproduction and dissemination; no permission is held. Distributed as a PDF. |
| New Zealand FOODfiles 2024 | not used | Terms of use (https://www.foodcomposition.co.nz/terms): "You must not modify any part of the FOODfiles Data" and it must be "presented in its original and unaltered form"; supply to third parties must be subject to the site's terms. Normalising units and carbohydrate is a modification. Distributed only as a Windows installer (MSI). |
| Canadian Nutrient File 2026 | allowed, not used | Open Government Licence - Canada 2.0 (stated on the open.canada.ca record; licence page opened) allows redistribution with "Contains information licensed under the Open Government Licence – Canada." Its FAQ says much of it is derived from the USDA nutrient database (up to SR27), with Canadian fortification levels and some Canadian foods, so it adds size but little Australian or Filipino coverage. Can be added later with the same build pattern. |
| Open Food Facts | not bundled; keep as a live API for barcodes | The database is under ODbL 1.0 and its contents under DbCL 1.0 (https://world.openfoodfacts.org/terms-of-use). A bundled extract would be a derivative database that must itself be offered under ODbL, kept apart from the AFCD file (each share-alike licence requires derivatives under itself, so the two cannot be merged into one database). It is also a crowd-sourced, per-barcode list of branded products: an extract would compete with generic foods in search, add size (the number of Australian and Philippine products was not checked) and go stale. A live lookup by barcode (roadmap) uses the data as a "Produced Work" with attribution and needs no extract. |
| USDA FoodData Central, Branded Foods | not used | Licence is fine (CC0), but it is a 3 GB per-product label list; same crowding and size problems as Open Food Facts. |
| Recipe and nutrition websites | not evaluated | Excluded by the task: no scraping, and no source whose terms forbid reuse. |

## 3. Normalisation

Every shipped food is per 100 g of the edible portion, with energy in kcal, sodium in mg and everything else in g. A value is `null` when the source reports none; it is never filled with 0 or estimated. Foods without protein, fat, carbohydrate or energy are left out.

**Energy.** The source's own kcal is used when it has one: USDA nutrient 1008, then 2048 and 2047 (Atwater specific, then general), the same order as `src/nutrition/fdc.ts`; CoFID `KCALS`. AFCD gives only kJ: "Energy with dietary fibre, equated" (FSANZ factors 17/16/37/8/29 kJ per g) divided by 4.184. A USDA food with only kJ (1062) is divided by 4.184 likewise.

**Carbohydrate is available carbohydrate everywhere** (sugars, starch and other digestible carbohydrate, without dietary fibre), matching what the analysis prompt asks Claude for.
- USDA reports "Carbohydrate, by difference" (1005), which includes fibre. Available carbohydrate = 1005 minus total dietary fibre (1079). When a food reports no fibre, 1005 is kept only if the most fibre it could hold (1005 minus total sugars) is at most 1 g per 100 g, so the error is under 1 g; otherwise the food is left out (398 SR Legacy and 94 Foundation foods). A by-difference result below 0 (analytical error in the other components) is set to 0 (10 Foundation foods).
- AFCD reports available carbohydrate directly: "Available carbohydrate, with sugar alcohols" is used (it adds sorbitol, mannitol and glycerol, which AFCD's energy equation counts at 16 kJ per g; the two columns differ for 55 of 1,588 foods, by under 1 g in the apples checked).
- CoFID reports available carbohydrate as monosaccharide equivalents (user guide, p. 10). Converted to weights with the guide's factors (p. 16): starch / 1.10; sucrose, maltose and lactose / 1.05; glucose, fructose and galactose as given; the remaining carbohydrate (total minus starch minus total sugars, mostly oligosaccharides) / 1.05. When starch or total sugars is missing, total carbohydrate / 1.05, the guide's general rule. Total sugars are converted the same way (component by component when all six sugars are given, else total / 1.05).

**Fibre.** Total dietary fibre: USDA 1079; AFCD "Total dietary fibre" (largely AOAC 985.29, per the AFCD nutrient details); CoFID "AOAC fibre" only. CoFID's Englyst NSP figure measures less (it excludes resistant starch and lignin) and is not substituted, so fibre is `null` for CoFID foods with no AOAC value.

**Other nutrients.** Total sugars: USDA 2000, else 1063; AFCD "Total sugars"; CoFID as above. Saturated fat: USDA 1258; AFCD "Total saturated fatty acids, equated (g)"; CoFID `SATFOD`. Sodium: USDA 1093; AFCD "Sodium (Na)"; CoFID `NA`. Alcohol (USDA 1018, AFCD "Alcohol", CoFID `ALCO`) is kept when above 0, to check energy against the macronutrients.

**CoFID symbols and exclusions.** "Tr" (trace) is 0; "N" (present, amount unknown) and blank are `null`. Alcoholic drinks (food group Q, given per 100 ml, 31 foods) and foods "weighed with" bones, stones or other inedible parts (198 foods) are left out. CoFID 2021 gives two foods the code 13-669 (aubergine, roasted; watercress, raw); the second keeps the code with the suffix `~2`.

**Rounding.** Energy and sodium to 0.1, grams to 0.01.

**Aliases.** FNDDS "Additional Description" attributes (type 1001), kept whole: "Pan de sal / Pandisal Filipino bread", "lumpia", "Filipino Puto cake", "Vegemite", "milk tea". AFCD food descriptions, only from sentences that begin "Also known as" or "Commonly called" ("Also known as Java Apple; Rose Apple; Makopa; Wax Apple."). SR Legacy, Foundation and CoFID give none.

**Deduplication.**
1. A Foundation food and an SR Legacy food with the same NDB number are the same food analysed again. The SR Legacy one is dropped when the Foundation one reports every nutrient it reports (23 foods); otherwise both stay, because the older record is more complete.
2. Across all sources, foods with the same name (case and punctuation ignored) and the same eight values are one food; the first in the order Foundation, SR Legacy, FNDDS, AFCD, CoFID stays and takes the other's aliases (68 FNDDS foods were such copies; for example SR Legacy "Yeast extract spread" now carries FNDDS's Marmite, Promite and Vegemite).

**Checks that stop the build.** No negative values; no gram value over 100.5; energy at most 902 kcal; sodium at most 40 g; saturated fat at most fat + 0.5 g; ids unique.

## 4. Schema

One file per licence, named `foods-<source>.<first 10 hex of the file's sha256>.json`, so a rebuilt table is never served from an old cache. `FOOD_FILES` in `src/nutrition/foods.ts` lists them; the build rewrites that line.

```
{
  "schema": 1,
  "source": "usda" | "afcd" | "cofid",
  "title", "publisher", "licence", "licenceUrl", "attribution": string,
  "notices": string[],            // required notices (AFCD) and the changes made
  "retrieved": "2026-10-24",
  "downloads": [{ "url", "sha256" }],
  "units": "per 100 g edible portion; kcal; sodium mg; others g; null = not reported by the source",
  "fields": ["id","name","kcal","protein","carbs","fat","satFat","fibre","sugars","sodium","alcohol","aliases"],
  "groups": [{ "dataType": "Foundation" | "SR Legacy" | "Survey (FNDDS)" | "AFCD" | "CoFID", "foods": Row[] }]
}
Row = [id, name, kcal, protein, carbs, fat, satFat|null, fibre|null, sugars|null, sodium|null, alcohol|null?, aliases?]
```

`id` is the source's own id: the FDC id (number) for USDA, the AFCD public food key (`F002258`), the CoFID food code (`13-145`). `carbs` is available carbohydrate. Trailing `alcohol` and `aliases` are left off when empty.

## 5. Search

`searchLocal(query, limit = 10): Promise<LocalCandidate[]>` fetches the three files on first use (same origin, so the CSP already allows it), builds an index once per session and returns the best matches. `LocalCandidate` is `Candidate` from `fdc.ts` plus `source`, `sourceId`, `missing` (nutrients the source does not report; `per100` holds 0 for them), `alias` and `score`. `fdcId` is the FDC id for USDA foods and, for AFCD and CoFID, 1,000,000,000 plus a 32-bit FNV-1a hash of `source:id` modulo 1e9 (no collisions in the shipped data; tested). `dataType` is the group name. `withEstimate(candidate, estimate)` fills the missing nutrients from Claude's estimate.

Ranking: query words are lower-cased, accents and punctuation removed, plurals folded as in `ground.ts`. A food's score is the share of the query's words it contains, weighted by how rare each word is across all foods (so "adobo" counts for more than "chicken"), plus how well the query fits its name: the share of the name's words the query accounts for ("raw", "fresh", "plain", "average", "regular" and "commercial" do not count against a name), whether the name starts with a query word, whether the query is the whole name, and whether query words that follow each other also do in the name. Matches through an alias count for half, because FNDDS additional descriptions include flavours and variants ("banana" on a banana daiquiri). Words written together match words written apart ("pandesal" and "pan de sal"), and a last word of four or more letters that matches nothing is read as typed in part.

## 6. Rebuild

```
node scripts/foods/build.mjs [--cache DIR] [--offline]
```

Node 22 built-ins and the system `unzip` (Info-ZIP) for the zip archives and the .xlsx workbooks; no npm dependencies. Downloads go to `DIR/downloads` (default: the system temp directory, `nuance-foods-cache`) and are checked against the sha256 pinned in `DOWNLOADS`; a changed file stops the build until someone reviews the new release and updates the pin. Each archive is unpacked into its own fresh directory. The build writes the three tables, removes the old ones, updates `FOOD_FILES` and writes `scripts/foods/build-report.json`; it takes about 6 seconds once the downloads are cached and is deterministic (the same inputs give byte-identical files). Then run `npm run check`.

## 7. Known gaps

- **Filipino dishes.** Covered only through FNDDS dishes and aliases: adobo (FNDDS "Adobo, with rice" and "Adobo, with noodles", meat with some rice or noodles; no plain chicken or pork adobo), lumpia (egg rolls), pandesal (hard white roll), puto (glutinous rice cake), leche flan (flan), menudo (only as Mexican pozole), bagoong (fish sauce), chop suey, milkfish, tilapia, coconut milk, jackfruit, mango, Spam, corned beef, makopa (AFCD wax jambu). No match at all for sinigang, pancit (any), lechon, sisig, kare-kare, tinola, nilaga, bulalo, afritada, caldereta, longganisa, tocino, tapa, bibingka, suman, champorado, arroz caldo, lugaw, goto, halo-halo, ube, turon, banana cue, ensaymada, siopao, siomai, dinuguan, laing, pinakbet, kangkong, ampalaya, malunggay, calamansi, tuyo, daing, galunggong, taho, balut, chicharon, kwek-kwek, isaw, garlic rice (sinangag), ginataan, polvoron, yema, kutsinta, sapin-sapin, biko, okoy, tortang talong. Some ingredients and dishes exist under English names, with no alias connecting the Filipino word: bitter gourd (SR Legacy "Balsam-pear (bitter gourd)", ampalaya), drumstick leaves (SR Legacy and CoFID, malunggay), taro leaves (the base of laing), mung beans (monggo), squid, and FNDDS "Congee" (rice porridge, close to lugaw). Searched in English they are found; searched in Filipino they are not. Water spinach (kangkong) and calamansi are in none of the shipped tables under any name searched (water spinach, swamp cabbage, convolvulus, calamondin, kalamansi). These items keep Claude's estimate. The real fix is the PhilFCT, which needs FNRI's permission.
- **Australian foods.** AFCD covers staples, takeaway items and brands (meat pie, sausage roll, lamington, Anzac biscuit, Tim Tam style biscuit, Vegemite, Weet-Bix, Milo, flat white, barramundi, kangaroo, damper). Not found: dim sim, Chiko roll, fairy bread, laksa, nasi goreng, banh mi, poke bowl.
- **Missing values.** 18 of 227 Foundation foods, 5,823 of 7,372 SR Legacy foods and 1,372 of 2,624 CoFID foods report all four of saturated fat, fibre, sugars and sodium; the rest have one or more `null`. AFCD and FNDDS are complete.
- **Energy factors differ by source.** Within 20 kcal or 15 % of 4/4/9/7 kcal per g of protein, carbohydrate, fat and alcohol plus 2 per g of fibre for at least 99 % of each group; outliers are mostly sweeteners and polyols (FNDDS stevia and monk fruit powders list 0 kcal with 100 g carbohydrate), very high-fibre foods (bran, cocoa, dried herbs) and CoFID cream of tartar (239 kcal with no protein, fat or carbohydrate).
- **Search speed on a phone** was not measured. In this container, parsing the three files takes 20 to 30 ms, building the index 100 to 190 ms, a search 1 to 15 ms, and the first query with a word found only written together (such as "pandesal") about 115 ms once.
- **Matching through `choose()`.** `searchLocal` finds "pandesal" (through FNDDS's "Pan de sal") and ranks "Adobo, with rice" first for "chicken adobo", but `ground.ts` `choose()` compares only the description's words, unweighted: it rejects the pandesal roll (no word "pandesal" in the description) and, for "chicken adobo" at 180 to 200 kcal, picks "Chicken feet" over the adobo dishes because "chicken" is the description's first word. See section 8; until then such items keep Claude's estimate or get a poor match.

## 8. Integration

Wired on 2026-10-24:

1. `src/nutrition/lookup.ts` searches `searchLocal(query, 12)` once for every distinct name, at most 24 a scan; there is no live USDA lookup and no USDA key any more.
2. `src/nutrition/ground.ts` `applyCandidate` fills a nutrient the table does not report from Claude's value.
3. `choose()` uses the search score (`Candidate.score`), which counts aliases and words written together, so "pandesal" and "chicken adobo" match (tests in `tests/ground.test.ts` run on the shipped tables).
4. Saved data: `Source` is `label`, `database` or `estimate`, and `Item.food` keeps the food's id, description and table.
5. Attribution: Profile > Food data names the FSANZ AFCD Release 3 (with its licence, the changes and no endorsement) and carries the OGL v3.0 statement for CoFID. USDA data is CC0 and is not named on screen (owner, 2026-10-24); it is credited in `THIRD_PARTY_NOTICES.md`.
6. The service worker precaches the three files; `scripts/verify-dist.mjs` fails the build if one is missing.
7. `docs/ARCHITECTURE.md` sections 2, 5 and 7 describe the tables.
