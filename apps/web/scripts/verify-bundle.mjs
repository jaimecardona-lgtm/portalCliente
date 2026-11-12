// Verifica que el build de producción no contiene datos sintéticos ni rastros de autenticación local.
// Uso: node scripts/verify-bundle.mjs (después de `vite build`)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const DIST = join(process.cwd(), 'dist')

// Cadenas que solo existen en fixtures, autenticación local o interfaz de desarrollo.
const FORBIDDEN = [
  // Patrón de contraseña de demostración (ya no existe en el código): cualquier aparición es un error.
  /Demo-\d{4}/,
  'textilesandinos.example',
  'agroexport-pacifico.example',
  'Textiles Andinos',
  'Agroexport Pacífico',
  'tn-andino',
  'tn-pacifico',
  'DO-26-0398',
  'Cuentas de demostración',
  'Rellenar',
  'Contraseña DEMO',
  'Modo DEMO',
  'MODO DEMO',
  'Datos sintéticos',
  'datos sintéticos',
  'Entorno local',
  'Cambiar empresa',
  'Sesión DEMO',
  'Cerrar sesión DEMO',
  'authenticateDemo',
  '/__local-auth',
  'reviewer.config',
  'passwordHash',
  'users.json',
  'reset-tokens',
  'outbox.json',
  'local/auth',
  'logixtic.portal.demo-session',
  // Motor de respuestas predefinidas de Logix (solo desarrollo): ninguna frase suya puede llegar a producción.
  'operaciones activas tengo',
]

function collect(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return collect(full)
    return ['.js', '.html', '.css', '.json'].includes(extname(name)) ? [full] : []
  })
}

let files
try {
  files = collect(DIST)
} catch {
  console.error('No existe dist/. Ejecuta primero el build de producción.')
  process.exit(1)
}

const hits = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const needle of FORBIDDEN) {
    const found = needle instanceof RegExp ? needle.test(text) : text.includes(needle)
    if (found) hits.push(`${file}: contiene "${needle}"`)
  }
}

if (hits.length > 0) {
  console.error('El bundle de producción contiene cadenas prohibidas:')
  for (const h of hits) console.error(`  - ${h}`)
  process.exit(1)
}

console.log(`Bundle verificado: ${files.length} archivos, sin datos sintéticos ni autenticación local.`)
