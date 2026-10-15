import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, BACKEND_ERROR_MESSAGE, UNREACHABLE_MESSAGE, isAbortError, request } from './client';

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
