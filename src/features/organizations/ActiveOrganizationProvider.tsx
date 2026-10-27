// Empresa ativa. Um usuário pode participar de várias e ter um espaço pessoal
// ("Minhas finanças"); o escolhido fica salvo no aparelho. O banco nunca confia
// nessa escolha: cada consulta passa pelo RLS.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { secureStorage } from '@/lib/secureStorage';

import { type Membership, useMyMemberships } from './api';

const STORAGE_KEY = 'gf.activeOrganization';
const LAST_BUSINESS_KEY = 'gf.lastBusiness';
const LAST_PERSONAL_KEY = 'gf.lastPersonal';

interface ActiveOrganizationState {
  memberships: Membership[];
  active: Membership | null;
  /**
   * O espaço pessoal em uso: o último aberto, senão o próprio, senão o da
   * família que a convidou. Null se ainda não abriu nenhum.
   */
  personal: Membership | null;
  /** Todos os espaços pessoais: o próprio e os da família que a convidou. */
  personalSpaces: Membership[];
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
  const [lastPersonalId, setLastPersonalId] = useState<string | null>(null);
  const [storedLoaded, setStoredLoaded] = useState(false);
  const memberships = useMemo(() => query.data ?? [], [query.data]);

  useEffect(() => {
    Promise.all([secureStorage.getItem(STORAGE_KEY), secureStorage.getItem(LAST_BUSINESS_KEY), secureStorage.getItem(LAST_PERSONAL_KEY)]).then(([v, last, lastPersonal]) => {
      setSelectedId(v);
      setLastBusinessId(last);
      setLastPersonalId(lastPersonal);
      setStoredLoaded(true);
    });
  }, []);

  const select = useCallback(
    (organizationId: string) => {
      setSelectedId(organizationId);
      secureStorage.setItem(STORAGE_KEY, organizationId);
      const kind = memberships.find((m) => m.organization.id === organizationId)?.organization.kind;
      if (kind === 'business') {
        setLastBusinessId(organizationId);
        secureStorage.setItem(LAST_BUSINESS_KEY, organizationId);
      } else if (kind === 'personal') {
        setLastPersonalId(organizationId);
        secureStorage.setItem(LAST_PERSONAL_KEY, organizationId);
      }
    },
    [memberships],
  );

  const active =
    memberships.find((m) => m.organization.id === selectedId) ?? memberships[0] ?? null;
  const personalSpaces = memberships.filter((m) => m.organization.kind === 'personal');
  const personal =
    personalSpaces.find((m) => m.organization.id === lastPersonalId) ?? personalSpaces.find((m) => m.role === 'owner') ?? personalSpaces[0] ?? null;
  const businesses = memberships.filter((m) => m.organization.kind === 'business');
  const lastBusiness = businesses.find((m) => m.organization.id === lastBusinessId) ?? businesses[0] ?? null;

  const value: ActiveOrganizationState = {
    memberships,
    active,
    personal,
    personalSpaces,
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
