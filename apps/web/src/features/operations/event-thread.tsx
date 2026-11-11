/**
 * Conversación de un evento del timeline (hilo de comentarios anidados).
 *
 * Modelo: cada comentario pertenece a un evento (eventId) y puede responder a otro comentario del mismo
 * evento (parentCommentId). Los mensajes NO cambian el estado de la operación.
 * Responsabilidad: listar el hilo, publicar un mensaje raíz o una respuesta y mostrar autor, fecha y rol.
 * Contrato: solo se muestran comentarios con visibility = 'client'. Los internos se filtran en el cliente
 * y nunca deben llegar a un cliente desde el servidor.
 * Validación: entre 2 y 1000 caracteres. El servidor (FastAPI) deberá validar también el evento y la
 * pertenencia al tenant; el frontend no es una barrera de autorización.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CornerDownRight, MessageSquare, Send, User2, Headphones } from 'lucide-react'
import { useRepository } from '@/services/repositories'
import { useSession, tenantKey } from '@/features/auth/session-context'
import { useToast } from '@/components/ui/toast'
import { Button, Skeleton } from '@/components/ui/primitives'
import { cn, formatDateTime } from '@/lib/format'
import type { EventComment, ID } from '@/types/domain'
import { buildThread, countThread, isVisibleToClient, type ThreadNode } from './thread-utils'

const MAX_BODY = 1000
const MAX_DEPTH_INDENT = 3

interface EventThreadProps {
  operationId: ID
  eventId: ID
  /** Título accesible del hilo, ej. "Evento: Llegada a puerto". */
  label: string
}

/**
 * Conversación propia de un evento. Soporta respuestas anidadas (parent_comment_id),
 * muestra autor, fecha y oculta comentarios internos.
 * Los mensajes NO cambian el estado de la operación.
 */
