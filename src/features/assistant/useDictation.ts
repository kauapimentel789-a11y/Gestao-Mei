// Ditado por voz no assistente (só no site): usa o reconhecimento de fala do
// navegador (Web Speech API, em português). No app nativo e em navegadores
// sem suporte, `supported` é false e o botão não aparece; o microfone do
// teclado do celular continua valendo.
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Junta o texto reconhecido até agora (parcial e final). */
export function joinTranscript(results: ArrayLike<ArrayLike<{ transcript: string }>>): string {
  return Array.from(results, (r) => r[0]?.transcript ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const DICTATION_ERRORS: Record<string, string> = {
  'not-allowed': 'O navegador não deixou usar o microfone. Libere o microfone para este site nos ajustes.',
  'service-not-allowed': 'O navegador não deixou usar o microfone. Libere o microfone para este site nos ajustes.',
  'audio-capture': 'Não foi possível usar o microfone.',
  network: 'Sem conexão para reconhecer a fala.',
};

/**
 * `onText` recebe o texto falado somado ao que já estava escrito (`base`).
 * Silêncio ou "no-speech" só encerra, sem erro.
 */
export function useDictation(onText: (text: string) => void, onError: (message: string) => void) {
  const [supported] = useState(() => recognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const ref = useRef<Recognition | null>(null);

  useEffect(() => () => ref.current?.abort(), []);

  const start = (base: string) => {
    const Ctor = recognitionCtor();
    if (!Ctor || ref.current) return;
    const rec = new Ctor();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = false;
    const prefix = base.trim() ? `${base.trim()} ` : '';
    rec.onresult = (event) => onText(prefix + joinTranscript(event.results));
    rec.onerror = (event) => {
      const message = DICTATION_ERRORS[event.error];
      if (message) onError(message);
    };
    rec.onend = () => {
      ref.current = null;
      setListening(false);
    };
    ref.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      ref.current = null;
      setListening(false);
      onError('Não foi possível usar o microfone.');
    }
  };

  const stop = () => ref.current?.stop();

  return { supported, listening, start, stop };
}
