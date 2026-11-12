import { describe, it, expect } from 'vitest'
import { buildThread, countThread, isVisibleToClient } from './thread-utils'
import type { EventComment } from '@/types/domain'

function c(partial: Partial<EventComment> & Pick<EventComment, 'id' | 'eventId'>): EventComment {
  return {
    tenantId: 'tn-andino',
    operationId: 'op-1',
    parentCommentId: null,
    authorId: 'us-ana',
    authorName: 'Ana',
    authorSide: 'client',
    body: 'mensaje',
    createdAt: '2026-11-01T10:00:00Z',
    visibility: 'client',
    ...partial,
  }
}

describe('buildThread', () => {
  it('anida respuestas por parentCommentId', () => {
    const comments = [
      c({ id: 'a', eventId: 'ev-1', createdAt: '2026-11-01T10:00:00Z' }),
      c({ id: 'b', eventId: 'ev-1', parentCommentId: 'a', createdAt: '2026-11-01T11:00:00Z' }),
      c({ id: 'd', eventId: 'ev-1', parentCommentId: 'b', createdAt: '2026-11-01T12:00:00Z' }),
    ]
    const tree = buildThread(comments, 'ev-1')
    expect(tree).toHaveLength(1)
    expect(tree[0]?.comment.id).toBe('a')
    expect(tree[0]?.children[0]?.comment.id).toBe('b')
    expect(tree[0]?.children[0]?.children[0]?.comment.id).toBe('d')
    expect(tree[0]?.children[0]?.children[0]?.depth).toBe(2)
  })

  it('no mezcla comentarios de eventos distintos', () => {
    const comments = [
      c({ id: 'a', eventId: 'ev-1' }),
      c({ id: 'x', eventId: 'ev-2' }),
    ]
    const tree = buildThread(comments, 'ev-1')
    expect(countThread(tree)).toBe(1)
    expect(tree[0]?.comment.id).toBe('a')
  })

  it('una respuesta cuyo padre pertenece a otro evento se trata como raíz y no se pierde', () => {
    const comments = [
      c({ id: 'otro', eventId: 'ev-2' }),
      c({ id: 'huerfana', eventId: 'ev-1', parentCommentId: 'otro' }),
    ]
    const tree = buildThread(comments, 'ev-1')
    expect(countThread(tree)).toBe(1)
    expect(tree[0]?.comment.id).toBe('huerfana')
  })

  it('ordena cronológicamente cada nivel', () => {
    const comments = [
      c({ id: 'r2', eventId: 'ev-1', createdAt: '2026-11-02T00:00:00Z' }),
      c({ id: 'r1', eventId: 'ev-1', createdAt: '2026-11-01T00:00:00Z' }),
    ]
    expect(buildThread(comments, 'ev-1').map((n) => n.comment.id)).toEqual(['r1', 'r2'])
  })

  it('cuenta respuestas además de raíces', () => {
    const comments = [
      c({ id: 'a', eventId: 'ev-1' }),
      c({ id: 'b', eventId: 'ev-1', parentCommentId: 'a' }),
      c({ id: 'c', eventId: 'ev-1', parentCommentId: 'a' }),
    ]
    expect(countThread(buildThread(comments, 'ev-1'))).toBe(3)
  })
})

describe('visibilidad', () => {
  it('los comentarios internos no son visibles para el cliente', () => {
    expect(isVisibleToClient('internal')).toBe(false)
    expect(isVisibleToClient('client')).toBe(true)
  })
})
