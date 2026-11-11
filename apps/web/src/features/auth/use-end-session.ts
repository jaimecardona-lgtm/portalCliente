import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useSession } from './session-context'
import { loadLocalAuthApi } from './auth-gateway'

/**
 * Cierre de sesión: primero se sale de la shell autenticada, después se borra la sesión del navegador
 * y, en desarrollo, la cookie del servidor local. Ver CLAUDE.md (no redirigir durante el render).
 */
export function useEndSession() {
  const navigate = useNavigate()
  const { signOut } = useSession()
  return useCallback(() => {
    void navigate({ to: '/login' })
    signOut()
    void loadLocalAuthApi().then((api) => api?.logoutAccount())
  }, [navigate, signOut])
}
