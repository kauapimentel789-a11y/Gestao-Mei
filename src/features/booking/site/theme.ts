// Visual escuro da página de agendamento do cliente, com o laranja da marca.
import { Platform } from 'react-native';

import { colors as brand, fonts } from '@/theme/tokens';

export const site = {
  bg: '#0A0A0D',
  surface: '#131317',
  surface2: '#1A1A20',
  raised: '#202027',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#F5F5F7',
  muted: '#A1A1AA',
  faint: '#71717A',
  accent: brand.primary,
  accentPressed: brand.primaryPressed,
  accentSoft: 'rgba(255,106,0,0.14)',
  accentLine: 'rgba(255,106,0,0.55)',
  accentText: '#FF8A3D',
  success: '#22C55E',
  danger: '#F87171',
} as const;

export const siteFonts = {
  ...fonts,
  // Títulos com serifa no site, como nos modelos; no app nativo fica a Manrope.
  display: Platform.OS === 'web' ? 'Georgia, "Times New Roman", serif' : fonts.extrabold,
} as const;

export const MAX_WIDTH = 1180;
