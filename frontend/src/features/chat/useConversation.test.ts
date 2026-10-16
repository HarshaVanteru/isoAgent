import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Thread } from '../../api/types';
import { THREAD_STORAGE_KEY, emptyThread, useConversation } from './useConversation';

vi.mock('../../api/endpoints', () => ({
  api: { deleteThread: vi.fn(), createThread: vi.fn(), getThread: vi.fn(), ask: vi.fn(), clarify: vi.fn() },
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
    expect(mocked.ask).toHaveBeenCalledWith('t1', 'Q', 'Purchasing', expect.any(Function));
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
    expect(mocked.clarify).toHaveBeenCalledWith('t1', 'Supplier control', expect.any(Function));
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


it('keeps previous conversations after reset and reopens them from history', async () => {
  mocked.createThread.mockResolvedValue({ thread_id: 't1' });
  mocked.ask.mockResolvedValue(answered({ question: 'Supplier evaluation?' }));
  const { result } = renderHook(() => useConversation());
  await act(() => result.current.send('Supplier evaluation?'));
  expect(result.current.history).toEqual([{ id: 't1', title: 'Supplier evaluation?' }]);
  act(() => result.current.reset());
  expect(result.current.thread.thread_id).toBe('');
  expect(result.current.history).toHaveLength(1);
  mocked.getThread.mockResolvedValue(answered({ question: 'Supplier evaluation?' }));
  await act(() => result.current.openThread('t1'));
  expect(result.current.thread.thread_id).toBe('t1');
  expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBe('t1');
  expect(JSON.parse(localStorage.getItem('iso-history-v1')!)).toHaveLength(1);
});


it('shows the first question in history before the answer arrives and preserves its title', async () => {
  mocked.createThread.mockResolvedValue({ thread_id: 't1' });
  let finish!: (thread: Thread) => void;
  mocked.ask.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useConversation());
  let sending!: Promise<void>;
  act(() => { sending = result.current.send('First question?'); });
  await waitFor(() => expect(result.current.history).toEqual([{ id: 't1', title: 'First question?' }]));
  expect(result.current.busy).toBe(true);
  await act(async () => {
    finish(answered({ question: 'First question?' }));
    await sending;
  });
  mocked.ask.mockResolvedValue(answered({ question: 'Follow-up?' }));
  await act(() => result.current.send('Follow-up?'));
  expect(result.current.history).toEqual([{ id: 't1', title: 'First question?' }]);
});


it('keeps background responses in their original chat when switching and starting another chat', async () => {
  mocked.createThread.mockResolvedValueOnce({ thread_id: 't1' }).mockResolvedValueOnce({ thread_id: 't2' });
  let finishFirst!: (thread: Thread) => void;
  mocked.ask.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
  const { result } = renderHook(() => useConversation());
  let first!: Promise<void>;
  act(() => { first = result.current.send('First question'); });
  await waitFor(() => expect(result.current.thread.thread_id).toBe('t1'));
  act(() => result.current.reset());
  expect(result.current.busy).toBe(false);
  mocked.ask.mockResolvedValueOnce(answered({ thread_id: 't2', question: 'Second question' }));
  await act(() => result.current.send('Second question'));
  expect(result.current.thread.thread_id).toBe('t2');
  await act(() => result.current.openThread('t1'));
  expect(result.current.busy).toBe(true);
  expect(result.current.pendingMessage).toBe('First question');
  await act(() => result.current.openThread('t2'));
  await act(async () => { finishFirst(answered({ question: 'First question' })); await first; });
  expect(result.current.thread.thread_id).toBe('t2');
  expect(localStorage.getItem(THREAD_STORAGE_KEY)).toBe('t2');
  await act(() => result.current.openThread('t1'));
  expect(result.current.busy).toBe(false);
  expect(result.current.thread.question).toBe('First question');
  expect(mocked.getThread).not.toHaveBeenCalled();
});


it('keeps history order when selecting an older conversation or sending a follow-up', async () => {
  const history = [{ id: 'newer', title: 'Newer question' }, { id: 'older', title: 'Older question' }];
  localStorage.setItem('iso-history-v1', JSON.stringify(history));
  mocked.getThread.mockResolvedValue(answered({ thread_id: 'older', question: 'Older question' }));
  const { result } = renderHook(() => useConversation());
  await act(() => result.current.openThread('older'));
  expect(result.current.thread.thread_id).toBe('older');
  expect(result.current.history).toEqual(history);
  mocked.ask.mockResolvedValue(answered({ thread_id: 'older', question: 'Follow-up' }));
  await act(() => result.current.send('Follow-up'));
  expect(result.current.history).toEqual(history);
});


it('clears a sent question immediately and preserves typing while its answer arrives', async () => {
  mocked.createThread.mockResolvedValue({ thread_id: 't1' });
  let finish!: (thread: Thread) => void;
  mocked.ask.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useConversation());
  act(() => result.current.setDraft('Sent question'));
  let sending!: Promise<void>;
  act(() => { sending = result.current.send(); });
  expect(result.current.draft).toBe('');
  await waitFor(() => expect(mocked.ask).toHaveBeenCalledTimes(1));
  act(() => result.current.setDraft('Next question'));
  await act(() => result.current.send());
  expect(mocked.ask).toHaveBeenCalledTimes(1);
  await act(async () => { finish(answered()); await sending; });
  expect(result.current.draft).toBe('Next question');
});


it('adds response timing when an older backend omits it', async () => {
  mocked.createThread.mockResolvedValue({ thread_id: 't1' });
  mocked.ask.mockResolvedValue(answered());
  const { result } = renderHook(() => useConversation());
  await act(() => result.current.send('Question'));
  expect(result.current.thread.messages.at(-1)?.response_time_seconds).toEqual(expect.any(Number));
});


it('deletes the selected chat and opens an empty conversation', async () => {
  localStorage.setItem('iso-history-v1', JSON.stringify([{ id: 't1', title: 'Question' }]));
  mocked.getThread.mockResolvedValue(answered());
  mocked.deleteThread.mockResolvedValue({ deleted: true });
  const { result } = renderHook(() => useConversation());
  await act(() => result.current.openThread('t1'));
  await act(() => result.current.deleteThread('t1'));
  expect(mocked.deleteThread).toHaveBeenCalledWith('t1');
  expect(result.current.history).toEqual([]);
  expect(result.current.thread.thread_id).toBe('');
});
