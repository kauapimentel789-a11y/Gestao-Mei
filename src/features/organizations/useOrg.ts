import { getBusinessConfig } from '@/config/business';

import { useActiveOrganization } from './ActiveOrganizationProvider';

/** Empresa ativa nas telas do app (só montadas quando existe uma). */
export function useOrg() {
  const { active } = useActiveOrganization();
  if (!active) throw new Error('useOrg sem empresa ativa');
  const org = active.organization;
  return { org, orgId: org.id, role: active.role, config: getBusinessConfig(org.business_type) };
}
