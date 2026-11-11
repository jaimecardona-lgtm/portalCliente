import type { EventComment, ID, Visibility } from '@/types/domain'

export interface ThreadNode {
  comment: EventComment
  children: ThreadNode[]
  /** Profundidad desde la raíz (0 = comentario raíz). Sirve para limitar la sangría visual. */
  depth: number
}

/**
 * Construye el árbol de respuestas a partir de `parentCommentId`.
 * - Solo incluye comentarios del evento indicado (un comentario nunca cruza eventos).
 * - Un padre inexistente o de otro evento convierte el comentario en raíz, sin perderlo.
 * - Orden cronológico ascendente en cada nivel.
 */
export function buildThread(comments: EventComment[], eventId: ID): ThreadNode[] {
  const own = comments.filter((c) => c.eventId === eventId)
  const byId = new Map(own.map((c) => [c.id, c]))
  const childrenOf = new Map<ID, EventComment[]>()
  const roots: EventComment[] = []

  for (const c of own) {
    const parentExists = c.parentCommentId !== null && byId.has(c.parentCommentId)
    if (parentExists && c.parentCommentId) {
      const list = childrenOf.get(c.parentCommentId) ?? []
      list.push(c)
      childrenOf.set(c.parentCommentId, list)
    } else {
      roots.push(c)
    }
  }

  const sortByDate = (a: EventComment, b: EventComment) => a.createdAt.localeCompare(b.createdAt)
  const build = (c: EventComment, depth: number): ThreadNode => ({
    comment: c,
    depth,
    children: (childrenOf.get(c.id) ?? []).sort(sortByDate).map((child) => build(child, depth + 1)),
  })

  return roots.sort(sortByDate).map((r) => build(r, 0))
}

/** Cuenta todos los comentarios del árbol, incluidas las respuestas. */
export function countThread(nodes: ThreadNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countThread(n.children), 0)
}

/**
 * Regla de visibilidad para el portal de clientes:
 * los comentarios internos nunca se muestran a clientes.
 */
export function isVisibleToClient(visibility: Visibility): boolean {
  return visibility === 'client'
}
