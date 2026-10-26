import { useQuery } from '@tanstack/react-query';

import type { BusinessType, PracticeArea } from '@/config/business';
import { supabase } from '@/lib/supabase';

export type AdminDays = 7 | 30 | 365;
export type PlanKey = 'free' | 'pro' | 'pro_max';

export interface AdminSignup {
  email: string | null;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  organization: string | null;
  business_type: BusinessType | null;
  practice_area: PracticeArea | null;
  plan: PlanKey | null;
}

export interface AdminDashboard {
  from: string;
  to: string;
  by_month: boolean;
  users: {
    total: number;
    new: number;
    new_previous: number;
    unconfirmed: number;
    without_company: number;
    signed_in_7d: number;
    signed_in_30d: number;
  };
  organizations: { total: number; new: number; new_previous: number; active_7d: number; active_30d: number; never_used: number };
  by_type: { production: number; resale: number; services: number; appointments: number };
  by_plan: Record<PlanKey, number>;
  features: { public_orders: number; online_booking: number; pix: number };
  usage: { orders: number; customers: number; financial_entries: number; tasks: number };
  series: { bucket: string; users: number; organizations: number }[];
  expiring: { name: string; slug: string; plan: PlanKey; plan_until: string }[];
  top_organizations: { name: string; business_type: BusinessType; practice_area: PracticeArea | null; plan: PlanKey; orders: number }[];
  recent_signups: AdminSignup[];
}

/** Se quem está logado administra o Gestão Fácil. Falha vira "não". */
export function useIsPlatformAdmin(userId: string | undefined) {
  return useQuery({
    queryKey: ['platform-admin', userId ?? 'anon'],
    enabled: Boolean(userId),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('is_platform_admin');
      if (error) return false;
      return data === true;
    },
  });
}

export function useAdminDashboard(days: AdminDays, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-dashboard', days],
    enabled,
    queryFn: async (): Promise<AdminDashboard> => {
      const { data, error } = await supabase.rpc('admin_dashboard', { p_days: days });
      if (error) throw error;
      return data as AdminDashboard;
    },
  });
}
