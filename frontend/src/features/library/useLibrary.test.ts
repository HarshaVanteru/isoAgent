import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, UNREACHABLE_MESSAGE } from '../../api/client';
import { api } from '../../api/endpoints';
import type { LibraryReport } from '../../api/types';
import { POLL_INTERVAL_MS, useLibrary } from './useLibrary';

vi.mock('../../api/endpoints', () => ({ api: { library: vi.fn() } }));
const mocked = vi.mocked(api);

const report: LibraryReport = {
  inventory: [{ source: 'Purchasing/a.docx', file_type: '.docx' }, { source: 'b.pdf', file_type: '.pdf' }],
  files: [{ source: 'Purchasing/a.docx', file_type: '.docx', status: 'indexed', chunks: 3 }],
  chunks: 3,
  indexed_at: '2026-10-15T10:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('useLibrary', () => {
  it('loads the report and derives files, categories, and counts', async () => {
    mocked.library.mockResolvedValue(report);
    const { result } = renderHook(() => useLibrary({ paused: false }));
    expect(result.current.status).toBe('loading');
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.status).toBe('ready');
    expect(result.current.files).toHaveLength(2);
    expect(result.current.categories).toEqual(['General', 'Purchasing']);
    expect(result.current.indexedCount).toBe(1);
    expect(result.current.chunkCount).toBe(3);
    expect(result.current.online).toBe(true);
  });

  it('keeps the last snapshot when polling fails and reports the failure once', async () => {
    mocked.library.mockResolvedValueOnce(report).mockRejectedValue(new ApiError(UNREACHABLE_MESSAGE, 0));
    const { result } = renderHook(() => useLibrary({ paused: false }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(result.current.error).toBe(UNREACHABLE_MESSAGE);
    expect(result.current.online).toBe(false);
    act(() => result.current.dismissError());
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));
    expect(result.current.error).toBeNull();
    expect(result.current.files).toHaveLength(2);
    expect(result.current.status).toBe('ready');
  });

  it('reports unavailable when the first load fails', async () => {
    mocked.library.mockRejectedValue(new ApiError(UNREACHABLE_MESSAGE, 0));
    const { result } = renderHook(() => useLibrary({ paused: false }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.status).toBe('unavailable');
  });

  it('does not poll while paused', async () => {
    mocked.library.mockResolvedValue(report);
    renderHook(() => useLibrary({ paused: true }));
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2));
    expect(mocked.library).toHaveBeenCalledTimes(1);
  });
});
