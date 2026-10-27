import { getBusinessConfig } from '@/config/business';

import { useActiveOrganization } from './ActiveOrganizationProvider';
import { type Organization, type PersonalSpace } from './api';

/** Empresa ativa nas telas do app (só montadas quando existe uma). */
export function useOrg() {
  const { active } = useActiveOrganization();
  if (!active) throw new Error('useOrg sem empresa ativa');
  if (active.organization.kind !== 'business') throw new Error('useOrg no espaço pessoal');
  const org: Organization = active.organization;
  return { org, orgId: org.id, role: active.role, config: getBusinessConfig(org.business_type, org.practice_area) };
}

/**
 * Espaço ativo, empresa ou pessoal. Usado pelas telas do financeiro que servem
 * aos dois (contas, categorias, lançamentos, transferências).
 */
export function useSpace() {
  const { active } = useActiveOrganization();
  if (!active) throw new Error('useSpace sem espaço ativo');
  const space = active.organization;
  const personal = space.kind === 'personal';
  return {
    space,
    orgId: space.id,
    role: active.role,
    personal,
    business: personal ? null : (space as Organization),
    personalSpace: personal ? (space as PersonalSpace) : null,
  };
}
