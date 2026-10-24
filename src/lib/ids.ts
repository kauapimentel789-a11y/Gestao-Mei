import * as Crypto from 'expo-crypto';

/** UUID v4 para chaves de idempotência. */
export function newId(): string {
  return Crypto.randomUUID();
}
