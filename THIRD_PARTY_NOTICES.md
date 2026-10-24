# Third-party notices

Nuance bundles food composition data from the sources below, in `public/data/`. Each data file also carries its own licence, attribution and notices in its header. How the data was selected and changed is in `docs/FOOD-DATA.md`.

## USDA FoodData Central

Files: `public/data/foods-usda.*.json` (Foundation Foods, April 2026; SR Legacy, April 2018; FNDDS 2021-2023, October 2024).

U.S. Department of Agriculture, Agricultural Research Service, Beltsville Human Nutrition Research Center. FoodData Central. [Internet]. [cited 2026-10-24]. Available from https://fdc.nal.usda.gov/.

Licence: public domain, published under CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/. USDA asks users to list FoodData Central as the source of the data.

## Australian Food Composition Database (FSANZ)

File: `public/data/foods-afcd.*.json`.

Food Standards Australia New Zealand (FSANZ), Australian Food Composition Database - Release 3 (December 2025), https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd

Licence: FSANZ Data User Licence Agreement, based on a Creative Commons Attribution-ShareAlike 3.0 Australia licence: https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement. The file `public/data/foods-afcd.*.json` is a derivative work of the Australian Food Composition Database and is distributed under that same licence agreement. The licence covers that file only; the rest of this repository is not under it.

Limitation of Data Statement: There are limitations associated with food composition databases. Food composition data used in the database or databases may represent an average of the nutrient content of a particular sample of foods and ingredients, determined at a particular time. The nutrient composition of foods and ingredients can vary substantially between batches and brands because of a number of factors, including changes in season, processing practices and ingredient source, and methods of calculation.

This work is based on Australian data, and Australian data may not be appropriate for use in other countries.

Changes made: only energy, protein, fat, available carbohydrate (with sugar alcohols), saturated fat, dietary fibre, total sugars, sodium and alcohol are kept; energy is converted from kJ to kcal by dividing by 4.184; values are rounded (energy and sodium to 0.1, grams to 0.01); aliases are taken from the "Also known as" and "Commonly called" sentences of the food descriptions.

FSANZ does not endorse Nuance or its use of the data. The data is provided "as is", without warranty, as set out in clauses 7 and 8 of the licence agreement.

## McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID)

File: `public/data/foods-cofid.*.json`.

Contains public sector information licensed under the Open Government Licence v3.0.

Licence: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

Source: Public Health England, McCance and Widdowson's The Composition of Foods Integrated Dataset 2021, https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid

Changes made: carbohydrate and total sugars are converted from monosaccharide equivalents to weights; trace values are read as 0; alcoholic drinks (given per 100 ml) and foods weighed with inedible parts are left out; values are rounded.
