# Metabolism

How Nuance estimates what a person burns, sets daily energy and protein targets for their goal, notices when the body pushes back after weight loss, and what it suggests then. The engine is `src/metabolism/` (pure functions, no DOM, network or storage); its tests are `tests/metabolism.test.ts`. Every number below comes from a source in the list at the end, which was opened and read for this document, or is marked as a Nuance decision with the reason.

Tags in square brackets, such as [Mifflin 1990], point to the sources list.

## Summary

| Question | Nuance's answer | Main sources |
|---|---|---|
| Resting burn | Mifflin-St Jeor; Cunningham (lean mass) only with measured body fat in an active person | [Mifflin 1990], [Frankenfield 2003], [Frankenfield 2005], [Cunningham 1980], [ten Haaf 2014] |
| Daily burn | Resting x activity level (PAL) from the FAO bands; spread about 10% | [FAO 2004] |
| Energy in 1 kg of weight change | Not a fixed 7,700 kcal: about 5,550 kcal with 10 kg of body fat to about 8,300 with 60 kg (Hall's model with Forbes' curve) | [Hall 2008], [Forbes 2000], [Thomas 2013] |
| Real burn | Measured from the food log and the weight trend over 28-day windows, combined with the formula by precision; takes over as data builds | [Hall & Chow 2011], [Sanghvi 2015] |
| Adaptation | Real but variable: from about 50 to about 500 kcal/day below what mass explains, mostly lower activity cost; appetite rises more (about 100 kcal/day per kg lost) | [Leibel 1995], [Rosenbaum & Leibel 2010], [Müller 2015], [Martins 2020a], [Polidori 2016] |
| Rate of loss | 0.5% of body weight a week by default, 1% at most | [Helms 2014b], [Garthe 2011], [Purcell 2014] |
| Rate of gain (muscle) | 0.25% a week by default, 0.5% at most; no surplus above the body fat of BMI 25 | [Iraki 2019] |
| Lowest target | 1,200 kcal (women), 1,500 kcal (men); never a deficit below it | [Jensen 2014] |
| Protein | Deficit: 2.3 g per kg of lean mass. Muscle: 1.6 g/kg. Otherwise 0.83 g/kg, or 1.0 to 1.2 g/kg from age 65 | [Helms 2014a], [Morton 2018], [Rand 2003], [Bauer 2013] |
| Response to adaptation or 10% loss | A 2-week maintenance break, resistance training 3 times a week, more steps | [Byrne 2018], [Peos 2021], [Sardeli 2018], [Paluch 2022] |
| No targets for | Under 18, pregnant, breastfeeding, invalid input; no deficit below BMI 18.5 | [Mifflin 1990], [FAO 2004], [WHO NLiS] |

## 1. Resting expenditure

Resting expenditure is what the body burns lying still, awake and fasted: roughly 60% of a day's total [Rosenbaum & Leibel 2010].

**Mifflin-St Jeor** [Mifflin 1990], derived by indirect calorimetry in 498 healthy adults aged 19 to 78, normal weight and obese (R² 0.71):

- men: 10 x weight (kg) + 6.25 x height (cm) - 5 x age (y) + 5
- women: 10 x weight (kg) + 6.25 x height (cm) - 5 x age (y) - 161

Example: a man of 30, 180 cm, 80 kg: 800 + 1125 - 150 + 5 = 1,780 kcal/day.

How accurate it is for one person:

- In 130 adults with BMI 18.8 to 96.8, Mifflin missed the measured value by more than 10% in 22% of people; Harris-Benedict in 33% and Owen in 35% [Frankenfield 2003].
- A systematic review found Mifflin "the most reliable", within 10% of measured in more non-obese and obese people than any other equation and with the narrowest error range, but warned that older adults and ethnic minorities were underrepresented in the studies [Frankenfield 2005].
- Nuance's error model: if 22% fall outside ±10% and errors are roughly normal, one standard deviation is 10% / 1.2265 = **8.2%**. This is a derivation, not a published figure.
- Population caveat: in 153 obese Filipino adults with prediabetes or type 2 diabetes, Harris-Benedict overestimated measured basal rate by 329 kcal/day (1,628 vs 1,299) [Luy 2018]. No study validating Mifflin in Filipino adults was found. This is one reason the measured value (section 6) takes over from the formula.

**Lean-mass equations.** Cunningham: 500 + 22 x lean (fat-free) mass in kg [Cunningham 1980], derived from the Harris-Benedict data, where lean mass was the single best predictor. In 90 recreational athletes, Cunningham predicted accurately while Harris-Benedict, WHO, Schofield, Mifflin and Owen were each accurate in fewer than half [ten Haaf 2014]. In 56 overweight or obese former athletes, all seven equations tested (including Cunningham and Katch-McArdle) overestimated by 70 to 300 kcal/day (4.3% to 14.9%) [Jesus 2020]. Mifflin's paper also gives a lean-mass form, 19.7 x lean mass + 413 [Mifflin 1990]. Katch-McArdle's original source is a textbook that was not opened for this work, so Nuance does not use it.

**Decision.** Mifflin by default. Cunningham only when body fat has been measured *and* the person is moderately or vigorously active, the group where it beat Mifflin; bathroom-scale body fat is imprecise and Cunningham overestimated in overweight people, so measured fat alone does not switch the equation.

## 2. Activity and total expenditure

Total daily expenditure = resting x PAL (physical activity level, total divided by basal) [FAO 2004, section 5.3]. The FAO bands (Table 5.3):

| Band | PAL | FAO worked example |
|---|---|---|
| Sedentary or light activity | 1.40 to 1.69 | 1.53 |
| Active or moderately active | 1.70 to 1.99 | 1.76 |
| Vigorous or vigorously active | 2.00 to 2.40 | 2.25 |

