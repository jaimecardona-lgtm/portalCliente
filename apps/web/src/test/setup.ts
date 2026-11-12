import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  try {
    window.sessionStorage.clear()
    window.localStorage.clear()
  } catch {
    /* entorno sin almacenamiento */
  }
})

// jsdom no implementa scrollTo en elementos; el portal lo usa para el chat de Logix.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {}
}
