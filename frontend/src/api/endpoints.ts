import { request, streamRequest } from './client';
import type { Health, LibraryReport, Thread } from './types';

const threadPath = (id: string) => `/threads/${encodeURIComponent(id)}`;

export const api = {
  health: (signal?: AbortSignal) => request<Health>('/health', { signal }),
  library: (signal?: AbortSignal) => request<LibraryReport>('/documents', { signal }),
  createThread: () => request<{ thread_id: string }>('/threads', { body: {} }),
  deleteThread: (id: string) => request<{ deleted: boolean }>(threadPath(id), { method: 'DELETE' }),
  getThread: (id: string) => request<Thread>(threadPath(id)),
  ask: (id: string, question: string, category: string, onProgress?: (stage: string) => void) =>
    onProgress ? streamRequest<Thread>(`${threadPath(id)}/messages`, { question, category }, onProgress) : request<Thread>(`${threadPath(id)}/messages`, { body: { question, category } }),
  clarify: (id: string, answer: string, onProgress?: (stage: string) => void) => onProgress ? streamRequest<Thread>(`${threadPath(id)}/clarify`, { answer }, onProgress) : request<Thread>(`${threadPath(id)}/clarify`, { body: { answer } }),
};
