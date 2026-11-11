/** Mínimo exigido por la aplicación (desarrollo). La regla se muestra al usuario, no se impone en secreto. */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_RECOMMENDED_LENGTH = 12

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Muy débil' | 'Débil' | 'Aceptable' | 'Buena' | 'Excelente'
  color: string
  meetsMinimum: boolean
}

/**
 * Estimación simple y explicable: longitud y variedad de caracteres.
 * No sustituye una evaluación de contraseñas filtradas; eso corresponderá al proveedor de autenticación.
 */
export function passwordStrength(value: string): PasswordStrength {
  const length = value.length
  const meetsMinimum = length >= PASSWORD_MIN_LENGTH
  let points = 0
  if (length >= PASSWORD_MIN_LENGTH) points += 1
  if (length >= PASSWORD_RECOMMENDED_LENGTH) points += 1
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length
  if (variety >= 3) points += 1
  if (length >= 16) points += 1
  const score = Math.min(points, 4) as PasswordStrength['score']
  if (!meetsMinimum) return { score: 0, label: 'Muy débil', color: 'bg-danger', meetsMinimum }
  const map: Record<number, Pick<PasswordStrength, 'label' | 'color'>> = {
    1: { label: 'Débil', color: 'bg-warning' },
    2: { label: 'Aceptable', color: 'bg-warning' },
    3: { label: 'Buena', color: 'bg-cyan' },
    4: { label: 'Excelente', color: 'bg-success' },
  }
  const top = map[Math.max(1, score)] ?? map[1]!
  return { score: Math.max(1, score) as PasswordStrength['score'], label: top.label, color: top.color, meetsMinimum }
}
