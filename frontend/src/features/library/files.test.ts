import { describe, expect, it } from 'vitest';
import type { LibraryFile, LibraryReport } from '../../api/types';
import {
  categoryOf,
  countByStatus,
  fileName,
  fileStatus,
  filterFiles,
  groupByCategory,
  listCategories,
  mergeFiles,
} from './files';

const indexed: LibraryFile = { source: 'Purchasing/OP-01.docx', file_type: '.docx', status: 'indexed', chunks: 4 };
const failed: LibraryFile = { source: 'Purchasing/Flow.vsd', file_type: '.vsd', status: 'error', error: 'No LibreOffice' };
const pending: LibraryFile = { source: 'Manual.pdf', file_type: '.pdf' };

describe('mergeFiles', () => {
  it('overlays ingestion results on the inventory and sorts by source', () => {
    const report: LibraryReport = {
      inventory: [{ source: 'Purchasing/OP-01.docx', file_type: '.docx', size_bytes: 10 }, pending],
      files: [indexed],
      chunks: 4,
      indexed_at: null,
    };
    expect(mergeFiles(report)).toEqual([pending, { ...indexed, size_bytes: 10 }]);
  });

  it('returns an empty list before the report loads', () => {
    expect(mergeFiles(null)).toEqual([]);
  });
});

describe('file helpers', () => {
  it('derives category, name, and status', () => {
    expect(categoryOf('Purchasing/OP-01.docx')).toBe('Purchasing');
    expect(categoryOf('Manual.pdf')).toBe('General');
    expect(fileName('a/b/c.pdf')).toBe('c.pdf');
    expect([indexed, failed, pending].map(fileStatus)).toEqual(['indexed', 'error', 'pending']);
  });

  it('lists categories alphabetically without duplicates', () => {
    expect(listCategories([indexed, pending, failed])).toEqual(['General', 'Purchasing']);
  });

  it('filters by status and case-insensitive search', () => {
    const files = [indexed, failed, pending];
    expect(filterFiles(files, 'error', '')).toEqual([failed]);
    expect(filterFiles(files, 'all', 'MANUAL')).toEqual([pending]);
    expect(filterFiles(files, 'indexed', 'manual')).toEqual([]);
  });

  it('groups by category in alphabetical order', () => {
    expect(groupByCategory([indexed, pending, failed])).toEqual([
      { category: 'General', files: [pending] },
      { category: 'Purchasing', files: [indexed, failed] },
    ]);
  });

  it('counts files per status', () => {
    expect(countByStatus([indexed, failed, pending, pending])).toEqual({ indexed: 1, error: 1, pending: 2 });
  });
});
