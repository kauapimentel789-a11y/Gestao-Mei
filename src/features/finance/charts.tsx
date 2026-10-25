// Gráficos do painel do Financeiro, desenhados com react-native-svg.
// Cada um mede a largura disponível e não faz contas de negócio: recebe os
// pontos prontos (ver dashboard.ts).
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors, fonts } from '@/theme/tokens';

import { type ChartPoint, formatCompactCents, type Slice } from './dashboard';

export const SLICE_COLORS = [colors.primary, colors.primarySoft, colors.primaryText, '#FFD9BD', colors.gray300];

function useWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  return { width, onLayout };
}

/** Teto "redondo" para o eixo: 1, 2, 2,5 ou 5 vezes uma potência de 10. */
function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

const AXIS_W = 52;

/** Barras por mês; toque numa barra para ver o valor. A última (mês do período) começa destacada. */
export function BarChart({ data, height = 170 }: { data: ChartPoint[]; height?: number }) {
  const { width, onLayout } = useWidth();
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? data.length - 1;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotW = Math.max(0, width - AXIS_W);
  const plotH = height - 24;
  const slot = data.length > 0 ? plotW / data.length : 0;
  const barW = Math.min(28, slot * 0.55);
  const ticks = [0, 0.5, 1];
  const point = data[active];
  const barTop = point ? plotH - (point.value / max) * plotH : 0;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <Line key={t} x1={AXIS_W} x2={width} y1={plotH - t * plotH} y2={plotH - t * plotH} stroke={colors.gray150} strokeWidth={1} />
            ))}
            {data.map((d, i) => {
              const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * plotH);
              return (
                <Rect
                  key={d.key}
                  x={AXIS_W + i * slot + (slot - barW) / 2}
                  y={plotH - h}
                  width={barW}
                  height={h}
                  rx={6}
                  fill={i === active ? colors.primary : colors.primarySoft}
                  opacity={i === active ? 1 : 0.55}
                />
              );
            })}
          </Svg>
          {ticks.map((t) => (
            <Text key={t} style={[styles.axis, { top: plotH - t * plotH - 8 }]}>
              {formatCompactCents(Math.round(max * t))}
            </Text>
          ))}
          <View style={[styles.labels, { left: AXIS_W, top: plotH + 6 }]}>
            {data.map((d, i) => (
              <Text key={d.key} style={[styles.label, { width: slot }, i === active && styles.labelActive]}>
                {d.label}
              </Text>
            ))}
          </View>
          {/* Áreas de toque por mês, por cima do desenho. */}
          <View style={[styles.touchRow, { left: AXIS_W, height: plotH }]}>
            {data.map((d, i) => (
              <Pressable
                key={d.key}
                accessibilityRole="button"
                accessibilityLabel={`${d.label}: ${formatCompactCents(d.value)}`}
                onPress={() => setSelected(i)}
                style={{ width: slot, height: plotH }}
              />
            ))}
          </View>
          {point ? (
            <View
              pointerEvents="none"
              style={[
                styles.tooltip,
                { top: Math.max(0, barTop - 34), left: Math.min(Math.max(AXIS_W, AXIS_W + active * slot + slot / 2 - 45), width - 90) },
              ]}
            >
              <Text style={styles.tooltipText}>{formatCompactCents(point.value)}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Linha com área por mês; aceita valores negativos (linha do zero tracejada). */
export function AreaChart({ data, height = 150 }: { data: ChartPoint[]; height?: number }) {
  const { width, onLayout } = useWidth();
  const values = data.map((d) => d.value);
  const hi = Math.max(...values, 0);
  const lo = Math.min(...values, 0);
  const span = hi - lo || 1;
  const padTop = 30;
  const plotH = height - padTop - 22;
  const plotW = Math.max(0, width - 16);
  const x = (i: number) => 8 + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => padTop + ((hi - v) / span) * plotH;
  const zeroY = y(0);
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = data.length > 0 ? `${line} L${x(data.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z` : '';
  const last = data[data.length - 1];
  const lastX = x(data.length - 1);
  const lastY = last ? y(last.value) : 0;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && data.length > 0 ? (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.primary} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            <Line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke={colors.gray300} strokeWidth={1} strokeDasharray="4 4" />
            <Path d={area} fill="url(#cashFill)" />
            <Path d={line} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <G>
              <Circle cx={lastX} cy={lastY} r={7} fill={colors.primary} opacity={0.25} />
              <Circle cx={lastX} cy={lastY} r={4} fill={colors.primary} stroke={colors.white} strokeWidth={1.5} />
            </G>
          </Svg>
          {last ? (
            <View pointerEvents="none" style={[styles.tooltip, { top: Math.max(0, lastY - 32), left: Math.max(0, Math.min(lastX - 45, width - 90)) }]}>
              <Text style={styles.tooltipText}>{formatCompactCents(last.value)}</Text>
            </View>
          ) : null}
          <View style={[styles.labels, { left: 0, top: height - 18, width }]}>
            {data.map((d) => (
              <Text key={d.key} style={[styles.label, { width: width / data.length }]}>
                {d.label}
              </Text>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Rosca das despesas com o total no meio. */
export function Donut({ slices, centerLabel, centerValue, size = 150 }: { slices: Slice[]; centerLabel: string; centerValue: string; size?: number }) {
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 3 : 0;
  // Início de cada fatia: soma das anteriores.
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((sum, x) => sum + (x.pct / 100) * c, 0));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.gray100} strokeWidth={stroke} fill="none" />
          {slices.map((s, i) => {
            const len = (s.pct / 100) * c;
            const dash = Math.max(0, len - gap);
            const el = (
              <Circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-starts[i]!}
              />
            );
            return el;
          })}
        </G>
      </Svg>
      <View style={styles.donutCenter} pointerEvents="none">
        <Text style={styles.donutValue} numberOfLines={1} adjustsFontSizeToFit>
          {centerValue}
        </Text>
        <Text style={styles.donutLabel}>{centerLabel}</Text>
      </View>
    </View>
  );
}

/** Linha pequena, sem eixos, para os cartões. */
export function Sparkline({ values, color = colors.primary, height = 36 }: { values: number[]; color?: string; height?: number }) {
  const { width, onLayout } = useWidth();
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const span = hi - lo || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(3 + ((hi - v) / span) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && values.length > 1 ? (
        <Svg width={width} height={height}>
          <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { position: 'absolute', left: 0, width: AXIS_W - 6, textAlign: 'right', fontFamily: fonts.medium, fontSize: 10, color: colors.gray400 },
  labels: { position: 'absolute', flexDirection: 'row' },
  label: { textAlign: 'center', fontFamily: fonts.semibold, fontSize: 11, color: colors.gray500 },
  labelActive: { color: colors.ink, fontFamily: fonts.extrabold },
  touchRow: { position: 'absolute', top: 0, flexDirection: 'row' },
  tooltip: { position: 'absolute', width: 90, alignItems: 'center' },
  tooltipText: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    color: colors.white,
    backgroundColor: colors.ink,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  donutCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  donutValue: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  donutLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray500 },
});
