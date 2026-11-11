// Configura el usuario local de revisión del portal.
// Uso: npm run setup:local-user [-- --force]
//
// La contraseña se solicita sin mostrarla en pantalla y solo se guarda como hash scrypt con sal
// en apps/web/local/reviewer.config.json (ignorado por Git). No se escribe en código ni en variables VITE_*.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { hashPassword, validatePassword, writeReviewerConfig } from './lib/reviewer-credentials.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONFIG_PATH = join(ROOT, 'local', 'reviewer.config.json')

// Nombre y correo se piden en la terminal: no se guardan en el código versionado.
// El correo se usa tal cual se escribe; no se corrige automáticamente.
// Empresa sintética asignada inicialmente.
const TENANT_ID = 'tn-andino'

const force = process.argv.includes('--force')

/** Lector de entrada: interactivo en terminal; por tubería cuando no hay terminal (automatización). */
function createPrompter() {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let muted = false
    // Oculta lo que se escribe mientras `muted` esté activo (la contraseña no aparece en pantalla).
    rl._writeToOutput = (text) => {
      if (!muted) process.stdout.write(text)
    }
    return {
      ask: (question, fallback) =>
        new Promise((resolve) => {
          rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `, (answer) => resolve(answer.trim() || fallback || ''))
        }),
      askHidden: (question) =>
        new Promise((resolve) => {
          process.stdout.write(question)
          muted = true
          rl.question('', (answer) => {
            muted = false
            process.stdout.write('\n')
            resolve(answer)
          })
        }),
      close: () => rl.close(),
    }
  }

  const lines = readFileSync(0, 'utf8').split(/\r?\n/)
  const next = () => {
    if (lines.length === 0) throw new Error('Entrada insuficiente: se requieren nombre, correo y contraseña.')
    return lines.shift() ?? ''
  }
  return {
    ask: async (_question, fallback) => next().trim() || fallback || '',
    askHidden: async () => next(),
    close: () => {},
  }
}

async function main() {
  if (existsSync(CONFIG_PATH) && !force) {
    console.error('Ya existe una configuración del usuario local.')
    console.error('Para reemplazarla (esto invalida la contraseña anterior): npm run setup:local-user -- --force')
    process.exit(1)
  }

  const prompt = createPrompter()
  try {
    const fullName = await prompt.ask('Nombre completo')
    const email = await prompt.ask('Correo')
    if (!fullName) throw new Error('El nombre es obligatorio.')
    if (!email) throw new Error('El correo es obligatorio.')

    let password = ''
    for (;;) {
      password = await prompt.askHidden(`Contraseña temporal (mínimo 12 caracteres): `)
      const problem = validatePassword(password, email)
      if (problem) {
        console.error(problem)
        continue
      }
      const repeated = await prompt.askHidden('Repite la contraseña: ')
      if (repeated !== password) {
        console.error('Las contraseñas no coinciden. Inténtalo de nuevo.')
        continue
      }
      break
    }

    const credential = hashPassword(password)
    writeReviewerConfig(CONFIG_PATH, {
      version: 1,
      createdAt: new Date().toISOString(),
      user: {
        id: 'us-reviewer',
        tenantId: TENANT_ID,
        fullName,
        email,
        role: 'Operativo',
      },
      credential,
    })

    console.log('')
    console.log('Usuario local configurado.')
    console.log('Ejecuta `npm run dev` y entra en http://127.0.0.1:5173/login con tu correo y la contraseña elegida.')
    console.log('La configuración queda en apps/web/local/ y está ignorada por Git.')
  } finally {
    prompt.close()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
