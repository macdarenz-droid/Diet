import './scan.css';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { keys } from '@/core/store';
import { Sheet } from '@/ui/Sheet';
import { Button, useSpotlight } from '@/ui/primitives';
import { Camera, Chevron, Image, Pen } from '@/ui/icons';
import { tap } from '@/ui/haptics';
import { go } from '@/app/router';
import { toast } from '@/app/toast';
import { KEY_PAGES } from '@/ai/config';
import { Arrow } from '@/ui/icons';
import { prepare, type Prepared } from './image';
import { start } from './session';

function Option({ icon, title, meta, onClick, i }: { icon: JSX.Element; title: string; meta: string; onClick: () => void; i: number }) {
  const ref = useSpotlight<HTMLButtonElement>();
  return (
    <button ref={ref} class="option card spot hoverable pressable rise" style={{ '--i': i } as JSX.CSSProperties} onClick={() => { tap(); onClick(); }}>
      <span class="option-icon">{icon}</span>
      <span class="grow"><span class="option-title">{title}</span><span class="option-meta">{meta}</span></span>
      <Chevron class="chev" />
    </button>
  );
}

export function ScanSheet({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'pick' | 'photo' | 'text' | 'key'>('pick');
  const [from, setFrom] = useState<'photo' | 'text'>('photo');
  const [key, setKey] = useState('');
  const [photo, setPhoto] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  // Fetch the Claude client while the person picks a photo, so the scan starts without a wait.
  useEffect(() => { void import('@/ai/analyze').catch(() => {}); }, []);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setBusy(true);
    try {
      setPhoto(await prepare(file));
      setMode('photo');
    } catch {
      toast('That photo could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const begin = (close: () => void, kind: 'photo' | 'text') => {
    if (!keys.value.claude) { setFrom(kind); setMode('key'); return; }
    if (kind === 'photo' && photo) start({ photo, note });
    else if (kind === 'text' && text.trim()) start({ text: text.trim() });
    else return;
    close();
    go('analysing');
  };

  const title = mode === 'photo' ? 'Photo' : mode === 'text' ? 'Describe' : mode === 'key' ? 'Claude key' : 'New scan';

  return (
    <Sheet title={title} onClose={onClose}>
      {close => (
        <div class="scan-sheet">
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          <input ref={library} type="file" accept="image/*" hidden onChange={onFile} />

          {mode === 'pick' && (
            <div class="stack">
              <Option i={0} icon={<Camera />} title="Take photo" meta="Plate, packet or label" onClick={() => camera.current?.click()} />
              <Option i={1} icon={<Image />} title="Choose photo" meta="From your library" onClick={() => library.current?.click()} />
              <Option i={2} icon={<Pen />} title="Describe" meta="Type what you're eating" onClick={() => setMode('text')} />
              {busy && <div class="skeleton" style={{ height: '4px', marginTop: '6px' }} />}
            </div>
          )}

          {mode === 'photo' && photo && (
            <div class="stack">
              <img class="preview rise" src={photo.url} alt="" />
              <input class="input rise" style={{ '--i': 1 } as JSX.CSSProperties} placeholder="Note, e.g. half portion, no sauce" value={note} onInput={e => setNote((e.target as HTMLInputElement).value)} aria-label="Note" />
              <div class="row rise" style={{ '--i': 2 } as JSX.CSSProperties}>
                <Button variant="ghost" onClick={() => { setPhoto(null); setMode('pick'); }}>Retake</Button>
                <Button variant="primary" size="lg" class="grow" onClick={() => begin(close, 'photo')}>Analyse</Button>
              </div>
            </div>
          )}

          {mode === 'text' && (
            <div class="stack">
              <textarea class="textarea rise" placeholder="Two slices of pepperoni pizza and a can of Coke" value={text} onInput={e => setText((e.target as HTMLTextAreaElement).value)} aria-label="Meal description" autoFocus />
              <div class="row rise" style={{ '--i': 1 } as JSX.CSSProperties}>
                <Button variant="ghost" onClick={() => setMode('pick')}>Back</Button>
                <Button variant="primary" size="lg" class="grow" disabled={!text.trim()} onClick={() => begin(close, 'text')}>Analyse</Button>
              </div>
            </div>
          )}

          {mode === 'key' && (
            <form class="stack key-form" onSubmit={e => { e.preventDefault(); if (!key.trim()) return; keys.value = { ...keys.value, claude: key.trim() }; begin(close, from); }}>
              <input class="input mono-input rise" type="password" autoComplete="off" autoCapitalize="off" spellcheck={false} placeholder="sk-ant-…" value={key} onInput={e => setKey((e.target as HTMLInputElement).value)} aria-label="Claude key" />
              <a class="key-link rise" style={{ '--i': 1 } as JSX.CSSProperties} href={KEY_PAGES.claude} target="_blank" rel="noopener noreferrer">Get a Claude key<Arrow /></a>
              <div class="row rise" style={{ '--i': 2 } as JSX.CSSProperties}>
                <Button variant="ghost" onClick={() => setMode(from)}>Back</Button>
                <Button variant="primary" size="lg" type="submit" class="grow" disabled={!key.trim()}>Save and analyse</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Sheet>
  );
}
