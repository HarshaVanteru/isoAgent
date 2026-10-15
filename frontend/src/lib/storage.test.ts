import { afterEach, describe, expect, it, vi } from 'vitest';
import { storage } from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('storage', () => {
  it('round-trips values', () => {
    storage.set('k', 'v');
    expect(storage.get('k')).toBe('v');
    storage.remove('k');
    expect(storage.get('k')).toBeNull();
  });

  it('degrades silently when storage is blocked', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied);
    expect(storage.get('k')).toBeNull();
    expect(() => storage.set('k', 'v')).not.toThrow();
    expect(() => storage.remove('k')).not.toThrow();
  });
});
