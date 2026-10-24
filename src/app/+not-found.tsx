import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';

/**
 * Endereço que não existe (ou a raiz quando a área logada está bloqueada,
 * ex.: ao abrir pelo Expo Go sem login): leva para a tela certa do momento.
 */
export default function NotFound() {
  const { session } = useAuth();
  const org = useActiveOrganization();

  if (!session) return <Redirect href="/entrar" />;
  if (!org.active) return <Redirect href="/criar-empresa" />;
  return <Redirect href="/" />;
}
