import type { Meal } from '@/core/models';
import { profile } from '@/core/store';
import { fmtDay, fmtTime } from '@/core/dates';
import { fmtEnergy } from '@/core/units';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/primitives';
import { Trash } from '@/ui/icons';
import { toast } from '@/app/toast';
import { Breakdown, ItemList } from '@/slices/result/Breakdown';
import { logMeal, removeMeal } from './meals';

export function MealSheet({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const unit = profile.value.unit;
  const del = async (close: () => void) => {
    close();
    const removed = await removeMeal(meal.id);
    if (removed) toast('Meal deleted', { action: { label: 'Undo', run: () => { void logMeal(removed); } } });
  };
  return (
    <Sheet label={meal.dish} onClose={onClose}>
      {close => <>
      {meal.thumb && <img class="meal-hero" src={meal.thumb} alt="" />}
      <div class="meal-head">
        <div class="t">{meal.dish}</div>
        <div class="m muted">{fmtDay(meal.at)} · {fmtTime(meal.at)}{meal.swappedFrom ? ` · Swap for ${meal.swappedFrom}` : ''}</div>
      </div>
      <Breakdown n={meal.totals} unit={unit} />
      <div class="section">
        <div class="section-head"><h2>Items</h2><span class="mono">{fmtEnergy(meal.totals.kcal, unit)}</span></div>
        <ItemList items={meal.items} unit={unit} />
      </div>
      <div class="section">
        <Button variant="danger" block onClick={() => void del(close)}><Trash />Delete meal</Button>
      </div>
      </>}
    </Sheet>
  );
}
