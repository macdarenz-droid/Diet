import type { NutrientKey, Nutrients } from '@/core/models';

/** A food from the offline tables that may stand in for an item's per-100 g values. `missing` lists
 * nutrients its source does not report (they read 0 in per100; grounding fills them from the estimate).
 * `score` is the search rank's relevance, when the candidate came from a search. */
export interface Candidate {
  fdcId: number;
  description: string;
  dataType: string;
  per100: Nutrients;
  rank: number;
  missing?: NutrientKey[];
  score?: number;
}
