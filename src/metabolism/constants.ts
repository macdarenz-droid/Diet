// Every number the engine uses, with its source. Full citations and the reasoning behind each
// choice are in docs/METABOLISM.md; the bracketed tags below match its sources list.
import type { ActivityLevel, Sex } from './types';

export const DAY_MS = 86_400_000;
export const KCAL_PER_MJ = 1000 / 4.184;

// Energy content of tissue change [Hall 2008]: 39.5 MJ per kg of fat, 7.6 MJ per kg of lean.
export const FAT_KCAL_PER_KG = 39.5 * KCAL_PER_MJ;
export const LEAN_KCAL_PER_KG = 7.6 * KCAL_PER_MJ;
/** Forbes' constant (kg): lean mass changes 10.4/F kg per kg of fat when fat mass is F [Hall 2008; Forbes 2000]. */
export const FORBES_KG = 10.4;
/** The 3500 kcal per pound rule, kept for comparison only; the engine never uses it [Hall 2008; Thomas 2013]. */
export const RULE_OF_THUMB_KCAL_PER_KG = 3500 / 0.45359237;

// Mifflin-St Jeor [Mifflin 1990]; derived in people aged 19 to 78.
export const MIFFLIN = { weight: 10, height: 6.25, age: 5, male: 5, female: -161 } as const;
export const MIFFLIN_AGE_RANGE = [19, 78] as const;
// Cunningham [Cunningham 1980]: 500 + 22 x lean mass.
export const CUNNINGHAM = { intercept: 500, perKgLean: 22 } as const;

/** Mifflin missed measured resting expenditure by more than 10% in 22% of 130 adults [Frankenfield 2003].
 * With a normal error, 10% / z(0.89) = 0.1 / 1.2265 = 8.2% is one standard deviation. */
export const RESTING_SD_REL = 0.082;

/** Physical activity level = total / basal expenditure [FAO 2004, Table 5.3]. `pal` is the value used; low and
 * high bound the band. Sedentary is FAO's lower limit (1.40); the rest are band midpoints. */
export const PAL: Record<ActivityLevel, { pal: number; low: number; high: number }> = {
  sedentary: { pal: 1.4, low: 1.4, high: 1.55 },
  light: { pal: 1.55, low: 1.4, high: 1.69 },
  moderate: { pal: 1.85, low: 1.7, high: 1.99 },
  vigorous: { pal: 2.2, low: 2.0, high: 2.4 },
};

// Body fat from BMI when not measured [Deurenberg 1991]: BF% = 1.2 BMI + 0.23 age - 10.8 sex - 5.4 (male = 1).
export const DEURENBERG = { bmi: 1.2, age: 0.23, male: -10.8, intercept: -5.4 } as const;

// Weigh-in noise. Day-to-day swings are about 0.5 kg (SD) [Hall & Chow 2011]; glycogen holds 3 to 4 g of
// water per g [Kreitzman 1992], so the first two weeks of a new diet lose water fast and are skipped.
export const WEIGH_NOISE_SD_KG = 0.5;
export const GLYCOGEN_SKIP_DAYS = 14;
/** Slope errors are doubled for autocorrelated water swings: with 28 days of daily weighing this gives a
 * 95% interval near +-350 kcal/day, the figure Hall & Chow 2011 report for that design. */
export const SLOPE_SE_INFLATION = 2;
/** Trend smoothing half-life, days (a design choice, docs section 7). */
export const TREND_HALF_LIFE_DAYS = 7;

// Back-calculated expenditure [Hall & Chow 2011: 28 days of daily weights for a usable estimate].
export const WINDOW_DAYS = 28;
export const MIN_WEIGH_INS = 4;
export const MIN_SPAN_DAYS = 14;
export const MIN_COVERAGE = 0.5;
/** Intake change between the halves of a window above which glycogen and water shifts make it unusable. */
export const STEADY_KCAL = 300;
/** A window whose measured expenditure is under this multiple of resting expenditure is read as missing
 * meals in the log, not as a real value: FAO's lowest lifestyle band starts at 1.40 [FAO 2004], and 1.2
 * leaves room for error (a Nuance threshold, docs section 6). */
export const MIN_MEASURED_PAL = 1.2;
export const CONFIDENCE_WEIGHT = { medium: 0.4, high: 0.65 } as const;
/** Allowed real change in expenditure per window, as a share (a design choice, docs section 6, rule 6). */
export const DRIFT_PER_WINDOW = 0.05;
/** Measured and formula maintenance differ enough to tell the person (a Nuance threshold, docs section 8). */
export const EXPENDITURE_UPDATE_REL = 0.1;

