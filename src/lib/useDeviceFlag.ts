// Preferência simples guardada só neste aparelho (ex.: "esconder primeiros passos").
import { useCallback, useEffect, useState } from 'react';

import { secureStorage } from './secureStorage';

/** [valor, gravar]. Enquanto lê o aparelho, o valor é null. */
export function useDeviceFlag(key: string): [boolean | null, (on: boolean) => void] {
  // Guarda a chave junto: ao trocar de chave, o valor antigo não vale mais.
  const [state, setState] = useState<{ key: string; value: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    secureStorage
      .getItem(key)
      .then((v) => alive && setState({ key, value: v === '1' }))
      .catch(() => alive && setState({ key, value: false }));
    return () => {
      alive = false;
    };
  }, [key]);

  const set = useCallback(
    (on: boolean) => {
      setState({ key, value: on });
      (on ? secureStorage.setItem(key, '1') : secureStorage.removeItem(key)).catch(() => undefined);
    },
    [key],
  );

  return [state?.key === key ? state.value : null, set];
}
