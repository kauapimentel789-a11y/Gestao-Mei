// Família: convites para dividir "Minhas finanças" e quem está no espaço.
// O banco confere tudo (invite_to_space, answer_invite, remove_space_member).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { organizationKeys } from '@/features/organizations/api';
import { supabase } from '@/lib/supabase';

export interface MyInvite {
  id: string;
  organization_id: string;
  invited_by_name: string;
  created_at: string;
  expires_at: string;
}

export interface SpaceMember {
  user_id: string;
  display_name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export interface SentInvite {
  id: string;
  email: string;
  created_at: string;
  expires_at: string;
}

const familyKeys = {
  mine: (userId: string) => ['invites', 'mine', userId] as const,
  members: (orgId: string) => ['family', orgId, 'members'] as const,
  sent: (orgId: string) => ['family', orgId, 'sent'] as const,
};

/** Convites em aberto para o e-mail de quem está logado. */
export function useMyInvites(userId: string | undefined) {
  return useQuery({
    queryKey: familyKeys.mine(userId ?? 'anon'),
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyInvite[]> => {
      const { data, error } = await supabase.rpc('my_invites');
      if (error) throw error;
      return (data ?? []) as MyInvite[];
    },
  });
}

export function useAnswerInvite(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteId, accept }: { inviteId: string; accept: boolean }): Promise<string | null> => {
      const { data, error } = await supabase.rpc('answer_invite', { p_invite_id: inviteId, p_accept: accept });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: familyKeys.mine(userId ?? 'anon') }),
        qc.invalidateQueries({ queryKey: organizationKeys.mine(userId ?? 'anon') }),
      ]);
    },
  });
}

export function useSpaceMembers(orgId: string) {
  return useQuery({
    queryKey: familyKeys.members(orgId),
    queryFn: async (): Promise<SpaceMember[]> => {
      const { data, error } = await supabase.rpc('space_members', { p_organization_id: orgId });
      if (error) throw error;
      return (data ?? []) as SpaceMember[];
    },
  });
}

/** Convites enviados e ainda em aberto. */
export function useSentInvites(orgId: string) {
  return useQuery({
    queryKey: familyKeys.sent(orgId),
    queryFn: async (): Promise<SentInvite[]> => {
      const { data, error } = await supabase
        .from('organization_invites')
        .select('id, email, created_at, expires_at')
        .eq('organization_id', orgId)
        .is('accepted_at', null)
        .is('declined_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as SentInvite[];
    },
  });
}

function useInvalidateFamily(orgId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['family', orgId] });
}

export function useInvite(orgId: string) {
  const invalidate = useInvalidateFamily(orgId);
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.rpc('invite_to_space', { p_organization_id: orgId, p_email: email });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRevokeInvite(orgId: string) {
  const invalidate = useInvalidateFamily(orgId);
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.rpc('revoke_invite', { p_invite_id: inviteId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Tira alguém do espaço; com o próprio id, é sair. */
export function useRemoveMember(orgId: string, userId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = useInvalidateFamily(orgId);
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('remove_space_member', { p_organization_id: orgId, p_user_id: memberId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: organizationKeys.mine(userId ?? 'anon') });
    },
  });
}
