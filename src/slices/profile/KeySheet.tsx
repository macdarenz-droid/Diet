import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { keys } from '@/core/store';
import { KEY_PAGES } from '@/ai/config';
import { Sheet } from '@/ui/Sheet';
import { Button } from '@/ui/primitives';
import { Arrow } from '@/ui/icons';

export type Which = 'claude' | 'usda';
export const keySheet = signal<Which | null>(null);

const COPY: Record<Which, { title: string; placeholder: string; link: string }> = {
  claude: { title: 'Claude key', placeholder: 'sk-ant-…', link: 'Get a Claude key' },
  usda: { title: 'Food database key', placeholder: 'API key', link: 'Get a key' },
};

export function maskKey(k: string): string {
  return k ? `••••${k.slice(-4)}` : '';
}

export function KeySheet({ which, onClose, onSaved }: { which: Which; onClose: () => void; onSaved?: () => void }) {
  // Write-only: the stored key is never put back into the page; the field shows its last four digits.
  const [value, setValue] = useState('');
  const c = COPY[which];
  const save = (close: () => void) => {
    keys.value = { ...keys.value, [which]: value.trim() };
    close();
    onSaved?.();
  };
  return (
    <Sheet title={c.title} onClose={onClose}>
      {close => (
        <form class="key-form" onSubmit={e => { e.preventDefault(); save(close); }}>
          <input
            class="input mono-input"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            spellcheck={false}
            placeholder={keys.value[which] ? maskKey(keys.value[which]) : c.placeholder}
            value={value}
            onInput={e => setValue((e.target as HTMLInputElement).value)}
            aria-label={c.title}
          />
          <a class="key-link" href={KEY_PAGES[which]} target="_blank" rel="noopener noreferrer">{c.link}<Arrow /></a>
          <div class="row key-actions">
            {keys.value[which] && <Button variant="ghost" onClick={() => { keys.value = { ...keys.value, [which]: '' }; close(); }}>Remove</Button>}
            <Button variant="primary" type="submit" class="grow" disabled={!value.trim()}>Save</Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
