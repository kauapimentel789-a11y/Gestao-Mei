import { CHUNK_SIZE, createChunkedStore, createWebStore, type RawStore } from '@/lib/secureStorage';

jest.mock('expo-secure-store', () => ({}));

function memoryRaw(): RawStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

describe('createChunkedStore', () => {
  it('guarda e lê valores maiores que o limite do SecureStore', async () => {
    const raw = memoryRaw();
    const store = createChunkedStore(raw);
    const big = 'x'.repeat(CHUNK_SIZE * 2 + 10);
    await store.setItem('sb-auth-token', big);
    expect(await store.getItem('sb-auth-token')).toBe(big);
    for (const v of raw.data.values()) expect(v.length).toBeLessThanOrEqual(CHUNK_SIZE);
  });

  it('remove partes antigas ao gravar um valor menor', async () => {
    const raw = memoryRaw();
    const store = createChunkedStore(raw);
    await store.setItem('k', 'a'.repeat(CHUNK_SIZE * 3));
    await store.setItem('k', 'curto');
    expect(await store.getItem('k')).toBe('curto');
    expect(raw.data.size).toBe(2); // contador + 1 parte
  });

  it('retorna null para chave ausente ou corrompida e limpa no remove', async () => {
    const raw = memoryRaw();
    const store = createChunkedStore(raw);
    expect(await store.getItem('nada')).toBeNull();
    await store.setItem('k', 'a'.repeat(CHUNK_SIZE + 1));
    raw.data.delete('k.1');
    expect(await store.getItem('k')).toBeNull();
    await store.removeItem('k');
    expect(raw.data.size).toBe(0);
  });

  it('usa chaves aceitas pelo SecureStore', async () => {
    const raw = memoryRaw();
    await createChunkedStore(raw).setItem('sb:auth/token', 'v');
    for (const k of raw.data.keys()) expect(k).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe('createWebStore', () => {
  function fakeLocal() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  }

  it('mantém o login se o navegador apagar o localStorage no meio do uso', async () => {
    const local = fakeLocal();
    const store = createWebStore(() => local);
    await store.setItem('sb-token', 'sessao');
    local.data.clear();
    expect(await store.getItem('sb-token')).toBe('sessao');
  });

  it('funciona quando o localStorage dá erro', async () => {
    const store = createWebStore(() => {
      throw new Error('bloqueado');
    });
    await store.setItem('k', 'v');
    expect(await store.getItem('k')).toBe('v');
  });

  it('sair da conta apaga as duas cópias', async () => {
    const local = fakeLocal();
    const store = createWebStore(() => local);
    await store.setItem('k', 'v');
    await store.removeItem('k');
    expect(await store.getItem('k')).toBeNull();
    await store.setItem('k', 'v');
    local.data.delete('k');
    store.forget('k');
    expect(await store.getItem('k')).toBeNull();
  });
});
