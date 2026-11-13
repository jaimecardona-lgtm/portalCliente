/**
 * Voz de Logix con la API del navegador. Sin dependencias ni servicios externos.
 * - Síntesis: lee respuestas, saludo y despedida. Elige una voz en español si existe.
 * - Dictado: solo si el navegador lo soporta y el usuario concede el micrófono. Si no, el chat sigue por texto.
 */
type RecognitionCtor = new () => SpeechRecognitionLike

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

export function speechSynthesisAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function speechRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Voz en español preferida (acento latinoamericano y voces naturales primero). */
export function pickSpanishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const candidates = voices.filter((v) => v.lang.toLowerCase().startsWith('es'))
  const rank = (v: SpeechSynthesisVoice) =>
    (/es-(419|CO|MX|US)/i.test(v.lang) ? 4 : 0) + (/natural|neural|online/i.test(v.name) ? 3 : 0)
  return [...candidates].sort((a, b) => rank(b) - rank(a))[0]
}

export function stopSpeaking(): void {
  if (speechSynthesisAvailable()) window.speechSynthesis.cancel()
}

export function speak(text: string): void {
  if (!speechSynthesisAvailable()) return
  stopSpeaking()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'es-CO'
  const voice = pickSpanishVoice(window.speechSynthesis.getVoices())
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
}

/** Dictado en español. Devuelve un controlador para detenerlo, o null si el navegador no lo soporta. */
export function listen(onText: (text: string) => void, onError: (code: string) => void): { stop: () => void } | null {
  const Ctor = speechRecognitionCtor()
  if (!Ctor) return null
  const recognition = new Ctor()
  recognition.lang = 'es-CO'
  recognition.interimResults = false
  recognition.maxAlternatives = 1
  recognition.onresult = (event) => {
    const transcript = event.results[0]?.[0]?.transcript ?? ''
    if (transcript.trim()) onText(transcript.trim())
  }
  recognition.onerror = (event) => onError(event.error)
  recognition.start()
  return { stop: () => recognition.stop() }
}