// Rates, % of body weight per week. Loss: 0.5 to 1 [Helms 2014b; Garthe 2011]. Gain: 0.25 to 0.5 [Iraki 2019].
export const LOSS_RATE = { default: 0.5, max: 1.0 } as const;
export const GAIN_RATE = { default: 0.25, max: 0.5 } as const;

/** Lowest daily energy target: the bottom of the 1200-1500 (women) and 1500-1800 (men) kcal prescriptions
 * [Jensen 2014]. Diets under 800 kcal need medical supervision there. */
export const FLOOR_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

// BMI bands [WHO NLiS]: under 18.5 is underweight, 25 and over overweight.
export const UNDERWEIGHT_BMI = 18.5;
/** Height and weight giving a BMI outside this range are taken as a typing error (a Nuance plausibility
 * bound, not a clinical cut-off). */
export const PLAUSIBLE_BMI = [12, 100] as const;
/** Largest planned deficit, kcal/day. Guideline prescriptions are 500 to 750 [Jensen 2014]; 1,000 keeps the
 * fast pace for most people while 1% a week of a large body would ask for far more (a Nuance threshold). */
export const MAX_DEFICIT_KCAL = 1000;
export const OVERWEIGHT_BMI = 25;
export const ADULT_AGE = 18;

// Protein, g per day.
export const PROTEIN = {
  /** RDA-level intake for healthy adults [Rand 2003]. */
  baseGPerKg: 0.83,
  /** Over 65 [Bauer 2013]: at least 1.0 to 1.2; 1.2 or more when active. */
  olderAge: 65,
  olderGPerKg: 1.0,
  olderActiveGPerKg: 1.2,
  /** In a deficit: 2.3 to 3.1 g per kg of lean mass [Helms 2014a; Helms 2014b]; the low end is used. */
  loseGPerKgLean: 2.3,
  /** Building muscle: gains stop rising past 1.62 g/kg (95% CI 1.03 to 2.20) [Morton 2018]. */
  muscleGPerKg: 1.6,
  /** Logged average below this share of the target counts as low (a Nuance threshold, docs section 8). */
  lowShare: 0.9,
} as const;

// Detection.
/** A stall over 28 days: the trend lost less than 0.15% of body weight a week (docs section 8 for the noise
 * analysis behind both numbers). */
export const PLATEAU = { days: 28, minWeighIns: 6, maxLossPctPerWeek: 0.15, intakeRiseKcal: 150, minCoverage: 0.6 } as const;
export const ADAPTATION = {
  /** Each window, days; the baseline starts after the glycogen skip. */
  windowDays: 42,
  /** Gap at least 5% of expected: a Nuance threshold, half the 10-15% reported for a maintained 10% loss
   * [Rosenbaum & Leibel 2010] and above the smallest reported resting gaps [Martins 2020a]. */
  minGapRel: 0.05,
  /** One-sided 95%. */
  z: 1.645,
  /** Only after some loss (a Nuance threshold). */
  minLossPct: 2,
} as const;
/** MATADOR used 2-week blocks at energy balance [Byrne 2018]. */
export const DIET_BREAK_WEEKS = 2;
/** Body-composition-adjusted expenditure was already down at 3 months of restriction [Redman 2009]. */
export const DIET_BREAK_AFTER_WEEKS = 12;
/** Maintaining a 10% lower weight lowers expenditure beyond the mass lost [Leibel 1995; Rosenbaum 2008]. */
export const MILESTONE_LOSS_PCT = 10;
/** Window for the observed rate, days; a rate counts as too fast only when it beats the cap by one standard error. */
export const RATE_WINDOW_DAYS = 28;
/** Weight drift on a maintenance goal: half the default loss rate, over 28 days (a Nuance threshold). */
export const DRIFT = { days: 28, pctPerWeek: 0.25 } as const;
/** Mortality falls with steps up to 8000-10000 (under 60) and 6000-8000 (60 and over) [Paluch 2022]. */
export const STEPS = { under60: 8000, from60: 6000, olderAge: 60 } as const;
/** The RCTs in the meta-analysis trained three times a week [Sardeli 2018]. */
export const RESISTANCE_SESSIONS_PER_WEEK = 3;
