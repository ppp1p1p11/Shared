import * as SecureStore from 'expo-secure-store';

/**
 * Supabase session storage backed by the Keychain / Keystore. SecureStore values are capped
 * at ~2 KB on some Android devices, so values are split into chunks. The refresh token kept
 * here is the "device token" that keeps an anonymous user signed in on this device.
 */
const CHUNK = 1800;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const prev = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK, // background uploads need the token while locked
      });
    }
    for (let i = n; i < prev; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.setItemAsync(`${key}.n`, String(n), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  },
  async removeItem(key: string): Promise<void> {
    const prev = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    for (let i = 0; i < prev; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};
