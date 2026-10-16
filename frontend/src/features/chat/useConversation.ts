import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Thread } from '../../api/types';
import { storage } from '../../lib/storage';

export const THREAD_STORAGE_KEY = 'iso-thread';
const HISTORY_STORAGE_KEY = 'iso-history-v1';
export interface ConversationSummary { id: string; title: string }

function readHistory(): ConversationSummary[] {
  try {
    const value: unknown = JSON.parse(storage.get(HISTORY_STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is ConversationSummary =>
      item !== null && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string') : [];
  } catch { return []; }
}

export const emptyThread = (): Thread => ({
  thread_id: '',
  category: '',
  pending_clarification: false,
  clarification_question: '',
  clarification_history: [],
  messages: [],
  question: '',
  answer: '',
  sources: [],
});

interface Session {
  thread: Thread;
  category: string;
  draft: string;
  busy: boolean;
  restoring: boolean;
  stage: string;
  pendingMessage: string;
  error: string | null;
  startedAt?: number;
}
const newSession = (): Session => ({ thread: emptyThread(), category: '', draft: '', busy: false,
  restoring: false, stage: '', pendingMessage: '', error: null });

/** Requests update their own session even when another conversation is visible. */
export function useConversation() {
  const [history, setHistory] = useState(readHistory);
  const initial = useRef(storage.get(THREAD_STORAGE_KEY) || 'new');
  const active = useRef(initial.current);
  const sessions = useRef<Record<string, Session>>({
    [initial.current]: { ...newSession(), restoring: initial.current !== 'new' },
  });
  const [session, setSession] = useState(sessions.current[initial.current]);
  const update = useCallback((key: string, patch: Partial<Session>) => {
    if (!sessions.current[key]) return;
    sessions.current[key] = { ...sessions.current[key], ...patch };
    if (active.current === key) setSession(sessions.current[key]);
  }, []);

  const remember = useCallback((id: string, title: string) => {
    setHistory((current) => current.some((item) => item.id === id)
      ? current
      : [{ id, title: title.slice(0, 100) }, ...current]);
  }, []);

  useEffect(() => { storage.set(HISTORY_STORAGE_KEY, JSON.stringify(history)); }, [history]);

  useEffect(() => {
    const id = initial.current;
    if (id === 'new') return;
    let mounted = true;
    api.getThread(id).then((thread) => {
      if (!mounted) return;
      update(id, { thread, category: thread.category ?? '' });
      if (thread.question) remember(id, thread.messages.find((m) => m.role === 'user')?.content ?? thread.question);
    }).catch((caught: unknown) => {
      if (!mounted) return;
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 422)) {
        if (active.current === id) storage.remove(THREAD_STORAGE_KEY);
        setHistory((current) => current.filter((item) => item.id !== id));
      } else update(id, { thread: { ...emptyThread(), thread_id: id }, error: errorMessage(caught) });
    }).finally(() => { if (mounted) update(id, { restoring: false }); });
    return () => { mounted = false; };
  }, [remember, update]);

  const openThread = useCallback(async (id: string) => {
    active.current = id;
    storage.set(THREAD_STORAGE_KEY, id);
    if (sessions.current[id]) {
      setSession(sessions.current[id]);
      return;
    }
    sessions.current[id] = { ...newSession(), restoring: true };
    setSession(sessions.current[id]);
    try {
      const thread = await api.getThread(id);
      update(id, { thread, category: thread.category ?? '' });
      if (thread.question) remember(id, thread.messages.find((m) => m.role === 'user')?.content ?? thread.question);
    } catch (caught) {
      update(id, { error: errorMessage(caught) });
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 422)) {
        setHistory((current) => current.filter((item) => item.id !== id));
      }
    } finally { update(id, { restoring: false }); }
  }, [remember, update]);

  const send = useCallback(async (text?: string) => {
    let key = active.current;
    const current = sessions.current[key];
    const message = (text ?? current.draft).trim();
    if (!message || current.busy || current.restoring) return;
    update(key, { draft: '', busy: true, stage: 'queued', error: null, pendingMessage: message, startedAt: Date.now() });
    try {
      let id = current.thread.thread_id;
      if (!id) {
        id = (await api.createThread()).thread_id;
        sessions.current[id] = sessions.current[key];
        if (active.current === key) {
          active.current = id;
          storage.set(THREAD_STORAGE_KEY, id);
        }
        delete sessions.current[key];
        key = id;
        update(key, { thread: { ...current.thread, thread_id: id } });
      }
      remember(id, message);
      const notify = (stage: string) => update(key, { stage });
      const thread = current.thread.pending_clarification
        ? await api.clarify(id, message, notify)
        : await api.ask(id, message, current.category, notify);
      if (!sessions.current[key]) return;
      const lastAnswer = thread.messages.findLastIndex((item) => item.role === 'assistant');
      if (!thread.pending_clarification && lastAnswer >= 0 && thread.messages[lastAnswer].response_time_seconds == null) {
        const elapsed = Math.max(0, (Date.now() - (sessions.current[key].startedAt ?? Date.now())) / 1000);
        thread.messages = thread.messages.map((item, index) => index === lastAnswer
          ? { ...item, response_time_seconds: elapsed } : item);
      }
      update(key, { thread });
    } catch (caught) { update(key, { error: errorMessage(caught), draft: sessions.current[key]?.draft || message }); }
    finally { update(key, { busy: false, pendingMessage: '' }); }
  }, [remember, update]);

  const reset = useCallback(() => {
    const key = `new-${crypto.randomUUID()}`;
    active.current = key;
    sessions.current[key] = newSession();
    storage.remove(THREAD_STORAGE_KEY);
    setSession(sessions.current[key]);
  }, []);

  const deleteThread = useCallback(async (id: string) => {
    try {
      await api.deleteThread(id);
      setHistory((current) => current.filter((item) => item.id !== id));
      delete sessions.current[id];
      if (active.current === id) reset();
    } catch (caught) {
      update(active.current, { error: errorMessage(caught) });
    }
  }, [reset, update]);

  const setCategory = useCallback((category: string) => update(active.current, { category }), [update]);
  const setDraft = useCallback((draft: string) => update(active.current, { draft }), [update]);
  const dismissError = useCallback(() => update(active.current, { error: null }), [update]);
  return { ...session, history, openThread, deleteThread, setCategory, setDraft, dismissError, send, reset };
}

export type Conversation = ReturnType<typeof useConversation>;
