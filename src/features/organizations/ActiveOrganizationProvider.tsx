// Empresa ativa. Um usuário pode participar de várias e ter um espaço pessoal
// ("Minhas finanças"); o escolhido fica salvo no aparelho. O banco nunca confia
// nessa escolha: cada consulta passa pelo RLS.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { secureStorage } from '@/lib/secureStorage';

import { type Membership, useMyMemberships } from './api';

const STORAGE_KEY = 'gf.activeOrganization';
const LAST_BUSINESS_KEY = 'gf.lastBusiness';

interface ActiveOrganizationState {
  memberships: Membership[];
  active: Membership | null;
  /** O espaço pessoal da pessoa, se já foi aberto. */
  personal: Membership | null;
  /** Empresas, sem o espaço pessoal. */
  businesses: Membership[];
  /** Empresa usada por último (para voltar do pessoal). */
  lastBusiness: Membership | null;
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
  const [lastBusinessId, setLastBusinessId] = useState<string | null>(null);
  const [storedLoaded, setStoredLoaded] = useState(false);
  const memberships = useMemo(() => query.data ?? [], [query.data]);

  useEffect(() => {
    Promise.all([secureStorage.getItem(STORAGE_KEY), secureStorage.getItem(LAST_BUSINESS_KEY)]).then(([v, last]) => {
      setSelectedId(v);
      setLastBusinessId(last);
      setStoredLoaded(true);
    });
  }, []);

  const select = useCallback(
    (organizationId: string) => {
      setSelectedId(organizationId);
      secureStorage.setItem(STORAGE_KEY, organizationId);
      if (memberships.some((m) => m.organization.id === organizationId && m.organization.kind === 'business')) {
        setLastBusinessId(organizationId);
        secureStorage.setItem(LAST_BUSINESS_KEY, organizationId);
      }
    },
    [memberships],
  );

  const active =
    memberships.find((m) => m.organization.id === selectedId) ?? memberships[0] ?? null;
  const personal = memberships.find((m) => m.organization.kind === 'personal' && m.role === 'owner') ?? null;
  const businesses = memberships.filter((m) => m.organization.kind === 'business');
  const lastBusiness = businesses.find((m) => m.organization.id === lastBusinessId) ?? businesses[0] ?? null;

  const value: ActiveOrganizationState = {
    memberships,
    active,
    personal,
    businesses,
    lastBusiness,
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
