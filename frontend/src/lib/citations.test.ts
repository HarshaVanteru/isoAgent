import { describe, expect, it } from 'vitest';
import { citationFromHref, linkCitations, sourceElementId } from './citations';

describe('linkCitations', () => {
  const available = new Set([1, 2, 3]);

  it('links adjacent citations in the backend-normalised form', () => {
    expect(linkCitations('Yes [1][2].', available)).toBe('Yes [\\[1\\]](#source-1)[\\[2\\]](#source-2).');
  });

  it('leaves numbers without a retrieved source untouched', () => {
    expect(linkCitations('See [9].', available)).toBe('See [9].');
  });

  it('never rewrites inline or fenced code', () => {
    const text = 'Use `arr[1]` and\n```\nx[2]\n```\n[3]';
    expect(linkCitations(text, available)).toBe('Use `arr[1]` and\n```\nx[2]\n```\n[\\[3\\]](#source-3)');
  });

  it('leaves existing links and reference definitions untouched', () => {
    expect(linkCitations('[1](https://a.b) [2]: https://c.d', available)).toBe('[1](https://a.b) [2]: https://c.d');
  });
});

describe('citationFromHref', () => {
  it('parses citation anchors only', () => {
    expect(citationFromHref('#source-4')).toBe(4);
    expect(citationFromHref('#source-0')).toBeNull();
    expect(citationFromHref('#source-x')).toBeNull();
    expect(citationFromHref('https://example.com')).toBeNull();
    expect(citationFromHref(undefined)).toBeNull();
  });

  it('matches the source element id', () => {
    expect(`#${sourceElementId(4)}`).toBe('#source-4');
  });
});
