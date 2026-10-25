// Animações leves, com a Animated do React Native (funcionam no app e no site):
// entrada suave, toque que "afunda" e brilho pulsando. Respeitam o "reduzir
// movimento" do aparelho.
import { type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';

const native = Platform.OS !== 'web';

/** true quando a pessoa pediu menos animação nas configurações do aparelho. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Aparece subindo um pouco e ganhando opacidade. */
export function FadeIn({
  children,
  delay = 0,
  distance = 12,
  duration = 420,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : duration,
      delay: reduced ? 0 : delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, delay, duration, reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Escala para usar em onPressIn/onPressOut: o elemento "afunda" ao toque. */
export function usePressScale(to = 0.97) {
  const [scale] = useState(() => new Animated.Value(1));
  const animate = (value: number) =>
    Animated.spring(scale, { toValue: value, useNativeDriver: native, speed: 40, bounciness: 6 }).start();
  return {
    style: { transform: [{ scale }] },
    onPressIn: () => animate(to),
    onPressOut: () => animate(1),
  };
}

/** Valor que vai e volta entre 0 e 1 sem parar (brilhos e destaques). */
export function useLoop(duration = 2600) {
  const [value] = useState(() => new Animated.Value(0));
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(value, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration, reduced]);
  return value;
}
