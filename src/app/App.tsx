import { useEffect } from 'preact/hooks';
import { direction, go, route } from './router';
import { Toasts } from './toast';
import { openScan, scanSheet } from './scan';
import { Today } from '@/slices/today/Today';
import { Profile } from '@/slices/profile/Profile';
import { Analysing } from '@/slices/scan/Analysing';
import { Result } from '@/slices/result/Result';
import { ScanSheet } from '@/slices/scan/ScanSheet';
import { scan } from '@/slices/scan/session';
import { Camera, Today as TodayIcon, User } from '@/ui/icons';
import { tap } from '@/ui/haptics';

function TabBar() {
  const r = route.value;
  const hidden = r === 'analysing' || r === 'result';
  return (
    <nav class={`tabbar${hidden ? ' hidden' : ''}`} aria-label="Main">
      <button class="tab" aria-current={r === 'today' ? 'page' : undefined} onClick={() => { tap(); go('today'); }}>
        <TodayIcon /><span>Today</span><span class="pip" />
      </button>
      <button class="scan-btn" aria-label="New scan" onClick={openScan}><Camera /></button>
      <button class="tab" aria-current={r === 'profile' ? 'page' : undefined} onClick={() => { tap(); go('profile'); }}>
        <User /><span>Profile</span><span class="pip" />
      </button>
    </nav>
  );
}

export function App() {
  const r = route.value;
  // Leaving a scan's screens by any route clears it, so a stale result never reappears.
  useEffect(() => { if ((r === 'today' || r === 'profile') && scan.value?.phase !== 'running') scan.value = null; }, [r]);
  const enter = direction.value === 'forward' ? 'enter-forward' : direction.value === 'back' ? 'enter-back' : 'enter-fade';
  return (
    <>
      <main key={r} class={enter}>
        {r === 'today' && <Today />}
        {r === 'profile' && <Profile />}
        {r === 'analysing' && <Analysing />}
        {r === 'result' && <Result />}
      </main>
      <TabBar />
      {scanSheet.value && <ScanSheet onClose={() => { scanSheet.value = false; }} />}
      <Toasts />
    </>
  );
}
