/**
 * Cierre de sesión compartido por el menú de perfil y la página de perfil.
 *
 * Orden de operaciones (importante): primero se navega a /login, después se borra la sesión del contexto y,
 * en desarrollo, se pide al servidor que invalide la cookie. Invertir el orden provocó redirecciones
 * residuales y bloqueos en pruebas; ver docs/validation.md (fase 04).
 */
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
