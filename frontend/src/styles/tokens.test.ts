/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest stubs CSS imports (even ?raw), so read the stylesheet from disk.
const tokens = readFileSync(`${process.cwd()}/src/styles/tokens.css`, 'utf8');

/** Custom properties declared in the light :root block and in the dark override. */
function themes(): Record<'light' | 'dark', Record<string, string>> {
  const darkStart = tokens.indexOf('@media (prefers-color-scheme: dark)');
  const read = (css: string) =>
    Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, value]) => [name, value]));
  const light = read(tokens.slice(0, darkStart));
  return { light, dark: { ...light, ...read(tokens.slice(darkStart)) } };
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('design tokens', () => {
  it.each(['light', 'dark'] as const)('keep body and secondary text at WCAG AA in the %s theme', (theme) => {
    const colors = themes()[theme];
    for (const text of ['text', 'text-muted', 'text-subtle', 'accent-text']) {
      for (const background of ['bg', 'sidebar', 'surface', 'surface-muted']) {
        const ratio = contrast(colors[`color-${text}`], colors[`color-${background}`]);
        expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
