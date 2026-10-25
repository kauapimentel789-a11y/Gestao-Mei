import { router } from 'expo-router';

/**
 * Volta para a tela anterior. Sem histórico (no site, quando a página foi
 * aberta direto pelo endereço ou recarregada), vai para o Início.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
