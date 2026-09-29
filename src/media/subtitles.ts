import type { SubtitleCue } from '../renders/render.types';

// SRT — найпростіший формат субтитрів:
//   1
//   00:00:00,500 --> 00:00:03,500
//   Текст
export function toSrt(cues: SubtitleCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text}\n`)
    .join('\n');
}

function timestamp(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const s = Math.floor(totalMs / 1000) % 60;
  const m = Math.floor(totalMs / 60_000) % 60;
  const h = Math.floor(totalMs / 3_600_000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}
