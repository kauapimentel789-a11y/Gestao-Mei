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

export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Web: localStorage com uma cópia em memória. Alguns navegadores embutidos
 * (ex.: o do app do Google ou do Gmail no iPhone) apagam ou não gravam o
 * localStorage no meio do uso; sem a cópia, o login "sumia" e o banco recusava
 * as ações com "permission denied". A cópia vale enquanto a aba estiver aberta.
 */
export function createWebStore(getStorage: () => WebStorageLike | undefined): KeyValueStore & {
  /** Outra aba apagou a chave (ex.: saiu da conta): esquece a cópia. */
  forget(key: string): void;
} {
  const memory = new Map<string, string>();
  return {
    async getItem(key) {
      try {
        const v = getStorage()?.getItem(key);
        if (v !== null && v !== undefined) return v;
      } catch {
        // armazenamento indisponível: usa a cópia em memória
      }
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
      try {
        getStorage()?.setItem(key, value);
      } catch {
        // modo privado ou cota cheia: fica só a cópia em memória
      }
    },
    async removeItem(key) {
      memory.delete(key);
      try {
        getStorage()?.removeItem(key);
      } catch {
        // idem
      }
    },
    forget(key) {
      memory.delete(key);
    },
  };
}

function browserStorage(): WebStorageLike | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

const webStore = createWebStore(browserStorage);

// Saiu da conta em outra aba: a cópia em memória desta aba não pode reviver o login.
if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key && e.newValue === null) webStore.forget(e.key);
  });
}

export const secureStorage: KeyValueStore =
  Platform.OS === 'web'
    ? webStore
    : createChunkedStore({
        get: (k) => SecureStore.getItemAsync(k),
        set: (k, v) => SecureStore.setItemAsync(k, v),
        remove: (k) => SecureStore.deleteItemAsync(k),
      });
