// Armazenamento da sessão do Supabase.
// Nativo: expo-secure-store (Keychain/Keystore). Como o SecureStore limita cada
// valor a ~2 KB e o token do Supabase pode passar disso, o valor é dividido
// em partes. Web: localStorage (o SecureStore não existe no navegador).
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const CHUNK_SIZE = 1800;

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface RawStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// Chaves do SecureStore aceitam só [A-Za-z0-9._-].
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export function createChunkedStore(raw: RawStore): KeyValueStore {
  const countKey = (key: string) => `${safeKey(key)}.n`;
  const partKey = (key: string, i: number) => `${safeKey(key)}.${i}`;

  async function removeItem(key: string) {
    const n = Number((await raw.get(countKey(key))) ?? 0);
    for (let i = 0; i < n; i++) await raw.remove(partKey(key, i));
    await raw.remove(countKey(key));
  }

  return {
    async getItem(key) {
      const count = await raw.get(countKey(key));
      if (count === null) return null;
      const parts: string[] = [];
      for (let i = 0; i < Number(count); i++) {
        const part = await raw.get(partKey(key, i));
        if (part === null) return null; // valor corrompido: trata como ausente
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      await removeItem(key);
      const n = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
      for (let i = 0; i < n; i++) {
        await raw.set(partKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
      await raw.set(countKey(key), String(n));
    },
    removeItem,
  };
}

const webStore: KeyValueStore = {
  async getItem(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // armazenamento indisponível (modo privado): a sessão dura só a aba
    }
  },
  async removeItem(key) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // idem
    }
  },
};

export const secureStorage: KeyValueStore =
  Platform.OS === 'web'
    ? webStore
    : createChunkedStore({
        get: (k) => SecureStore.getItemAsync(k),
        set: (k, v) => SecureStore.setItemAsync(k, v),
        remove: (k) => SecureStore.deleteItemAsync(k),
      });
