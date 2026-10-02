/** Web: the session lives in localStorage (same-origin only). */
export const secureStorage = {
  async getItem(key: string) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {}
  },
  async removeItem(key: string) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {}
  },
};
