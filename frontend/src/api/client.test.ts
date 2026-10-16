import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, BACKEND_ERROR_MESSAGE, UNREACHABLE_MESSAGE, isAbortError, request, streamRequest } from './client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockFetch(implementation: () => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('GETs JSON under the /api prefix', async () => {
    const fetchMock = mockFetch(async () => json({ ok: true }));
    await expect(request('/health')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', { signal: undefined });
  });

  it('POSTs a JSON body', async () => {
    const fetchMock = mockFetch(async () => json({ thread_id: 't' }));
    await request('/threads', { body: { a: 1 } });
    expect(fetchMock).toHaveBeenCalledWith('/api/threads', {
      method: 'POST',
      signal: undefined,
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
  });

  it('uses a FastAPI string detail as the message', async () => {
    mockFetch(async () => json({ detail: 'Conversation not found' }, 404));
    const error = await request('/threads/x').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: 'Conversation not found' });
  });

  it('uses the first validation message for 422 responses', async () => {
    mockFetch(async () => json({ detail: [{ msg: 'Value error, Question cannot be blank' }] }, 422));
    await expect(request('/x', { body: {} })).rejects.toMatchObject({
      status: 422,
      message: 'Value error, Question cannot be blank',
    });
  });

  it('explains non-JSON server failures such as a dev-proxy error', async () => {
    mockFetch(async () => new Response('', { status: 500 }));
    await expect(request('/documents')).rejects.toMatchObject({ status: 500, message: BACKEND_ERROR_MESSAGE });
  });

  it('reports network failures as an unreachable backend', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(request('/health')).rejects.toMatchObject({ status: 0, message: UNREACHABLE_MESSAGE });
  });

  it('rethrows aborts untouched', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    mockFetch(async () => {
      throw abort;
    });
    const error = await request('/health').catch((caught: unknown) => caught);
    expect(error).toBe(abort);
    expect(isAbortError(error)).toBe(true);
  });
});


describe('streamRequest', () => {
  function stream(chunks: string[]) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    } }));
  }

  it('handles split progress frames and returns the final result', async () => {
    mockFetch(async () => stream([
      ': connected\n\nevent: pro',
      'gress\ndata: {"stage":"retrieval"}\n',
      '\nevent: result\ndata: {"answer":"Done"}\n\n',
    ]));
    const notify = vi.fn();
    await expect(streamRequest('/threads/t/messages', { question: 'Q' }, notify)).resolves.toEqual({ answer: 'Done' });
    expect(notify).toHaveBeenCalledWith('retrieval');
  });

  it('rejects server errors and incomplete responses', async () => {
    mockFetch(async () => stream(['event: error\ndata: {"detail":"No evidence"}\n\n']));
    await expect(streamRequest('/threads/t/messages', {}, vi.fn())).rejects.toThrow('No evidence');
    mockFetch(async () => stream([': keepalive\n\n']));
    await expect(streamRequest('/threads/t/messages', {}, vi.fn())).rejects.toThrow('connection ended');
  });
});
