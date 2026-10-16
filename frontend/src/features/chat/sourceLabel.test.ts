import { describe, expect, it } from 'vitest';
import type { MetadataValue, Source } from '../../api/types';
import { formatMetadataValue, sourceLocation, sourceTitle } from './sourceLabel';

const source = (metadata: Record<string, MetadataValue>): Source => ({ text: '', score: 1, citation: 1, metadata });

describe('sourceTitle', () => {
  it('prefers document name, then filename, then source', () => {
    expect(sourceTitle(source({ document_name: 'OP-01.docx', source: 'x' }))).toBe('OP-01.docx');
    expect(sourceTitle(source({ document_name: null, source: 'Purchasing/x.pdf' }))).toBe('Purchasing/x.pdf');
    expect(sourceTitle(source({}))).toBe('Document');
  });
});

describe('sourceLocation', () => {
  it('describes page, slide, sheet, or category plus the chunk', () => {
    expect(sourceLocation(source({ page: 3, page_number: 9, chunk_index: 0 }))).toBe('Page 3 · Chunk 0');
    expect(sourceLocation(source({ page: null, page_number: 2 }))).toBe('Page 2');
    expect(sourceLocation(source({ slide: 4, chunk_index: 2 }))).toBe('Slide 4 · Chunk 2');
    expect(sourceLocation(source({ sheet: 'Risks' }))).toBe('Sheet: Risks');
    expect(sourceLocation(source({ category: 'Purchasing' }))).toBe('Purchasing');
    expect(sourceLocation(source({}))).toBe('');
  });
});

describe('formatMetadataValue', () => {
  it('formats lists and empty values', () => {
    expect(formatMetadataValue([1, 2])).toBe('1, 2');
    expect(formatMetadataValue([])).toBe('—');
    expect(formatMetadataValue(null)).toBe('—');
    expect(formatMetadataValue(false)).toBe('false');
  });
});
