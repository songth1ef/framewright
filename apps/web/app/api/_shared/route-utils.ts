export interface IdRouteContext {
  params: Promise<{ id: string }>
}

export function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function parseJsonRecord(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json()
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

export function parseId(value: string): string | null {
  const id = value.trim()
  return id.length > 0 && id.length <= 128 ? id : null
}

export function parseRequiredText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

export function parseNullableText(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === 'string' ? value.trim() : undefined
}

export function parseNullableId(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' ? (parseId(value) ?? undefined) : undefined
}

export function parseIdList(value: unknown, allowEmpty = false): string[] | null {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return null
  const ids = value.map((item) => (typeof item === 'string' ? parseId(item) : null))
  return ids.every((id): id is string => id !== null) ? ids : null
}

export function getErrorCode(error: unknown): unknown {
  return isRecord(error) ? error['code'] : undefined
}
