import { Tabs } from 'expo-router/tabs';
import {
  CalendarDays,
  ClipboardList,
  House,
  type LucideIcon,
  Package,
  ReceiptText,
  Wallet,
} from 'lucide-react-native';

import { getBusinessConfig, type TabKey } from '@/config/business';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';
import { colors, fonts, shadows } from '@/theme/tokens';

const ICONS: Record<TabKey, LucideIcon> = {
  inicio: House,
  pedidos: ReceiptText,
  estoque: Package,
  agenda: CalendarDays,
  tarefas: ClipboardList,
  financeiro: Wallet,
};

const ROUTES: Record<TabKey, string> = {
  inicio: 'index',
  pedidos: 'pedidos',
  estoque: 'estoque',
  agenda: 'agenda',
  tarefas: 'tarefas',
  financeiro: 'financeiro',
};

const ALL_TABS = Object.keys(ROUTES) as TabKey[];

export default function TabsLayout() {
  const { active } = useActiveOrganization();
  // O layout só é montado com empresa ativa (guarda no layout raiz).
  const config = getBusinessConfig(active!.organization.business_type);

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
        const visible = config.tabs.includes(key);
        return (
          <Tabs.Screen
            key={key}
            name={ROUTES[key]}
            options={{
              title: config.tabLabels[key],
              href: visible ? undefined : null,
              tabBarIcon: ({ color, size }) => <Icon color={color} size={Math.min(size, 22)} strokeWidth={2} />,
            }}
          />
        );
      })}
    </Tabs>
  );
}
