import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorCard } from '@/components/ErrorCard';
import { ToastProvider } from '@/components/Toast';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { handleRecoveryUrl } from '@/features/auth/recovery';
import {
  ActiveOrganizationProvider,
  useActiveOrganization,
} from '@/features/organizations/ActiveOrganizationProvider';
import { friendlyError } from '@/lib/errors';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded) return <Loading />;
  if (!isSupabaseConfigured) return <MissingConfig />;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ActiveOrganizationProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </ToastProvider>
          </ActiveOrganizationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { session, loading: authLoading } = useAuth();
  const org = useActiveOrganization();
  const recovering = usePasswordRecovery();

  if (authLoading || (session && org.loading)) return <Loading />;
  if (session && org.error && !org.active) {
    return (
      <View style={styles.center}>
        <ErrorCard message={friendlyError(org.error)} onRetry={org.refetch} />
      </View>
    );
  }

  const signedIn = Boolean(session);
  const hasOrg = Boolean(org.active);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn && recovering}>
        <Stack.Screen name="nova-senha" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !recovering && !hasOrg}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !recovering && hasOrg}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

/** Fica true depois que o usuário abre o link de recuperação, até definir a nova senha. */
function usePasswordRecovery() {
  const [recovering, setRecovering] = useState(false);
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (url) handleRecoveryUrl(url).then((ok) => ok && setRecovering(true));
  }, [url]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') setRecovering(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return recovering;
}

function Loading() {
  return (
    <View style={styles.center} accessibilityLabel="Carregando">
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

function MissingConfig() {
  return (
    <View style={styles.center}>
      <Text style={styles.configTitle}>Configuração do Supabase ausente</Text>
      <Text style={styles.configText}>
        Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_KEY no arquivo .env (veja .env.example) e reinicie o app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'stretch', justifyContent: 'center', padding: 20, backgroundColor: colors.bg, gap: 8 },
  configTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink, textAlign: 'center' },
  configText: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, textAlign: 'center' },
});
