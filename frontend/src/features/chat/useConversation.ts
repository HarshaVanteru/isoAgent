import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import type { Thread } from '../../api/types';
import { storage } from '../../lib/storage';

export const THREAD_STORAGE_KEY = 'iso-thread';

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

/** Owns the active conversation: restore, ask/clarify, draft, and errors. */
export function useConversation() {
  const [thread, setThread] = useState<Thread>(emptyThread);
  const [category, setCategory] = useState('');
  const [draft, setDraft] = useState('');
  const [restoring, setRestoring] = useState(() => storage.get(THREAD_STORAGE_KEY) !== null);
  const [busy, setBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const storedId = storage.get(THREAD_STORAGE_KEY);
    if (!storedId) return;
    let active = true;
    api
      .getThread(storedId)
      .then((restored) => {
        if (!active) return;
        setThread(restored);
        setCategory(restored.category ?? '');
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 422)) {
          storage.remove(THREAD_STORAGE_KEY);
        } else {
          setThread((current) => ({ ...current, thread_id: storedId }));
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const send = useCallback(
    async (text?: string) => {
      const message = (text ?? draft).trim();
      if (!message || inFlight.current || restoring) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setPendingMessage(message);
      try {
        let threadId = thread.thread_id;
        if (!threadId) {
          const created = (await api.createThread()).thread_id;
          storage.set(THREAD_STORAGE_KEY, created);
          setThread((current) => ({ ...current, thread_id: created }));
          threadId = created;
        }
        const result = thread.pending_clarification
          ? await api.clarify(threadId, message)
          : await api.ask(threadId, message, category);
        setThread(result);
        setDraft('');
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        inFlight.current = false;
        setBusy(false);
        setPendingMessage('');
      }
    },
    [draft, restoring, thread.thread_id, thread.pending_clarification, category],
  );

  const reset = useCallback(() => {
    if (inFlight.current || restoring) return;
    storage.remove(THREAD_STORAGE_KEY);
    setThread(emptyThread());
    setCategory('');
    setDraft('');
    setError(null);
  }, [restoring]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    thread,
    category,
    setCategory,
    draft,
    setDraft,
    restoring,
    busy,
    pendingMessage,
    error,
    dismissError,
    send,
    reset,
  };
}

export type Conversation = ReturnType<typeof useConversation>;