Values above 2.40 "are difficult to maintain over a long period of time", and the consultation called 1.40 "the lower limit of the sedentary range" [FAO 2004].

**Decision.** Four choices: sedentary 1.40 (FAO's lower limit; band 1.40 to 1.55), light 1.55, moderate 1.85, vigorous 2.20 (band midpoints). PAL is defined on basal rate and Mifflin predicts resting rate, which runs a little higher; the difference sits inside the error below and the measured value corrects it.

**Uncertainty.** Nuance treats the equation error (8.2%) and the spread of PAL within the chosen band (uniform: band width / √12 / PAL, about 5%) as independent, so the formula's total is good to about ±10% (one SD). Example: the man above, light activity: 1,780 x 1.55 = 2,759 kcal/day, SD 271 kcal.

Age: in a doubly labelled water database spanning 8 days to 95 years, expenditure adjusted for lean mass was stable from 20 to 60 and fell after 60 [Pontzer 2021]. Mifflin's age term covers part of this; beyond 78 the equation is outside the ages it was built on.

## 3. Energy in weight change

The common rule, 3,500 kcal per pound (7,716 kcal/kg, 32.2 MJ/kg), "approximately matches the predicted energy density of lost weight in obese subjects with an initial body fat above 30 kg but overestimates the cumulative energy deficit required per unit weight loss for people with lower initial body fat" [Hall 2008]. Used as a straight line over months it "grossly overestimates actual weight loss" [Thomas 2013]; the dynamic model shows why: expenditure falls as weight falls [Hall 2011].

**Model used.** A kg of fat holds 39.5 MJ (9,441 kcal) and a kg of lean tissue 7.6 MJ (1,816 kcal) [Hall 2008; Hall 2011]. Forbes found that the lean share of a weight change depends on body fat: thin people lose or gain more lean tissue [Forbes 2000]. Hall's form of Forbes' curve, lean = 10.4 x ln(fat) + constant, gives a lean share of 10.4 / (10.4 + F) for a person with F kg of fat [Hall 2008]. So the energy per kg of change is

ρ(F) = 9,441 x (1 - s) + 1,816 x s, where s = 10.4 / (10.4 + F)

- 30 kg of fat: s = 0.257, ρ = 7,478 kcal/kg.
- 10 kg of fat: s = 0.510, ρ = 5,554 kcal/kg.

Body fat comes from a measurement when given, otherwise from Deurenberg's formula, body fat % = 1.2 x BMI + 0.23 x age - 10.8 x sex - 5.4 (men 1, women 0), standard error 4.1 percentage points, slightly high in obese people [Deurenberg 1991]. As weight changes, fat and lean move along Forbes' curve from that starting point.

**Timing.** In Hall's dynamic model, a lasting change in intake reaches half its final weight change in about a year and 95% in about three; "every change of energy intake of 100 kJ per day will lead to an eventual bodyweight change of about 1 kg" for an average overweight adult (24 kcal/day per kg) [Hall 2011].

**What this means for Nuance.** A fixed intake gives a slowing loss, so targets are recomputed from the current trend weight, never from the start weight with a fixed rule.

## 4. Adaptation: what the body does after weight loss

The owner's question: after a first, disciplined phase of about 10% loss, does the body push back? The evidence says yes, in two ways, and the second is bigger.

**Expenditure falls more than the lost mass explains** ("adaptive thermogenesis"):

- 41 people held 10% to 20% below their usual weight: total expenditure fell by 6 ± 3 kcal per kg of lean mass per day in people never obese and 8 ± 5 in obese people, with resting and non-resting expenditure each down 3 to 4 kcal/kg lean mass [Leibel 1995]. For a person with 60 kg of lean mass that is roughly 360 to 480 kcal/day (Nuance's arithmetic).
- Keeping 10% or more off goes with a 20% to 25% fall in daily expenditure, "10–15% below what is predicted solely on the basis of alterations in fat and lean mass". Non-resting expenditure accounts for up to 85% to 90% of the shortfall, through about 20% more efficient muscle work at low effort rather than less moving [Rosenbaum & Leibel 2010].
- It lasts: people who had kept 10% off for more than a year showed the same reduction as those who had just lost it [Rosenbaum 2008]. Six years after "The Biggest Loser", resting expenditure was 499 ± 207 kcal/day below what body composition predicts (n = 14), and those keeping more weight off had more slowing [Fothergill 2016]. With 38% loss over 30 weeks despite exercise, resting adaptation was -244 kcal/day at week 6 and -504 at week 30 [Johannsen 2012].
- When it starts: in 32 men eating half their needs for 3 weeks, adaptation was 108 kcal/day (72 after allowing for changes inside lean mass) and was significant within 3 days, tied to falling insulin and fluid shifts [Müller 2015]. A review by the same group says it "takes more than 2 wk to develop" under controlled underfeeding and averages 0.5 MJ (120 kcal) with wide differences between people [Müller & Bosy-Westphal 2013]. In free-living overweight people on 25% restriction or a low-calorie diet (the two groups combined), body-composition-adjusted expenditure was down 431 kcal/day at 3 months and 240 at 6 months, and physical activity fell [Redman 2009].
- Contested: in 171 overweight women who lost 12 kg, resting adaptation was -54 ± 105 kcal/day after loss and gone at 1 and 2 years [Martins 2020a]; in 71 people with obesity it was -92 kcal/day at the end of an 8-week diet, halved after 4 weeks of stable weight, absent at 1 year, and did not predict regain [Martins 2020b]. Part of the measured adaptation is the person still being in deficit when measured.

**Appetite rises, and more.** Weight loss led to eating about 100 kcal/day above baseline per kg lost, "more than threefold larger than the corresponding energy expenditure adaptations" [Polidori 2016]. A year after a 13.5 kg loss, appetite hormones (leptin, ghrelin, peptide YY and others) and hunger had not returned to baseline [Sumithran 2011].

**Movement.** Non-exercise activity (fidgeting, posture, daily movement) explained two thirds of the rise in expenditure when people were overfed [Levine 1999]; in restriction, activity fell [Redman 2009]. People keeping off 26 kg for 9 years spent 812 kcal/day on activity, against 621 to 637 in controls [Ostendorf 2019].

**Plateaus.** Clinical weight loss usually stops at about 6 months. Modelling showed this is mostly intermittent loss of adherence, not adaptation [Thomas 2014].

**What Nuance takes from this.** Adaptation is real, varies a lot between people (from about 50 to about 500 kcal/day in these studies) and is partly a state of being in deficit, so Nuance measures it from the person's own data instead of assuming a number. Rising appetite and slipping intake explain more stalls than expenditure does, so a stall is checked for those first.

## 5. Responses and how strong the evidence is

| Response | What the studies show | Strength | Nuance |
|---|---|---|---|
| Rate of loss | Recommended 0.5% to 1% of body weight a week to keep muscle [Helms 2014b, narrative review]. Athletes planned to lose 0.7% a week gained 2.1% lean mass; those planned to lose 1.4% a week (they achieved 1.0%) kept lean mass unchanged [Garthe 2011, RCT, n = 24]. Rapid loss (12 weeks) and gradual loss (36 weeks) were regained alike, 71% at 144 weeks [Purcell 2014, RCT, n = 200]. | Moderate; lean-mass data from athletes | Default 0.5%/week; never above 1%/week |
| Diet breaks | 2 weeks on, 2 weeks at maintenance (16 weeks of restriction over 30): 14.1 vs 9.1 kg lost, more fat lost, smaller adjusted fall in resting expenditure; in the 28 followed up, 8.1 kg more kept off at 6 months [Byrne 2018, MATADOR, men with obesity, 36 per protocol]. 1-week breaks every 3 weeks in trained adults: same fat and lean change, less hunger [Peos 2021, ICECAP, n = 61]. | Limited: two small RCTs, mixed on fat loss | 2-week maintenance block after 10% loss, 12 weeks of loss, or probable adaptation |
| Protein in a deficit | Higher-protein diets kept 0.43 kg more lean mass and 596 kJ/day of resting expenditure [Wycherley 2012, meta-analysis, 24 RCTs]. 2.4 vs 1.2 g/kg in a 40% deficit with hard training: lean mass +1.2 vs +0.1 kg [Longland 2016, RCT, n = 40]. Lean, trained people: 2.3 to 3.1 g per kg lean mass [Helms 2014a, systematic review of 6 studies; ISSN 2017 gives 2.3 to 3.1 g/kg for trained people in a deficit, Jäger 2017]. | Moderate; best data in trained people | 2.3 g per kg of lean mass (low end, scaled to lean mass so it does not grow with fat) |
| Protein for muscle | Gains in lean mass stop rising beyond 1.62 g/kg/day (95% CI 1.03 to 2.20); authors suggest about 2.2 to be sure [Morton 2018, meta-analysis, 49 RCTs]. | Strong for the direction, wide interval | 1.6 g/kg |
| Protein baseline | Average requirement 0.65 g/kg, allowance (97.5th percentile) 0.83 g/kg [Rand 2003, meta-analysis]. Over 65: at least 1.0 to 1.2 g/kg, 1.2 or more when active [Bauer 2013, PROT-AGE position paper]. | Strong (requirement); expert consensus (older adults) | 0.83 g/kg; 1.0 or 1.2 g/kg from 65 |
| Resistance training | In obese older adults dieting, training 3 times a week prevented 93.5% of lean-mass loss [Sardeli 2018, meta-analysis, 6 RCTs]. Lean mass fell 2% to 3% with resistance or combined training vs 5% with aerobic only [Villareal 2017, RCT, n = 160]. It kept lean mass and resting expenditure after a 12 kg loss [Hunter 2008, RCT]. | Strong for lean mass | Suggest 3 sessions a week alongside breaks and stalls |
| Steps | Mortality fell with more steps up to 6,000 to 8,000 a day (60 and over) and 8,000 to 10,000 (under 60) [Paluch 2022, 15 cohorts, 47,471 adults]. Long-term maintainers move more [Ostendorf 2019]. | Observational | Suggest 8,000 a day (6,000 from 60). No kcal-per-step figure, as none was verified |
| Energy floor | Usual prescriptions are 1,200 to 1,500 kcal/day for women and 1,500 to 1,800 for men; diets under 800 kcal/day only with medical supervision [Jensen 2014, AHA/ACC/TOS guideline]. | Guideline | Never a deficit target below 1,200 (women) or 1,500 (men) |

## 6. Measuring real expenditure from the log

Energy balance: what is burnt = what is eaten - the change in body stores. Over a window, Nuance computes

expenditure = mean logged intake - ρ(F) x (slope of the weight trend in kg/day)

This is the idea behind Hall and Chow's method, which recovered intake changes from weights alone [Hall & Chow 2011] and matched doubly labelled water within 40 kcal/day on average over 2 years in 140 people (individual root-mean-square difference 215 kcal/day) [Sanghvi 2015].

**Noise.** Day-to-day weight swings are about 0.5 kg (SD) [Hall & Chow 2011]. Glycogen is stored with 3 to 4 parts water, so the first days of a diet lose water fast and a return to carbohydrate brings it back [Kreitzman 1992]. Weight runs higher on Sunday and Monday and falls through the week [Orsama 2014]; within-week swings averaged 0.35% [Turicchi 2020]. Hall and Chow's simulations added day-to-day swings in sodium and carbohydrate; no direct figure for the effect of sodium alone was verified for this document.

**How much data.** Daily weights over more than 28 days were needed for a 95% interval narrower than 300 kcal/day [Hall & Chow 2011].

**Logging bias.** People who said they could not lose weight on under 1,200 kcal under-reported intake by 47% and over-reported activity by 51% [Lichtman 1992]. Nuance's measured expenditure is in the units of the person's own log: if someone logs 20% low every day, the measured maintenance is 20% low too, and targets set against the same log still work. Logging that is complete on some days and not others cannot be corrected; the app should pass only finished days.

**Nuance's rules** (`src/metabolism/adaptive.ts`):

1. Windows of 28 days ending today, back to the start of the data.
2. The first 14 days after the first weigh-in are skipped (glycogen water).
3. A window counts only with at least 4 weigh-ins spanning 14 days and at least half its days logged.
4. A window whose intake changed by more than 300 kcal/day between its halves is set aside (water and glycogen move with intake). This is a Nuance threshold.
5. The trend slope comes from least squares with points beyond 3 SD removed. Its standard error is doubled for water swings that run over several days: with 28 daily weights and 0.5 kg noise this gives a 95% interval of about ±350 kcal/day, the figure Hall and Chow report for that design.
6. Running estimate (a one-state Kalman filter): start from the formula and its spread; for each window carry the estimate to the window's weight by the resting equation, widen it by 5% for real change (a Nuance choice), and combine it with the window's value, each weighted by 1 / variance.
7. Confidence is the share of the formula's variance the data has removed: none (no usable window), low (under 0.40), medium (0.40 to 0.65), high (0.65 and over).

So the first measured value can appear about 4 weeks after the first weigh-in (two weeks skipped, then two weeks of data). In simulations with daily weigh-ins and logs, one full 28-day window (6 weeks in) gave medium or high confidence, and 12 weeks gave high. In tests, with true expenditure 2,600 kcal/day and the formula saying about 2,940, 12 weeks of data brought the estimate within 150 kcal; the mean error over 20 random runs was under 60 kcal.

## 7. Trend weight

The trend at each weigh-in is a local straight line through nearby weigh-ins, weighted by 2^(-days apart / 7). It follows a steady loss without the lag of a plain moving average and uses later weigh-ins when they exist. Weigh-ins more than 1.5 kg (3 SD) off the first fit count one tenth as much, so a mistyped weight barely moves it. On 60 days of 0.5 kg noise the trend's error was under half the raw error. The 7-day half-life is a Nuance choice.

## 8. Detection rules

**Probable adaptation** (`detectAdaptation`). Baseline: expenditure measured in the 42 days after the glycogen skip. Now: the last 42 days, which must not overlap the baseline (so at least 14 + 42 + 42 = 98 days of data). Expected now = baseline x resting(current weight) / resting(baseline weight), that is, activity held equal. Probable when the person has lost at least 2%, the gap (expected - measured) is at least 5% of expected (half the 10% to 15% reported for a maintained 10% loss [Rosenbaum & Leibel 2010]; Nuance's threshold) and larger than 1.645 standard errors (one-sided 95%). In 40 simulated runs of the owner's scenario (below), it was found in 37; in the 40 matching runs without adaptation it was never flagged.

**Plateau** (`detectPlateau`, goal "lose" with a deficit planned). The trend over the last 28 days lost less than 0.15% of body weight a week. With 0.5 kg noise, a 28-day slope has an SD of about 0.09%/week, so a true stall is caught nearly always and a real 0.5%/week loss almost never; in 100 simulated runs: stalls 100 of 100, steady loss 0 of 100, a slow 0.25%/week loss 21 of 100. Causes, checked in this order because the evidence ranks adherence above adaptation [Thomas 2014; Polidori 2016]: fewer than 60% of days logged; intake up 150 kcal/day or more on the 28 days before; probable adaptation; otherwise unexplained (the measured maintenance is lower than thought, so the target moves down, or, if already at the floor, more steps).

**Other rules.** Loss faster than 1%/week counts only when it beats the cap by more than one standard error over 28 days, so noise does not raise it. Weight drift on a maintenance goal: 0.25%/week or more over 28 days (half the default loss rate). Protein low: under 90% of target over at least 7 of the last 14 days. Measured and formula maintenance differing by 10% or more, with medium or high confidence, is reported. A 2-week break is suggested after a losing streak of 10% (the owner's milestone; [Leibel 1995] used 10%) or 12 weeks (adjusted expenditure was already down at 3 months [Redman 2009]). These thresholds are Nuance decisions.

**The owner's scenario, as tested.** A man of 40, 180 cm, 100 kg burning 2,900 kcal/day eats 2,000. His expenditure falls with his mass, he reaches 90 kg around day 88, and from then a further 300 kcal/day drop ramps in over two weeks. At day 160 the engine reports adaptation with a measured gap of 316 kcal/day (11.8% below expected), suggests 2 weeks at its measured maintenance, then resistance training and steps. The same man without the extra drop gets no adaptation insight but is offered the break at 10%.

## 9. Who the maths does not drive

Handled in logic, with no warning text (owner rule):

- **Under 18**: Mifflin was built on ages 19 to 78 [Mifflin 1990]; Deurenberg's adult formula differs from the one for children [Deurenberg 1991]; FAO treats children and adolescents separately [FAO 2004]. No energy or protein target.
- **Pregnant**: needs rise by about 85, 285 and 475 kcal/day in the three trimesters [FAO 2004, chapter 6]. No target.
- **Breastfeeding**: needs rise by about 505 kcal/day for the first six months [FAO 2004, chapter 7]. No target.
- **BMI under 18.5** (underweight [WHO NLiS]): no deficit; the "lose" goal gets maintenance and an "underweight" insight.
- **Invalid input** (height outside 100 to 250 cm, weight outside 25 to 350 kg, body fat outside 3% to 70%, unknown sex or activity, malformed date): no target.
- **Floor and rate**: no deficit target below the floor; a planned loss never above 1%/week and a planned gain never above 0.5%/week, after rounding (deficits round up, surpluses down).

Not covered, because the app has no input for them: eating disorders, kidney disease (PROT-AGE notes that severe kidney disease can require less protein [Bauer 2013]), medicines that change appetite or weight, and conditions that change resting expenditure. These are open risks.

BMI cut-offs are the international ones. A WHO consultation found risk rising at lower BMI in many Asian populations (from 22 to 25) but kept the international cut-offs and named 23, 27.5, 32.5 and 37.5 as extra action points [WHO 2004]. Nuance has no ethnicity input and uses 18.5 and 25.

## 10. Insights

Insights are data; the UI words them. Each has `id`, `severity` (high, medium, low), `numbers`, an `action` and `also` (further actions, most useful first). They are ranked by severity, then in this order:

| id | numbers | action |
|---|---|---|
| excluded | (reason: under-18, pregnant, breastfeeding, invalid) | none |
| underweight | bmi | no-deficit (kcal) |
| intake-below-floor | meanIntakeKcal, floorKcal, days | raise-intake (kcal) |
| rate-too-fast | ratePctPerWeek, maxPctPerWeek, days | raise-intake (kcal) |
| gain-too-fast | ratePctPerWeek, maxPctPerWeek, days | reduce-intake (kcal) |
| adaptation | expectedKcal, observedKcal, gapKcal, gapPct, lossPct, weeks | diet-break (weeks, kcal); also resistance-train, add-steps |
| plateau | days, ratePctPerWeek, meanIntakeKcal, previousMeanIntakeKcal (cause: logging-gaps, intake-rise, adaptation, unexplained) | log-consistently, return-to-target, diet-break, reduce-intake or add-steps |
| diet-break | lossPct, weeksLosing (trigger: milestone, duration) | diet-break (weeks, kcal) |
| protein-low | averageG, targetG, days | raise-protein (grams, targetGrams) |
| expenditure-update | formulaKcal, measuredKcal, differenceKcal | update-target (kcal) |
| rate-too-slow | ratePctPerWeek, plannedPctPerWeek, meanIntakeKcal, targetKcal | return-to-target or update-target |
| drift | ratePctPerWeek, days | update-target (kcal) |
| need-data | windowDays, loggedDays, weighIns, minLoggedDays, minWeighIns | log-and-weigh (days, weighInsPerWeek) |
| trend-on-track | ratePctPerWeek, plannedPctPerWeek | keep |

## 11. Limits and what could not be verified

- The Australian and New Zealand nutrient reference values for protein (NHMRC) could not be opened (the sites returned errors), nor the WHO 2007 protein report; the 0.83 g/kg baseline therefore rests on the meta-analysis behind those reports [Rand 2003].
- Katch-McArdle's original source was not opened; Nuance does not use it.
- No validation of Mifflin in Filipino adults was found; only Harris-Benedict's overestimate in obese Filipinos with diabetes or prediabetes [Luy 2018].
- No verified figure for the size of sodium-driven water swings, or for the total mass of water held with glycogen.
- No verified kcal-per-step figure.
- Muscle gain: tissue energy alone gives a surplus of about 5% for 0.25%/week; a narrative review recommends 10% to 20% [Iraki 2019]. Extra non-exercise movement when overfed [Levine 1999] would explain part of the gap. Nuance starts from tissue energy and lets the measured maintenance correct it.
- The adaptation and plateau rules were tested on simulated people whose expenditure follows the resting equation; real bodies are noisier, so the field rates of detection will differ.
- The engine takes sex, age or birth year, height, weight, body fat, activity, pregnancy and breastfeeding as inputs. The profile holds them, with weigh-ins in IndexedDB (owner approval, 2026-10-24); the app passes only finished logged days.

## Sources

Every source below was opened during this work (PubMed records through NCBI E-utilities, PMC full text where noted, or the publisher's page).

- [Bauer 2013] Bauer J, Biolo G, Cederholm T, et al. Evidence-based recommendations for optimal dietary protein intake in older people: a position paper from the PROT-AGE Study Group. J Am Med Dir Assoc 2013;14(8):542-59. doi:10.1016/j.jamda.2013.05.021. https://pubmed.ncbi.nlm.nih.gov/23867520/
- [Byrne 2018] Byrne NM, Sainsbury A, King NA, Hills AP, Wood RE. Intermittent energy restriction improves weight loss efficiency in obese men: the MATADOR study. Int J Obes 2018;42(2):129-138. doi:10.1038/ijo.2017.206. https://pubmed.ncbi.nlm.nih.gov/28925405/ (full text PMC5803575)
- [Cunningham 1980] Cunningham JJ. A reanalysis of the factors influencing basal metabolic rate in normal adults. Am J Clin Nutr 1980;33(11):2372-4. doi:10.1093/ajcn/33.11.2372. https://pubmed.ncbi.nlm.nih.gov/7435418/
- [Deurenberg 1991] Deurenberg P, Weststrate JA, Seidell JC. Body mass index as a measure of body fatness: age- and sex-specific prediction formulas. Br J Nutr 1991;65(2):105-14. doi:10.1079/bjn19910073. https://pubmed.ncbi.nlm.nih.gov/2043597/
- [FAO 2004] FAO/WHO/UNU. Human energy requirements. Report of a Joint FAO/WHO/UNU Expert Consultation, Rome, 17-24 October 2001. FAO Food and Nutrition Technical Report Series 1. Rome, 2004. https://www.fao.org/4/y5686e/y5686e00.htm (chapter 5: y5686e07.htm; chapter 6: y5686e0a.htm; chapter 7: y5686e0b.htm)
- [Forbes 2000] Forbes GB. Body fat content influences the body composition response to nutrition and exercise. Ann N Y Acad Sci 2000;904:359-65. doi:10.1111/j.1749-6632.2000.tb06482.x. https://pubmed.ncbi.nlm.nih.gov/10865771/
- [Fothergill 2016] Fothergill E, Guo J, Howard L, et al. Persistent metabolic adaptation 6 years after "The Biggest Loser" competition. Obesity 2016;24(8):1612-9. doi:10.1002/oby.21538. https://pubmed.ncbi.nlm.nih.gov/27136388/
- [Frankenfield 2003] Frankenfield DC, Rowe WA, Smith JS, Cooney RN. Validation of several established equations for resting metabolic rate in obese and nonobese people. J Am Diet Assoc 2003;103(9):1152-9. doi:10.1016/s0002-8223(03)00982-9. https://pubmed.ncbi.nlm.nih.gov/12963943/
- [Frankenfield 2005] Frankenfield D, Roth-Yousey L, Compher C. Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review. J Am Diet Assoc 2005;105(5):775-89. doi:10.1016/j.jada.2005.02.005. https://pubmed.ncbi.nlm.nih.gov/15883556/
- [Garthe 2011] Garthe I, Raastad T, Refsnes PE, Koivisto A, Sundgot-Borgen J. Effect of two different weight-loss rates on body composition and strength and power-related performance in elite athletes. Int J Sport Nutr Exerc Metab 2011;21(2):97-104. doi:10.1123/ijsnem.21.2.97. https://pubmed.ncbi.nlm.nih.gov/21558571/
- [Hall 2008] Hall KD. What is the required energy deficit per unit weight loss? Int J Obes 2008;32(3):573-6. doi:10.1038/sj.ijo.0803720. https://pubmed.ncbi.nlm.nih.gov/17848938/ (full text PMC2376744)
- [Hall 2011] Hall KD, Sacks G, Chandramohan D, Chow CC, Wang YC, Gortmaker SL, Swinburn BA. Quantification of the effect of energy imbalance on bodyweight. Lancet 2011;378(9793):826-37. doi:10.1016/S0140-6736(11)60812-X. https://pubmed.ncbi.nlm.nih.gov/21872751/ (full text PMC3880593)
- [Hall & Chow 2011] Hall KD, Chow CC. Estimating changes in free-living energy intake and its confidence interval. Am J Clin Nutr 2011;94(1):66-74. doi:10.3945/ajcn.111.014399. https://pubmed.ncbi.nlm.nih.gov/21562087/ (full text PMC3127505)
- [Helms 2014a] Helms ER, Zinn C, Rowlands DS, Brown SR. A systematic review of dietary protein during caloric restriction in resistance trained lean athletes: a case for higher intakes. Int J Sport Nutr Exerc Metab 2014;24(2):127-38. doi:10.1123/ijsnem.2013-0054. https://pubmed.ncbi.nlm.nih.gov/24092765/
- [Helms 2014b] Helms ER, Aragon AA, Fitschen PJ. Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. J Int Soc Sports Nutr 2014;11:20. doi:10.1186/1550-2783-11-20. https://pubmed.ncbi.nlm.nih.gov/24864135/
- [Hunter 2008] Hunter GR, Byrne NM, Sirikul B, et al. Resistance training conserves fat-free mass and resting energy expenditure following weight loss. Obesity 2008;16(5):1045-51. doi:10.1038/oby.2008.38. https://pubmed.ncbi.nlm.nih.gov/18356845/
- [Iraki 2019] Iraki J, Fitschen P, Espinar S, Helms E. Nutrition recommendations for bodybuilders in the off-season: a narrative review. Sports 2019;7(7):154. doi:10.3390/sports7070154. https://pubmed.ncbi.nlm.nih.gov/31247944/
- [Jäger 2017] Jäger R, Kerksick CM, Campbell BI, et al. International Society of Sports Nutrition Position Stand: protein and exercise. J Int Soc Sports Nutr 2017;14:20. doi:10.1186/s12970-017-0177-8. https://pubmed.ncbi.nlm.nih.gov/28642676/
- [Jensen 2014] Jensen MD, Ryan DH, Apovian CM, et al. 2013 AHA/ACC/TOS guideline for the management of overweight and obesity in adults. Circulation 2014;129(25 Suppl 2):S102-38. doi:10.1161/01.cir.0000437739.71477.ee. https://pubmed.ncbi.nlm.nih.gov/24222017/ (full text PMC5819889)
- [Jesus 2020] Jesus F, Nunes CL, Matias CN, et al. Are predictive equations a valid method of assessing the resting metabolic rate of overweight or obese former athletes? Eur J Sport Sci 2020;20(9):1225-1234. doi:10.1080/17461391.2019.1708974. https://pubmed.ncbi.nlm.nih.gov/31868121/
- [Johannsen 2012] Johannsen DL, Knuth ND, Huizenga R, Rood JC, Ravussin E, Hall KD. Metabolic slowing with massive weight loss despite preservation of fat-free mass. J Clin Endocrinol Metab 2012;97(7):2489-96. doi:10.1210/jc.2012-1444. https://pubmed.ncbi.nlm.nih.gov/22535969/
- [Kreitzman 1992] Kreitzman SN, Coxon AY, Szaz KF. Glycogen storage: illusions of easy weight loss, excessive weight regain, and distortions in estimates of body composition. Am J Clin Nutr 1992;56(1 Suppl):292S-293S. doi:10.1093/ajcn/56.1.292S. https://pubmed.ncbi.nlm.nih.gov/1615908/
- [Leibel 1995] Leibel RL, Rosenbaum M, Hirsch J. Changes in energy expenditure resulting from altered body weight. N Engl J Med 1995;332(10):621-8. doi:10.1056/NEJM199503093321001. https://pubmed.ncbi.nlm.nih.gov/7632212/
- [Levine 1999] Levine JA, Eberhardt NL, Jensen MD. Role of nonexercise activity thermogenesis in resistance to fat gain in humans. Science 1999;283(5399):212-4. doi:10.1126/science.283.5399.212. https://pubmed.ncbi.nlm.nih.gov/9880251/
- [Lichtman 1992] Lichtman SW, Pisarska K, Berman ER, et al. Discrepancy between self-reported and actual caloric intake and exercise in obese subjects. N Engl J Med 1992;327(27):1893-8. doi:10.1056/NEJM199212313272701. https://pubmed.ncbi.nlm.nih.gov/1454084/
- [Longland 2016] Longland TM, Oikawa SY, Mitchell CJ, Devries MC, Phillips SM. Higher compared with lower dietary protein during an energy deficit combined with intense exercise promotes greater lean mass gain and fat mass loss: a randomized trial. Am J Clin Nutr 2016;103(3):738-46. doi:10.3945/ajcn.115.119339. https://pubmed.ncbi.nlm.nih.gov/26817506/
- [Luy 2018] Luy SC, Dampil OA. Comparison of the Harris-Benedict equation, bioelectrical impedance analysis, and indirect calorimetry for measurement of basal metabolic rate among adult obese Filipino patients with prediabetes or type 2 diabetes mellitus. J ASEAN Fed Endocr Soc 2018;33(2):152-159. doi:10.15605/jafes.033.02.07. https://pubmed.ncbi.nlm.nih.gov/33442121/
- [Martins 2020a] Martins C, Gower BA, Hill JO, Hunter GR. Metabolic adaptation is not a major barrier to weight-loss maintenance. Am J Clin Nutr 2020;112(3):558-565. doi:10.1093/ajcn/nqaa086. https://pubmed.ncbi.nlm.nih.gov/32386226/
- [Martins 2020b] Martins C, Roekenes J, Salamati S, Gower BA, Hunter GR. Metabolic adaptation is an illusion, only present when participants are in negative energy balance. Am J Clin Nutr 2020;112(5):1212-1218. doi:10.1093/ajcn/nqaa220. https://pubmed.ncbi.nlm.nih.gov/32844188/
- [Mifflin 1990] Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr 1990;51(2):241-7. doi:10.1093/ajcn/51.2.241. https://pubmed.ncbi.nlm.nih.gov/2305711/
- [Morton 2018] Morton RW, Murphy KT, McKellar SR, et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults. Br J Sports Med 2018;52(6):376-384. doi:10.1136/bjsports-2017-097608. https://pubmed.ncbi.nlm.nih.gov/28698222/ (full text PMC5867436)
- [Müller & Bosy-Westphal 2013] Müller MJ, Bosy-Westphal A. Adaptive thermogenesis with weight loss in humans. Obesity 2013;21(2):218-28. doi:10.1002/oby.20027. https://pubmed.ncbi.nlm.nih.gov/23404923/
- [Müller 2015] Müller MJ, Enderle J, Pourhassan M, et al. Metabolic adaptation to caloric restriction and subsequent refeeding: the Minnesota Starvation Experiment revisited. Am J Clin Nutr 2015;102(4):807-19. doi:10.3945/ajcn.115.109173. https://pubmed.ncbi.nlm.nih.gov/26399868/
- [Orsama 2014] Orsama AL, Mattila E, Ermes M, van Gils M, Wansink B, Korhonen I. Weight rhythms: weight increases during weekends and decreases during weekdays. Obes Facts 2014;7(1):36-47. doi:10.1159/000356147. https://pubmed.ncbi.nlm.nih.gov/24504358/
- [Ostendorf 2019] Ostendorf DM, Caldwell AE, Creasy SA, et al. Physical activity energy expenditure and total daily energy expenditure in successful weight loss maintainers. Obesity 2019;27(3):496-504. doi:10.1002/oby.22373. https://pubmed.ncbi.nlm.nih.gov/30801984/
- [Paluch 2022] Paluch AE, Bajpai S, Bassett DR, et al. Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts. Lancet Public Health 2022;7(3):e219-e228. doi:10.1016/S2468-2667(21)00302-9. https://pubmed.ncbi.nlm.nih.gov/35247352/
- [Peos 2021] Peos JJ, Helms ER, Fournier PA, et al. Continuous versus intermittent dieting for fat loss and fat-free mass retention in resistance-trained adults: the ICECAP trial. Med Sci Sports Exerc 2021;53(8):1685-1698. doi:10.1249/MSS.0000000000002636. https://pubmed.ncbi.nlm.nih.gov/33587549/
- [Polidori 2016] Polidori D, Sanghvi A, Seeley RJ, Hall KD. How strongly does appetite counter weight loss? Quantification of the feedback control of human energy intake. Obesity 2016;24(11):2289-2295. doi:10.1002/oby.21653. https://pubmed.ncbi.nlm.nih.gov/27804272/
- [Pontzer 2021] Pontzer H, Yamada Y, Sagayama H, et al. Daily energy expenditure through the human life course. Science 2021;373(6556):808-812. doi:10.1126/science.abe5017. https://pubmed.ncbi.nlm.nih.gov/34385400/
- [Purcell 2014] Purcell K, Sumithran P, Prendergast LA, Bouniu CJ, Delbridge E, Proietto J. The effect of rate of weight loss on long-term weight management: a randomised controlled trial. Lancet Diabetes Endocrinol 2014;2(12):954-62. doi:10.1016/S2213-8587(14)70200-1. https://pubmed.ncbi.nlm.nih.gov/25459211/
- [Rand 2003] Rand WM, Pellett PL, Young VR. Meta-analysis of nitrogen balance studies for estimating protein requirements in healthy adults. Am J Clin Nutr 2003;77(1):109-27. doi:10.1093/ajcn/77.1.109. https://pubmed.ncbi.nlm.nih.gov/12499330/
- [Redman 2009] Redman LM, Heilbronn LK, Martin CK, et al. Metabolic and behavioral compensations in response to caloric restriction: implications for the maintenance of weight loss. PLoS One 2009;4(2):e4377. doi:10.1371/journal.pone.0004377. https://pubmed.ncbi.nlm.nih.gov/19198647/
- [Rosenbaum 2008] Rosenbaum M, Hirsch J, Gallagher DA, Leibel RL. Long-term persistence of adaptive thermogenesis in subjects who have maintained a reduced body weight. Am J Clin Nutr 2008;88(4):906-12. doi:10.1093/ajcn/88.4.906. https://pubmed.ncbi.nlm.nih.gov/18842775/
- [Rosenbaum & Leibel 2010] Rosenbaum M, Leibel RL. Adaptive thermogenesis in humans. Int J Obes 2010;34 Suppl 1:S47-55. doi:10.1038/ijo.2010.184. https://pubmed.ncbi.nlm.nih.gov/20935667/ (full text PMC3673773)
- [Sanghvi 2015] Sanghvi A, Redman LM, Martin CK, Ravussin E, Hall KD. Validation of an inexpensive and accurate mathematical method to measure long-term changes in free-living energy intake. Am J Clin Nutr 2015;102(2):353-8. doi:10.3945/ajcn.115.111070. https://pubmed.ncbi.nlm.nih.gov/26040640/
- [Sardeli 2018] Sardeli AV, Komatsu TR, Mori MA, Gáspari AF, Chacon-Mikahil MPT. Resistance training prevents muscle loss induced by caloric restriction in obese elderly individuals: a systematic review and meta-analysis. Nutrients 2018;10(4):423. doi:10.3390/nu10040423. https://pubmed.ncbi.nlm.nih.gov/29596307/
- [Sumithran 2011] Sumithran P, Prendergast LA, Delbridge E, et al. Long-term persistence of hormonal adaptations to weight loss. N Engl J Med 2011;365(17):1597-604. doi:10.1056/NEJMoa1105816. https://pubmed.ncbi.nlm.nih.gov/22029981/
- [ten Haaf 2014] ten Haaf T, Weijs PJ. Resting energy expenditure prediction in recreational athletes of 18-35 years: confirmation of Cunningham equation and an improved weight-based alternative. PLoS One 2014;9(9):e108460. doi:10.1371/journal.pone.0108460. https://pubmed.ncbi.nlm.nih.gov/25275434/
- [Thomas 2013] Thomas DM, Martin CK, Lettieri S, et al. Can a weight loss of one pound a week be achieved with a 3500-kcal deficit? Commentary on a commonly accepted rule. Int J Obes 2013;37(12):1611-3. doi:10.1038/ijo.2013.51. https://pubmed.ncbi.nlm.nih.gov/23628852/
- [Thomas 2014] Thomas DM, Martin CK, Redman LM, et al. Effect of dietary adherence on the body weight plateau: a mathematical model incorporating intermittent compliance with energy intake prescription. Am J Clin Nutr 2014;100(3):787-95. doi:10.3945/ajcn.113.079822. https://pubmed.ncbi.nlm.nih.gov/25080458/
- [Turicchi 2020] Turicchi J, O'Driscoll R, Horgan G, et al. Weekly, seasonal and holiday body weight fluctuation patterns among individuals engaged in a European multi-centre behavioural weight loss maintenance intervention. PLoS One 2020;15(4):e0232152. doi:10.1371/journal.pone.0232152. https://pubmed.ncbi.nlm.nih.gov/32353079/
- [Villareal 2017] Villareal DT, Aguirre L, Gurney AB, et al. Aerobic or resistance exercise, or both, in dieting obese older adults. N Engl J Med 2017;376(20):1943-1955. doi:10.1056/NEJMoa1616338. https://pubmed.ncbi.nlm.nih.gov/28514618/
- [WHO 2004] WHO Expert Consultation. Appropriate body-mass index for Asian populations and its implications for policy and intervention strategies. Lancet 2004;363(9403):157-63. doi:10.1016/S0140-6736(03)15268-3. https://pubmed.ncbi.nlm.nih.gov/14726171/
- [WHO NLiS] World Health Organization, Nutrition Landscape Information System. Malnutrition in women (adult BMI cut-offs: under 18.5 underweight, 25 and over overweight, 30 and over obesity). https://www.who.int/data/nutrition/nlis/info/malnutrition-in-women
- [Wycherley 2012] Wycherley TP, Moran LJ, Clifton PM, Noakes M, Brinkworth GD. Effects of energy-restricted high-protein, low-fat compared with standard-protein, low-fat diets: a meta-analysis of randomized controlled trials. Am J Clin Nutr 2012;96(6):1281-98. doi:10.3945/ajcn.112.044321. https://pubmed.ncbi.nlm.nih.gov/23097268/
