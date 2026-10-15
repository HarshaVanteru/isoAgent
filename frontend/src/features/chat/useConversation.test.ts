import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Thread } from '../../api/types';
import { THREAD_STORAGE_KEY, emptyThread, useConversation } from './useConversation';

vi.mock('../../api/endpoints', () => ({
  api: { createThread: vi.fn(), getThread: vi.fn(), ask: vi.fn(), clarify: vi.fn() },
}));
const mocked = vi.mocked(api);

const answered = (overrides: Partial<Thread> = {}): Thread => ({
  ...emptyThread(),
  thread_id: 't1',
  messages: [
    { role: 'user', content: 'Q' },
    { role: 'assistant', content: 'A [1]' },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});

describe('useConversation', () => {
  it('creates a thread on first send, asks with the category, and clears the draft', async () => {
    mocked.createThread.mockResolvedValue({ thread_id: 't1' });
    mocked.ask.mockResolvedValue(answered());
    const { result } = renderHook(() => useConversation());
    act(() => {
      result.current.setCategory('Purchasing');
      result.current.setDraft('  Q  ');
    });
    await act(() => result.current.send());
    expect(mocked.ask).toHaveBeenCalledWith('t1', 'Q', 'Purchasing');
    expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBe('t1');
    expect(result.current.thread.messages).toHaveLength(2);
    expect(result.current.draft).toBe('');
    expect(result.current.busy).toBe(false);
  });

  it('sends the reply to /clarify while a clarification is pending', async () => {
    localStorage.setItem(THREAD_STORAGE_KEY, 't1');
    mocked.getThread.mockResolvedValue(answered({ pending_clarification: true, category: 'Purchasing' }));
    mocked.clarify.mockResolvedValue(answered());
    const { result } = renderHook(() => useConversation());
    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(result.current.category).toBe('Purchasing');
    await act(() => result.current.send('Supplier control'));
    expect(mocked.clarify).toHaveBeenCalledWith('t1', 'Supplier control');
    expect(mocked.ask).not.toHaveBeenCalled();
  });

  it('forgets a stored thread the backend no longer knows', async () => {
    localStorage.setItem(THREAD_STORAGE_KEY, 'gone');
    mocked.getThread.mockRejectedValue(new ApiError('Conversation not found', 404));
    const { result } = renderHook(() => useConversation());
    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('keeps the stored thread and reports the error when the backend is unreachable', async () => {
    localStorage.setItem(THREAD_STORAGE_KEY, 't1');
    mocked.getThread.mockRejectedValue(new ApiError('Cannot reach the backend.', 0));
    const { result } = renderHook(() => useConversation());
    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBe('t1');
    expect(result.current.thread.thread_id).toBe('t1');
    expect(result.current.error).toBe('Cannot reach the backend.');
  });

  it('keeps the draft when sending fails', async () => {
    mocked.createThread.mockResolvedValue({ thread_id: 't1' });
    mocked.ask.mockRejectedValue(new ApiError('Conversation processing failed.', 502));
    const { result } = renderHook(() => useConversation());
    act(() => result.current.setDraft('Q'));
    await act(() => result.current.send());
    expect(result.current.draft).toBe('Q');
    expect(result.current.error).toBe('Conversation processing failed.');
  });

  it('ignores blank messages', async () => {
    const { result } = renderHook(() => useConversation());
    await act(() => result.current.send('   '));
    expect(mocked.createThread).not.toHaveBeenCalled();
  });

  it('reset clears thread, category, draft, and the stored id', async () => {
    mocked.createThread.mockResolvedValue({ thread_id: 't1' });
    mocked.ask.mockResolvedValue(answered());
    const { result } = renderHook(() => useConversation());
    act(() => result.current.setCategory('Purchasing'));
    await act(() => result.current.send('Q'));
    act(() => result.current.reset());
    expect(result.current.thread).toEqual(emptyThread());
    expect(result.current.category).toBe('');
    expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBeNull();
  });
});
