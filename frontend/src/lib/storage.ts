/** localStorage that never throws (private mode, blocked cookies, quota). */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // The conversation simply will not survive a reload.
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  },
};
