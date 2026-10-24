// Downscales a picked photo before it leaves the device: a JPEG for analysis and a thumbnail for the log.
import { IMAGE_EDGE, THUMB_EDGE } from '@/ai/config';

export interface Prepared {
  /** base64 JPEG, no data: prefix */
  data: string;
  /** data URL of the analysis image, for display */
  url: string;
  thumb: string;
  width: number;
  height: number;
}

export function fit(w: number, h: number, edge: number): { w: number; h: number } {
  const s = Math.min(1, edge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function render(src: ImageBitmap | HTMLImageElement, edge: number, quality: number): { url: string; w: number; h: number } {
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height;
  const { w, h } = fit(sw, sh, edge);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return { url: c.toDataURL('image/jpeg', quality), w, h };
}

export async function prepare(file: Blob): Promise<Prepared> {
  const src = await decode(file);
  const big = render(src, IMAGE_EDGE, 0.85);
  const small = render(src, THUMB_EDGE, 0.72);
  if ('close' in src) src.close();
  return { data: big.url.slice(big.url.indexOf(',') + 1), url: big.url, thumb: small.url, width: big.w, height: big.h };
}