export function EventThread({ operationId, eventId, label }: EventThreadProps) {
  const repo = useRepository()
  const { session, user } = useSession()
  const tenantId = session?.tenantId ?? ''
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [replyTo, setReplyTo] = useState<ID | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const threadKey = tenantKey(tenantId, 'comments', operationId, eventId)

  const comments = useQuery({
    queryKey: threadKey,
    queryFn: () => repo.listEventComments(tenantId, operationId, eventId),
    enabled: Boolean(tenantId),
  })

  const post = useMutation({
    mutationFn: (input: { body: string; parentCommentId: ID | null }) =>
      repo.addEventComment(tenantId, {
        operationId,
        eventId,
        parentCommentId: input.parentCommentId,
        authorId: user?.id ?? 'unknown',
        authorName: user?.fullName ?? 'Usuario',
        authorSide: 'client',
        body: input.body,
        visibility: 'client',
      }),
    onSuccess: async () => {
      setDraft('')
      setReplyTo(null)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: threadKey })
      toast({ title: 'Comentario publicado', description: 'Su mensaje quedó vinculado a este evento.' })
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el comentario.')
    },
  })

  const submit = (parentCommentId: ID | null) => {
    const body = draft.trim()
    if (body.length < 2) {
      setError('Escriba al menos 2 caracteres.')
      return
    }
    if (body.length > MAX_BODY) {
      setError(`El comentario no puede superar ${MAX_BODY} caracteres.`)
      return
    }
    post.mutate({ body, parentCommentId })
  }

  const visible = (comments.data ?? []).filter((c) => isVisibleToClient(c.visibility))
  const tree = buildThread(visible, eventId)
  const total = countThread(tree)

  return (
    <section aria-label={`Conversación · ${label}`} className="mt-4 rounded-xl border border-line bg-canvas/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-soft uppercase">
          <MessageSquare className="size-3.5" aria-hidden /> Conversación del evento
        </p>
        <span className="text-xs text-ink-muted tabular">{total} {total === 1 ? 'mensaje' : 'mensajes'}</span>
      </div>

      {comments.isPending && (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-5/6" />
        </div>
      )}

      {comments.isError && <p role="alert" className="text-sm text-danger-700">No se pudo cargar la conversación.</p>}

      {comments.data && tree.length === 0 && (
        <p className="text-sm text-ink-muted">Aún no hay mensajes en este evento. Puede iniciar la conversación abajo.</p>
      )}

      {tree.length > 0 && (
        <ul className="flex flex-col gap-3">
          {tree.map((node) => (
            <ThreadItem key={node.comment.id} node={node} onReply={(id) => { setReplyTo(id); setError(null) }} replyTo={replyTo} />
          ))}
        </ul>
      )}

      {/* Formulario de respuesta o nuevo mensaje */}
      <div className="mt-4">
        {replyTo && (
          <p className="mb-2 flex items-center justify-between text-xs text-ink-soft">
            <span>Respondiendo a un mensaje de este evento</span>
            <button type="button" className="font-semibold text-blue hover:underline" onClick={() => setReplyTo(null)}>
              Cancelar respuesta
            </button>
          </p>
        )}
        <label htmlFor={`msg-${eventId}`} className="sr-only">
          {replyTo ? 'Escribir respuesta' : 'Escribir mensaje para este evento'}
        </label>
        <textarea
          id={`msg-${eventId}`}
          rows={2}
          value={draft}
          maxLength={MAX_BODY + 50}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError(null)
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `msg-${eventId}-error` : undefined}
          placeholder={replyTo ? 'Escriba su respuesta…' : 'Escriba un mensaje sobre este evento…'}
          className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15 aria-[invalid=true]:border-danger"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-muted tabular">{draft.length}/{MAX_BODY}</p>
          <div className="flex items-center gap-2">
            {error && <p id={`msg-${eventId}-error`} role="alert" className="text-xs text-danger-700">{error}</p>}
            <Button size="sm" loading={post.isPending} onClick={() => submit(replyTo)} disabled={!draft.trim()}>
              <Send className="size-3.5" aria-hidden /> {replyTo ? 'Responder' : 'Publicar'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function ThreadItem({ node, onReply, replyTo }: { node: ThreadNode; onReply: (id: ID) => void; replyTo: ID | null }) {
  const c = node.comment
  const isOperator = c.authorSide === 'operator'
  const indentLevel = Math.min(node.depth, MAX_DEPTH_INDENT)
  return (
    <li className={cn(indentLevel > 0 && 'border-l-2 border-line pl-3 sm:pl-4')} style={indentLevel > 0 ? { marginLeft: indentLevel * 8 } : undefined} data-comment-id={c.id} data-parent-id={c.parentCommentId ?? ''}>
      <Comment comment={c} isOperator={isOperator} />
      <div className="mt-1 flex items-center gap-3 pl-1">
        <button
          type="button"
          onClick={() => onReply(c.id)}
          aria-pressed={replyTo === c.id}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue hover:underline"
        >
          <CornerDownRight className="size-3" aria-hidden /> Responder
        </button>
      </div>
      {node.children.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {node.children.map((child) => (
            <ThreadItem key={child.comment.id} node={child} onReply={onReply} replyTo={replyTo} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Comment({ comment, isOperator }: { comment: EventComment; isOperator: boolean }) {
  return (
    <article className="rounded-lg bg-surface p-3 shadow-sm ring-1 ring-line">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span className={cn('grid size-6 place-items-center rounded-full', isOperator ? 'bg-cyan/20 text-navy' : 'bg-blue-50 text-blue')} aria-hidden>
          {isOperator ? <Headphones className="size-3.5" /> : <User2 className="size-3.5" />}
        </span>
        <span className="font-semibold text-ink">{comment.authorName}</span>
        <span className={cn('rounded px-1.5 py-px text-[10px] font-semibold uppercase', isOperator ? 'bg-cyan/15 text-navy' : 'bg-blue-50 text-blue')}>
          {isOperator ? 'Operador' : 'Cliente'}
        </span>
        <time dateTime={comment.createdAt} className="ml-auto text-ink-muted tabular">{formatDateTime(comment.createdAt)}</time>
      </header>
      <p className="mt-2 text-sm whitespace-pre-line text-ink-soft">{comment.body}</p>
    </article>
  )
}
