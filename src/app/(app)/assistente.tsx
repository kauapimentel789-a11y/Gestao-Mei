// Assistente de IA de Minhas finanças: perguntas sobre gastos, contas e metas,
// e lançamentos sugeridos para salvar com um toque. A conversa fica só na
// tela; quem responde é a Edge Function `assistente`.
import { Send, Sparkles } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { AssistantError, useAskAssistant } from '@/features/assistant/api';
import { type ChatMessage, MAX_TEXT, remainingLabel, STARTERS } from '@/features/assistant/logic';
import { ProposalCard } from '@/features/assistant/ProposalCard';
import { useSpace } from '@/features/organizations/useOrg';
import { newId } from '@/lib/ids';
import { colors, fonts, minTouch, radius, spacing } from '@/theme/tokens';

export default function AssistantScreen() {
  const { orgId } = useSpace();
  const ask = useAskAssistant(orgId);
  const scroll = useRef<ScrollViewInstance>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const send = async (value: string) => {
    const question = value.trim();
    if (!question || ask.isPending) return;
    const next = [...messages, { id: newId(), role: 'user' as const, text: question }];
    setMessages(next);
    setText('');
    setError(null);
    try {
      const answer = await ask.mutateAsync(next);
      setMessages((list) => [...list, { id: newId(), role: 'assistant', text: answer.reply, proposals: answer.proposals }]);
      setNote(remainingLabel(answer.remaining));
    } catch (e) {
      // A pergunta sem resposta sai da conversa e volta para a caixa de texto.
      setMessages(messages);
      setText(question);
      setError(e instanceof AssistantError ? e.message : 'Não foi possível responder agora.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.bar}>
          <DetailBar title="Assistente" />
        </View>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={styles.intro}>
              <View style={styles.badge}>
                <Sparkles size={26} color={colors.primaryText} />
              </View>
              <Text style={styles.introTitle}>Pergunte sobre o seu dinheiro</Text>
              <Text style={styles.introText}>
                Eu vejo os seus gastos, contas, cartões, orçamento e metas. Também posso preparar um lançamento para você conferir e salvar.
              </Text>
              <View style={styles.starters}>
                {STARTERS.map((s) => (
                  <Pressable key={s} accessibilityRole="button" onPress={() => send(s)} style={({ pressed }) => [styles.starter, pressed && styles.pressed]}>
                    <Text style={styles.starterText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fine}>A IA pode errar. Confira os números antes de decidir. Até 30 perguntas por dia.</Text>
            </View>
          ) : null}

          {messages.map((m) =>
            m.role === 'user' ? (
              <View key={m.id} style={[styles.bubble, styles.mine]}>
                <Text style={[styles.bubbleText, styles.mineText]}>{m.text}</Text>
              </View>
            ) : (
              <View key={m.id} style={styles.answer}>
                {m.text ? (
                  <View style={[styles.bubble, styles.theirs]}>
                    <Text style={styles.bubbleText}>{m.text}</Text>
                  </View>
                ) : null}
                {(m.proposals ?? []).map((p, i) => (
                  <ProposalCard key={`${m.id}-${i}`} orgId={orgId} proposal={p} />
                ))}
              </View>
            ),
          )}

          {ask.isPending ? (
            <View style={[styles.bubble, styles.theirs, styles.thinking]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.thinkingText}>Pensando…</Text>
            </View>
          ) : null}
          <FormError message={error} />
          {note ? <Text style={styles.fine}>{note}</Text> : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Escreva sua pergunta"
            placeholderTextColor={colors.gray500}
            style={styles.input}
            multiline
            maxLength={MAX_TEXT}
            accessibilityLabel="Pergunta para o assistente"
            onSubmitEditing={() => send(text)}
            submitBehavior="submit"
            returnKeyType="send"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            disabled={!text.trim() || ask.isPending}
            onPress={() => send(text)}
            style={[styles.sendBtn, (!text.trim() || ask.isPending) && styles.disabled]}
          >
            <Send size={20} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  bar: { paddingHorizontal: spacing.screen, paddingTop: spacing.screen },
  content: { padding: spacing.screen, gap: 12, paddingBottom: 24 },
  intro: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink, textAlign: 'center' },
  introText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.gray600, textAlign: 'center' },
  starters: { alignSelf: 'stretch', gap: 8, marginTop: 6 },
  starter: { backgroundColor: colors.surface, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 16, minHeight: minTouch },
  starterText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  pressed: { opacity: 0.7 },
  fine: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.gray500, textAlign: 'center' },
  bubble: { maxWidth: '88%', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  answer: { gap: 8 },
  bubbleText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: colors.ink },
  mineText: { color: colors.white },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray500 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: spacing.screen,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: minTouch,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  sendBtn: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
