// Tokens do design (docs/design_handoff/README.md, seção "Design tokens").
export const colors = {
  primary: '#FF6A00',
  primaryPressed: '#F25F00',
  primaryTint: '#FFF1E6',
  primaryTintPressed: '#FFE2CC',
  primaryText: '#C2410C',
  primarySoft: '#FFB27A',
  ink: '#0B0B0F',
  graphite: '#1F2937',
  gray700: '#374151',
  gray600: '#4B5563',
  gray500: '#6B7280',
  gray400: '#9CA3AF',
  gray300: '#D1D5DB',
  gray200: '#E5E7EB',
  gray150: '#EBEBEF',
  gray100: '#F3F4F6',
  divider: '#F1F1F4',
  rowPressed: '#F7F7F9',
  bg: '#F5F5F7',
  surface: '#FFFFFF',
  white: '#FFFFFF',
} as const;

export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const radius = {
  hero: 26,
  card: 24,
  notification: 22,
  quickAction: 20,
  buttonLarge: 18,
  segmented: 16,
  input: 14,
  segmentedOption: 12,
  pill: 20,
} as const;

export const spacing = {
  screen: 20,
  cardGap: 14,
  cardPadding: 18,
  gap: 12,
} as const;

export const shadows = {
  card: {
    shadowColor: colors.ink,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  primaryButton: {
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  tabBar: {
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
} as const;

export const minTouch = 44;
