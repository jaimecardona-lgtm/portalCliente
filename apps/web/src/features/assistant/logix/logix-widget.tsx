/**
 * Widget Logix del Portal Cliente (portado de AgentWidget.tsx de quick-build-phase).
 *
 * Se conserva: mascota, lanzador, panel azul noche, saludo y despedida, voz de salida con silencio, dictado
 * cuando el navegador lo permite, estados de escritura/respuesta/error y textos originales.
 * Se omiten a propósito: pestaña de cálculo de ROI y oferta de asesor por WhatsApp (son de la web comercial).
 *
 * Reglas:
 * - Solo existe con sesión real de Supabase. En presentación local no hay backend y no se simulan respuestas.
 * - El historial vive en el componente. El padre lo reinicia con `key` cuando cambia la empresa activa.
 * - Cada respuesta muestra su origen (dato, IA, no disponible o fallo del proveedor).
 */
import { useContext, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react'
import { SupabasePortalContext } from '@/services/auth/supabase-runtime'
import { PortalApiError } from '@/services/api/http-client'
import { answerKindLabel, type LogixAnswerKind } from './logix-api'
import { listen, speak, speechRecognitionCtor, stopSpeaking } from './speech'
import './logix-widget.css'

const AVATAR = '/logix-avatar-referencia.png'
const MAX_MESSAGE = 800

/** Textos del widget original (es). */
const T = {
  open: 'Preguntar a Logix Web',
  greeting: '¡Hola! Te saluda Logix. ¿Cómo puedo ayudarte?',
  farewell: 'Espero haberte ayudado. ¡Que Dios te bendiga!',
  title: 'Logix Web',
  close: 'Cerrar',
  intro: 'Soy Logix. Puedo consultar las operaciones de la empresa activa y responder preguntas generales de logística.',
  suggestions: 'Preguntas sugeridas',
  placeholder: 'Escribe tu pregunta',
  send: 'Enviar',
  thinking: 'Consultando…',
  voiceOn: 'Activar voz',
  voiceOff: 'Silenciar voz',
  micOn: 'Dictar pregunta',
  micOff: 'Detener dictado',
  micUnsupported: 'Dictado no disponible en este navegador. Escriba su pregunta.',
  micDenied: 'No se pudo usar el micrófono. Escriba su pregunta.',
  noTenant: 'Seleccione una empresa autorizada para consultar sus operaciones.',
  errGeneric: 'No pudimos responder. Inténtelo de nuevo.',
  errSession: 'Su sesión caducó. Inicie sesión de nuevo.',
  errRate: 'Ha alcanzado el límite de consultas. Inténtelo más tarde.',
  suggestionList: [
    '¿Cuántas operaciones tengo?',
    '¿Qué estado tiene mi operación más reciente?',
    '¿Qué es un incoterm FOB?',
  ],
} as const

interface Turn {
  role: 'user' | 'assistant' | 'greeting' | 'error'
  text: string
  kind?: LogixAnswerKind
  sources?: string[]
  tenant?: string | null
}

const SUGGESTIONS = T.suggestionList

function errorText(error: unknown): string {
  if (error instanceof PortalApiError) {
    if (error.code === 'authentication_required' || error.code === 'invalid_token') return T.errSession
    if (error.status === 429 || error.code === 'rate_limited') return T.errRate
  }
  return T.errGeneric
}

/** Lanzador y panel. Requiere `enabled` (sesión real) y la empresa activa para las consultas privadas. */
export function LogixWidget({ tenantId }: { tenantId: string | null }) {
  const portal = useContext(SupabasePortalContext)
  const api = portal?.logix ?? null
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [voiceOn, setVoiceOn] = useState(true)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [micNote, setMicNote] = useState<string | null>(null)
  const greetedRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const dictation = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [turns, busy])

  // Al desmontar (cambio de empresa o cierre de sesión) se detienen voz y dictado.
  useEffect(() => {
    return () => {
      dictation.current?.stop()
      stopSpeaking()
    }
  }, [])

  if (api === null) return null

  const say = (text: string) => {
    if (voiceOn) speak(text)
  }

  const toggleOpen = () => {
    if (open) {
      setOpen(false)
      stopSpeaking()
      return
    }
    setOpen(true)
    if (!greetedRef.current) {
      greetedRef.current = true
      setTurns((prev) => [...prev, { role: 'greeting', text: T.greeting }])
    }
    say(T.greeting)
  }

  const closeWithFarewell = () => {
    setOpen(false)
    launcherRef.current?.focus()
    say(T.farewell)
  }

  const closeSilently = () => {
    setOpen(false)
    stopSpeaking()
    launcherRef.current?.focus()
  }

  const ask = async (question: string) => {
    const message = question.trim().slice(0, MAX_MESSAGE)
    if (!message || busy) return
    setTurns((prev) => [...prev, { role: 'user', text: message }])
    setDraft('')
    setBusy(true)
    try {
      const reply = await api.ask(message, tenantId)
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', text: reply.answer, kind: reply.answerKind, sources: reply.sources, tenant: reply.tenant },
      ])
      say(reply.answer)
    } catch (error) {
      setTurns((prev) => [...prev, { role: 'error', text: errorText(error) }])
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    inputRef.current?.focus()
    void ask(draft)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) closeSilently()
  }

  const toggleDictation = () => {
    if (listening) {
      dictation.current?.stop()
      setListening(false)
      return
    }
    if (speechRecognitionCtor() === null) {
      setMicNote(T.micUnsupported)
      return
    }
    setMicNote(null)
    const handle = listen(
      (text) => {
        setDraft(text)
        setListening(false)
        inputRef.current?.focus()
      },
      () => {
        setListening(false)
        setMicNote(T.micDenied)
      },
    )
    if (handle === null) {
      setMicNote(T.micUnsupported)
      return
    }
    dictation.current = handle
    setListening(true)
  }

  return (
    <div className="aw-root" onKeyDown={onKeyDown}>
      {open ? (
        <section id="aw-panel" className="aw-panel" role="dialog" aria-label={T.title} aria-modal="false">
          <header className="aw-head">
            <img className="aw-avatar" src={AVATAR} alt="" width={40} height={40} />
            <div className="aw-title">
              <strong>{T.title}</strong>
              <span className="aw-mode">{tenantId ? 'Empresa activa seleccionada' : 'Sin empresa seleccionada'}</span>
            </div>
            <button
              type="button"
              className="aw-icon focus-ring"
              aria-pressed={voiceOn}
              aria-label={voiceOn ? T.voiceOff : T.voiceOn}
              onClick={() => {
                if (voiceOn) stopSpeaking()
                setVoiceOn((v) => !v)
              }}
            >
              {voiceOn ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button type="button" className="aw-icon focus-ring" onClick={closeWithFarewell} aria-label={T.close}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div ref={listRef} className="aw-list" role="log" aria-live="polite">
            <p className="aw-intro">{T.intro}</p>
            {turns.length === 0 ? (
              <ul className="aw-suggest" aria-label={T.suggestions}>
                {SUGGESTIONS.map((q) => (
                  <li key={q}>
                    <button type="button" className="aw-chip focus-ring" onClick={() => void ask(q)} disabled={busy}>
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {turns.map((turn, i) =>
              turn.role === 'user' ? (
                <p key={i} className="aw-bubble aw-user">{turn.text}</p>
              ) : turn.role === 'greeting' ? (
                <div key={i} className="aw-bubble aw-bot"><p>{turn.text}</p></div>
              ) : turn.role === 'error' ? (
                <p key={i} className="aw-bubble aw-error" role="alert">{turn.text}</p>
              ) : (
                <div key={i} className="aw-bubble aw-bot">
                  <p>{turn.text}</p>
                  {turn.kind ? <small className="aw-note">{answerKindLabel(turn.kind)}</small> : null}
                  {turn.sources && turn.sources.length > 0 ? (
                    <div className="aw-sources">
                      <span>Registros consultados</span>
                      <ul>
                        {[...new Set(turn.sources)].map((id) => (
                          <li key={id}>{id}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ),
            )}
            {busy ? <p className="aw-bubble aw-bot aw-thinking">{T.thinking}</p> : null}
          </div>

          {micNote ? <p className="aw-note aw-mic-note" role="status">{micNote}</p> : null}

          <form className="aw-form" onSubmit={onSubmit}>
            <label className="aw-sr" htmlFor="aw-input">{T.placeholder}</label>
            <input
              ref={inputRef}
              id="aw-input"
              className="aw-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_MESSAGE}
              placeholder={T.placeholder}
              autoComplete="off"
            />
            <button
              type="button"
              className="aw-icon focus-ring"
              aria-pressed={listening}
              aria-label={listening ? T.micOff : T.micOn}
              onClick={toggleDictation}
            >
              {listening ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button type="submit" className="aw-send focus-ring" disabled={busy || !draft.trim()}>
              <Send className="h-4 w-4" aria-hidden="true" />
              <span className="aw-sr">{T.send}</span>
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        ref={launcherRef}
        className="aw-launcher focus-ring"
        aria-label={T.open}
        aria-expanded={open}
        aria-controls="aw-panel"
        onClick={toggleOpen}
      >
        <img src={AVATAR} alt="" width={96} height={96} />
      </button>
    </div>
  )
}
