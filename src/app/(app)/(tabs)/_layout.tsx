import { Tabs } from 'expo-router/tabs';
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  House,
  Landmark,
  type LucideIcon,
  Package,
  ReceiptText,
  Users,
  Wallet,
} from 'lucide-react-native';

import { getBusinessConfig, PERSONAL_TAB_LABELS, PERSONAL_TABS, type TabKey } from '@/config/business';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';
import { colors, fonts, shadows } from '@/theme/tokens';

const ICONS: Record<TabKey, LucideIcon> = {
  inicio: House,
  pedidos: ReceiptText,
  estoque: Package,
  agenda: CalendarDays,
  clientes: Users,
  tarefas: ClipboardList,
  financeiro: Wallet,
  contas: Landmark,
  cartoes: CreditCard,
};

const ROUTES: Record<TabKey, string> = {
  inicio: 'index',
  pedidos: 'pedidos',
  estoque: 'estoque',
  agenda: 'agenda',
  clientes: 'clientes',
  tarefas: 'tarefas',
  financeiro: 'financeiro',
  contas: 'contas',
  cartoes: 'cartoes',
};

const ALL_TABS = Object.keys(ROUTES) as TabKey[];

export default function TabsLayout() {
  const { active } = useActiveOrganization();
  // O layout só é montado com empresa ativa (guarda no layout raiz).
  const org = active!.organization;
  const config = org.kind === 'personal' ? null : getBusinessConfig(org.business_type, org.practice_area);
  const tabs = config ? config.tabs : PERSONAL_TABS;
  const labels = config ? config.tabLabels : PERSONAL_TAB_LABELS;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray500,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          backgroundColor: colors.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTopWidth: 0,
          ...shadows.tabBar,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {ALL_TABS.map((key) => {
        const Icon = ICONS[key];
        const visible = tabs.includes(key);
        return (
          <Tabs.Screen
            key={key}
            name={ROUTES[key]}
            options={{
              title: labels[key],
              href: visible ? undefined : null,
              tabBarIcon: ({ color, size }) => <Icon color={color} size={Math.min(size, 22)} strokeWidth={2} />,
            }}
          />
        );
      })}
    </Tabs>
  );
}
