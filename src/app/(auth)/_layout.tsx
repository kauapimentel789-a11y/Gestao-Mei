import { Stack } from 'expo-router';

export const unstable_settings = { anchor: 'entrar' };

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
