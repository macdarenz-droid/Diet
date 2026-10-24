// Public API of the metabolism engine. The science and every constant are in docs/METABOLISM.md.
export * from './types';
export { ageYears, bmi, compositionAt, cunningham, deurenbergFatPct, energyDensity, mifflinStJeor, palFor, referenceComposition, restingExpenditure, restingMethod, totalExpenditure } from './energy';
export { currentTrendKg, dayKeyOf, dayNumber, trendFit, trendWeights, weighInDays } from './trend';
export { estimateExpenditure, observedExpenditure, recentWindow } from './adaptive';
export { dailyTargets, proteinTarget, screen, surplusAllowed } from './targets';
export { detectAdaptation, detectPlateau, losingStreak, recentRate } from './detect';
export { assess, KIND_ORDER, rankInsights } from './insights';
