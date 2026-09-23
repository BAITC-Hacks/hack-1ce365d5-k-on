export interface District {
  id: string
  name: string
  population_share?: number
  initial_indicators?: Record<string, number>
}

export interface Measure {
  id: string
  name: string
  scope: 'city' | 'district'
  cost: number
  direction?: string
  lag?: number
  full_effects?: Record<string, number>
}

export interface Catalog {
  districts: District[]
  measures: Measure[]
  indicators?: { id: string; name: string; direction?: string; meaning?: string }[]
  rules?: {
    budget?: number
    decision_count?: number
    max_per_direction?: number
    global_conflicts?: string[][]
    same_district_conflicts?: string[][]
    horizon_quarters?: number
    critical_threshold_exclusive?: number
  }
}

export interface Decision {
  measure_id: string
  district_id: string | null
}

export interface APIErrorDetail {
  code: string
  message: string
}

export interface SimulationResponse {
  simulation: { decisions: Decision[]; result: Record<string, unknown> }
  advisor: { reply: string | null; error?: APIErrorDetail }
}

export class APIError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status = 0, code = 'network_error') {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.code = code
  }
}

function csrfToken(): string {
  const value = document.cookie.split(';').map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('csrftoken='))
  return value ? decodeURIComponent(value.slice('csrftoken='.length)) : ''
}

async function request<T>(path: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: payload === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      signal,
      headers: payload === undefined ? { Accept: 'application/json' } : {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken(),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new APIError('Нет связи с сервером. Проверьте подключение и попробуйте снова.')
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new APIError('Сервер вернул неожиданный ответ. Попробуйте позже.', response.status, 'invalid_response')
  }
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'error' in data ? data.error : null
    const message = detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string'
      ? detail.message : `Ошибка сервера (${response.status}).`
    const code = detail && typeof detail === 'object' && 'code' in detail && typeof detail.code === 'string'
      ? detail.code : 'server_error'
    throw new APIError(message, response.status, code)
  }
  return data as T
}

export const getCatalog = (signal?: AbortSignal) => request<Catalog>('/api/catalog', undefined, signal)
export const simulate = (decisions: Decision[]) => request<SimulationResponse>('/api/simulate', {
  decisions: decisions.map(({ measure_id, district_id }) => ({ measure_id, district_id })),
})
export const chat = (message: string) => request<{ reply: string }>('/api/advisor/chat', { message })
