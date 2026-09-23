import type { CityApi } from './contract'
import { mockApi } from './mock'
import type { DecisionsRequest } from '../types/city'

const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

async function request<T>(path: string, body?: DecisionsRequest): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Сервис временно недоступен (${response.status}). Попробуйте ещё раз.`)
  return response.json() as Promise<T>
}

// Only user choices cross the simulation boundary, even if callers add fields.
export const decisionsPayload = ({ decisions }: DecisionsRequest): DecisionsRequest => ({
  decisions: decisions.map(({ id, district }) => district ? { id, district } : { id }),
})

const httpApi: CityApi = {
  getOverview: () => request('/overview'),
  getDistricts: () => request('/districts'),
  getMeasures: () => request('/measures'),
  validateDecisions: (input) => request('/decisions/validate', decisionsPayload(input)),
  simulateDecisions: (input) => request('/simulate', decisionsPayload(input)),
  getAiAnalysis: (id) => request(`/simulations/${encodeURIComponent(id)}/analysis`),
}

const client: CityApi = baseUrl ? httpApi : mockApi
export const getOverview = () => client.getOverview()
export const getDistricts = () => client.getDistricts()
export const getMeasures = () => client.getMeasures()
export const validateDecisions: CityApi['validateDecisions'] = (input) => client.validateDecisions(decisionsPayload(input))
export const simulateDecisions: CityApi['simulateDecisions'] = (input) => client.simulateDecisions(decisionsPayload(input))
export const getAiAnalysis: CityApi['getAiAnalysis'] = (id) => client.getAiAnalysis(id)
