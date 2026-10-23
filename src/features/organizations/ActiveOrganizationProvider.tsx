// Empresa ativa. Um usuário pode participar de várias; a escolhida fica salva
// no aparelho. O banco nunca confia nessa escolha: cada consulta passa pelo RLS.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { secureStorage } from '@/lib/secureStorage';

import { type Membership, useMyMemberships } from './api';

const STORAGE_KEY = 'gf.activeOrganization';

interface ActiveOrganizationState {
  memberships: Membership[];
  active: Membership | null;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  select: (organizationId: string) => void;
}

const Ctx = createContext<ActiveOrganizationState | null>(null);

export function ActiveOrganizationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const query = useMyMemberships(userId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [storedLoaded, setStoredLoaded] = useState(false);

  useEffect(() => {
    secureStorage.getItem(STORAGE_KEY).then((v) => {
      setSelectedId(v);
      setStoredLoaded(true);
    });
  }, []);

  const select = useCallback((organizationId: string) => {
    setSelectedId(organizationId);
    secureStorage.setItem(STORAGE_KEY, organizationId);
  }, []);

  const memberships = useMemo(() => query.data ?? [], [query.data]);
  const active =
    memberships.find((m) => m.organization.id === selectedId) ?? memberships[0] ?? null;

  const value: ActiveOrganizationState = {
    memberships,
    active,
    loading: Boolean(userId) && (query.isPending || !storedLoaded),
    error: query.error,
    refetch: () => void query.refetch(),
    select,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveOrganization() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useActiveOrganization fora do ActiveOrganizationProvider');
  return ctx;
}
