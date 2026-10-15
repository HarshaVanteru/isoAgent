const CITATION_HREF_PREFIX = '#source-';
// [n] not followed by "(" (already a link) or ":" (a reference definition).
const CITATION_PATTERN = /\[(\d{1,3})\](?![(:])/g;
// Odd entries after splitting are inline code spans or fenced blocks.
const CODE_PATTERN = /(```[\s\S]*?```|`[^`\n]*`)/;

export const sourceElementId = (citation: number) => `source-${citation}`;

/** Rewrite [n] citations that have a retrieved source into in-page links. */
export function linkCitations(markdown: string, available: ReadonlySet<number>): string {
  return markdown
    .split(CODE_PATTERN)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(CITATION_PATTERN, (match, digits: string) =>
            available.has(Number(digits)) ? `[\\[${digits}\\]](${CITATION_HREF_PREFIX}${digits})` : match,
          ),
    )
    .join('');
}

export function citationFromHref(href: string | undefined): number | null {
  if (!href?.startsWith(CITATION_HREF_PREFIX)) return null;
  const citation = Number(href.slice(CITATION_HREF_PREFIX.length));
  return Number.isInteger(citation) && citation > 0 ? citation : null;
}
