// Web Speech API tanıma arayüzü — TypeScript'in DOM tiplerinde yok.
// Yalnızca uygulamanın kullandığı kadarı tanımlı.

interface TanimaSonucu {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

interface TanimaOlayi {
  readonly results: ArrayLike<TanimaSonucu>;
}

interface TanimaHatasi {
  readonly error: string;
}

interface Taniyici {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((olay: TanimaOlayi) => void) | null;
  onerror: ((olay: TanimaHatasi) => void) | null;
  onend: (() => void) | null;
  onsoundstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface Window {
  SpeechRecognition?: new () => Taniyici;
  webkitSpeechRecognition?: new () => Taniyici;
  webkitAudioContext?: typeof AudioContext;
}
