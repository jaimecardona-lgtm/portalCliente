# Autenticación local de desarrollo

Sistema temporal para usar el portal en `localhost` antes de conectar Supabase Auth. **Solo existe en `vite dev`.** No forma parte del build de producción, no es seguro para clientes reales y no debe desplegarse.

## Uso

```bash
cd apps/web
npm run dev                  # http://127.0.0.1:5173
```

1. Abre `http://127.0.0.1:5173/registro` y crea tu cuenta. No hay comandos ni archivos que configurar.
2. Entrarás al portal con tu cuenta. Tu empresa y tu rol los asigna el servidor.
3. Para entrar después: `http://127.0.0.1:5173/login`.

No se necesita ningún script de terminal. El comando `setup:local-user` quedó **descontinuado** y se eliminó.

## Dónde se guardan los datos

`apps/web/local/auth/` (ignorado por Git, fuera de `public/`, `src/` y de los assets servidos por Vite):

| Archivo | Contenido | Notas |
|---|---|---|
| `users.json` | Cuentas | Sin contraseñas en claro. Hash scrypt con sal aleatoria. |
| `sessions.json` | Sesiones activas | Solo el hash SHA-256 del token. |
| `reset-tokens.json` | Tokens de recuperación | Solo el hash. Un solo uso. 15 minutos. |
| `outbox.json` | Enlaces de recuperación pendientes | Contiene el token temporal para la bandeja local. Se elimina al usarse o al caducar. |

Las escrituras son atómicas (archivo temporal + renombrado) y se serializan en una cola, así que peticiones simultáneas no pierden registros. Los datos sobreviven a reinicios de Vite.

### Estructura de `users.json` (ejemplo sin credenciales reales)

```json
{
  "version": 1,
  "items": [
    {
      "id": "3f2c9a10-0000-4000-8000-000000000000",
      "fullName": "Nombre de Ejemplo",
      "email": "ejemplo@pruebas.example",
      "passwordHash": {
        "algorithm": "scrypt",
        "N": 16384,
        "r": 8,
        "p": 1,
        "keyLength": 64,
        "salt": "<hex aleatorio>",
        "hash": "<hex derivado>"
      },
      "tenantId": "tn-andino",
      "role": "client",
      "status": "active",
      "createdAt": "2026-11-11T12:00:00.000Z",
      "updatedAt": "2026-11-11T12:00:00.000Z",
      "lastLoginAt": "2026-11-11T12:00:00.000Z",
      "termsVersionAccepted": "2026.11-borrador-1",
      "termsAcceptedAt": "2026-11-11T12:00:00.000Z"
    }
  ]
}
```

## Endpoints (servidor de desarrollo)

Todos bajo `/__local-auth`. Respuestas JSON con `Cache-Control: no-store`. Nunca incluyen `passwordHash`.

| Método y ruta | Función | Respuestas principales |
|---|---|---|
| `POST /register` | Crea cuenta y abre sesión | 201, 409 (correo existente), 422 (validación) |
| `POST /login` | Inicia sesión (`remember` opcional) | 200, 401 (genérico), 429 (bloqueado) |
| `POST /logout` | Cierra la sesión actual | 200 |
| `GET /me` | Cuenta de la sesión (validada por el servidor) | 200, 401 |
| `POST /forgot-password` | Genera enlace de recuperación | 202 siempre (no revela si existe) |
| `POST /reset-password` | Restablece con token de un solo uso | 200, 422 (`invalid_token` o validación) |
| `PATCH /profile` | Edita el nombre | 200, 401, 422 |
| `POST /change-password` | Cambia la contraseña (exige la actual) | 200, 401, 422 (`wrong_password`) |
| `GET /outbox` | Bandeja local de recuperación (HTML) | 200 solo desde localhost |

## Seguridad aplicada

- **Transporte**: solo loopback (`127.0.0.1`, `::1`) y encabezado `Host` local. Un `Origin` debe ser `http://localhost` o `http://127.0.0.1`.
- **Entradas**: JSON obligatorio, máximo 8 KB, validación de nombre, correo y contraseña en el servidor.
- **Contraseñas**: mínimo 8 caracteres (regla visible al usuario), recomendado 12 o más. Hash scrypt con sal aleatoria, comparación en tiempo constante.
- **Sesiones**: token aleatorio de 256 bits en cookie `logixtic_local_session` con `HttpOnly`, `SameSite=Strict` y `Path=/`. Duración: 12 horas, o 14 días si se marca "Recordar sesión".
- **Límites**: 5 intentos fallidos bloquean el correo durante 60 segundos (respuesta genérica). Solicitudes de recuperación con un intervalo mínimo de 60 segundos por correo.
- **Tenant y rol**: el servidor asigna `tenantId = tn-andino` y `role = client`. El cliente no puede elegir ni enviar ninguno de los dos; `PATCH /profile` solo acepta el nombre.
- **Recuperación**: respuesta idéntica exista o no la cuenta. El token expira a los 15 minutos, se usa una sola vez y al restablecer se cierran todas las sesiones de la cuenta.
- **Cambio de contraseña**: cierra las demás sesiones y conserva la actual.
- **Logs**: el servidor no registra cuerpos, contraseñas, hashes ni tokens.

## Recuperación de contraseña en desarrollo

No hay proveedor de correo. El enlace se genera y queda en la **bandeja local**, accesible solo desde este equipo:

1. Ve a `/recuperar-contrasena` e indica tu correo.
2. La aplicación responde que la solicitud fue registrada. No afirma que se haya enviado ningún correo.
3. Abre `http://127.0.0.1:5173/__local-auth/outbox` y pulsa **Abrir enlace de recuperación**.
4. Define la nueva contraseña. El enlace queda invalidado.

## Bandeja y datos locales

- `GET /outbox` es una herramienta de desarrollo. Está protegida por loopback, pero **no debe existir en ningún entorno compartido**.
- Para vaciar las cuentas de prueba, detén Vite y borra `apps/web/local/auth/`. Ese directorio no contiene nada que no pueda recrearse, pero sí incluye las cuentas que hayas creado: no lo subas a ningún sitio.

## Migración desde la configuración anterior

Si existía `apps/web/local/reviewer.config.json` (sistema anterior de revisión), el servidor lo importa a `users.json` la primera vez, **sin borrar el archivo original**. Su contraseña sigue siendo válida.

## Textos legales

- `/terminos` y `/privacidad` se consultan sin iniciar sesión.
- La versión aceptada en el registro proviene de `src/content/legal/legal-meta.json`. El contenido es un **borrador pendiente de aprobación jurídica**. Razón social, NIT, dirección, plazos de conservación y canales de contacto aparecen como `PENDIENTE DE APROBACIÓN`; no se han inventado.
- El consentimiento comercial no está incorporado. Si se añade, debe ser un casillero separado y opcional.

## Límites conocidos

- Sin correo real: la recuperación depende de la bandeja local.
- Los límites de intentos viven en memoria: se reinician al reiniciar Vite.
- Sin verificación de contraseñas filtradas ni doble factor. Eso corresponde al proveedor definitivo.
- Las cuentas de desarrollo no tienen auditoría ni cumplen la normativa de datos personales: solo usar información sintética o de pruebas.

## Migración futura a Supabase

Ver `docs/supabase-preparation.md`. Resumen: los perfiles y las membresías del JSON pasan a `profiles` y `tenant_memberships`; **las contraseñas no se migran**: cada persona establece su credencial en Supabase Auth.
