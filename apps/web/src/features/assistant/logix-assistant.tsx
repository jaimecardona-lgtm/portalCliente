import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Bot, FlaskConical, Send, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useRepository } from '@/services/repositories'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { cn } from '@/lib/format'
import { LogoMark } from '@/components/brand/logo'
import { answerLogixQuestion, SUGGESTED_QUESTIONS, type LogixAnswer } from './logix-engine'

interface Message {
  id: number
  from: 'user' | 'logix' | 'system'
  text: string
  operationIds?: string[]
  unavailable?: boolean
}

export function LogixAssistant() {
  const { session, tenant } = useSession()
  const repo = useRepository()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const counter = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const tenantId = session?.tenantId ?? ''

  const opMatch = /^\/operaciones\/([^/]+)/.exec(location.pathname)
  const contextOperationId = opMatch?.[1] ? decodeURIComponent(opMatch[1]) : undefined

  const ops = useQuery({ queryKey: tenantKey(tenantId, 'operations'), queryFn: () => repo.listOperations(tenantId), enabled: Boolean(tenantId), staleTime: 60_000 })
  const docs = useQuery({ queryKey: tenantKey(tenantId, 'documents'), queryFn: () => repo.listDocuments(tenantId), enabled: Boolean(tenantId), staleTime: 60_000 })
  const quotes = useQuery({ queryKey: tenantKey(tenantId, 'quotes'), queryFn: () => repo.listQuotes(tenantId), enabled: Boolean(tenantId), staleTime: 60_000 })

  const ready = Boolean(ops.data && docs.data && quotes.data)
  const contextOp = ops.data?.find((o) => o.id === contextOperationId)

  // Mensaje de bienvenida contextual cada vez que cambia la empresa o el contexto.
  const welcome = useMemo<string>(() => {
    const name = tenant?.shortName ?? 'su empresa'
    if (contextOp) return `Estoy viendo ${contextOp.doNumber}. Puedo explicarle su estado, ETA y pendientes.`
    return `Hola, soy Logix. Puedo responder sobre operaciones, documentos y cotizaciones de ${name}.`
  }, [tenant?.shortName, contextOp])

  useEffect(() => {
    if (open && messages.length === 0) {
      counter.current += 1
      setMessages([{ id: counter.current, from: 'logix', text: welcome }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, welcome])

  // Al cambiar de empresa, limpiar la conversación para no mezclar contextos.
  useEffect(() => {
    setMessages([])
  }, [tenantId])

  // Foco al campo de pregunta al abrir o expandir el panel.
  useEffect(() => {
    if (open && !minimized) inputRef.current?.focus()
  }, [open, minimized])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, minimized])

  if (!session) return null

  const ask = (question: string) => {
    const q = question.trim()
    if (!q) return
    counter.current += 1
    const userMsg: Message = { id: counter.current, from: 'user', text: q }
    setMessages((m) => [...m, userMsg])
    setInput('')
    if (!ready) {
      counter.current += 1
      setMessages((m) => [...m, { id: counter.current, from: 'system', text: 'Todavía estoy cargando los datos de su empresa. Intente de nuevo en un momento.' }])
      return
    }
    const answer: LogixAnswer = answerLogixQuestion(
      q,
      { operations: ops.data ?? [], documents: docs.data ?? [], quotes: quotes.data ?? [] },
      contextOperationId,
    )
    counter.current += 1
    setMessages((m) => [
      ...m,
      { id: counter.current, from: 'logix', text: answer.text, operationIds: answer.operationIds, unavailable: answer.unavailable },
    ])
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir asistente Logix (modo DEMO)"
          className="fixed right-3 bottom-3 z-40 flex h-12 items-center gap-2 rounded-full bg-midnight pr-3 pl-2 sm:right-6 sm:bottom-6 sm:pr-4 text-white shadow-pop ring-1 ring-white/10 transition-transform duration-200 hover:-translate-y-0.5"
        >
          <span className="grid size-8 place-items-center rounded-full bg-white/10">
            <LogoMark className="size-5" />
          </span>
          <span className="hidden text-sm font-semibold sm:inline">Logix</span>
          <span className="hidden rounded-full bg-warning px-1.5 py-px text-[9px] font-bold tracking-wide text-midnight uppercase sm:inline">DEMO</span>
        </button>
      )}

      {open && (
        <section
          aria-label="Asistente Logix"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
          }}
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-slide-up',
            'inset-x-3 bottom-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]',
            minimized ? 'h-14' : 'h-[min(560px,calc(100dvh-6rem))]',
          )}
        >
          <header className="flex items-center gap-3 bg-midnight px-4 py-3 text-white">
            <span className="grid size-9 place-items-center rounded-full bg-white/10">
              <Bot className="size-5 text-cyan" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Logix</p>
              <p className="flex items-center gap-1 text-[11px] text-white/60">
                <FlaskConical className="size-3" aria-hidden /> Modo DEMO · datos sintéticos
              </p>
            </div>
            <button type="button" onClick={() => setMinimized((m) => !m)} aria-label={minimized ? 'Expandir Logix' : 'Minimizar Logix'} className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
              {minimized ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar Logix" className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
              <X className="size-4" />
            </button>
          </header>

          {!minimized && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-canvas px-4 py-4" aria-live="polite">
                {contextOp && (
                  <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-600">
                    Contexto: <Link to="/operaciones/$operationId" params={{ operationId: contextOp.id }} className="font-semibold underline-offset-2 hover:underline">{contextOp.doNumber}</Link>
                  </p>
                )}
                {messages.map((m) => (
                  <Bubble key={m.id} message={m} />
                ))}
                {messages.length <= 1 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {SUGGESTED_QUESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-left text-xs font-medium text-ink-soft transition-colors duration-200 hover:border-blue hover:text-blue">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <form
                className="flex items-center gap-2 border-t border-line bg-surface p-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  ask(input)
                }}
              >
                <label htmlFor="logix-input" className="sr-only">Escriba su pregunta para Logix</label>
                <input
                  id="logix-input"
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Pregunte por una operación o documento"
                  maxLength={300}
                  className="h-10 flex-1 rounded-lg border border-line-strong px-3 text-sm focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15"
                />
                <button type="submit" aria-label="Enviar pregunta" disabled={!input.trim()} className="grid size-10 place-items-center rounded-lg bg-blue text-white transition-colors duration-200 hover:bg-blue-600 disabled:opacity-40">
                  <Send className="size-4" />
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </>
  )
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.from === 'user'
  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line',
          isUser && 'rounded-br-md bg-blue text-white',
          message.from === 'logix' && !message.unavailable && 'rounded-bl-md border border-line bg-surface text-ink',
          message.from === 'logix' && message.unavailable && 'rounded-bl-md border border-warning/40 bg-warning-50 text-warning-700',
          message.from === 'system' && 'rounded-bl-md bg-surface-muted text-ink-soft italic',
        )}
      >
        {message.text}
      </div>
      {message.operationIds && message.operationIds.length > 0 && (
        <OperationLinks ids={message.operationIds} />
      )}
    </div>
  )
}

function OperationLinks({ ids }: { ids: string[] }) {
  const { session } = useSession()
  const repo = useRepository()
  const tenantId = session?.tenantId ?? ''
  const ops = useQuery({ queryKey: tenantKey(tenantId, 'operations'), queryFn: () => repo.listOperations(tenantId), enabled: Boolean(tenantId), staleTime: 60_000 })
  const list = (ops.data ?? []).filter((o) => ids.includes(o.id)).slice(0, 6)
  if (list.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {list.map((o) => (
        <Link key={o.id} to="/operaciones/$operationId" params={{ operationId: o.id }} className="rounded-md bg-surface px-2 py-1 font-mono text-[11px] font-semibold text-blue ring-1 ring-line hover:ring-blue">
          {o.doNumber}
        </Link>
      ))}
    </div>
  )
}
