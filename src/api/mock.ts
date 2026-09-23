import { districts } from '../data/districts'
import { measures } from '../data/measures'
import type { CityApi } from './contract'
import type { AiAnalysis, DecisionsRequest, ValidationIssue, ValidationResult } from '../types/city'

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Backend stand-in only. Validation and budgeting belong at this boundary,
// never in UI components or Zustand. There is deliberately no score engine here.
function validate({ decisions }: DecisionsRequest): ValidationResult {
  const issues: ValidationIssue[] = []
  const ids = new Set<string>()
  const directions = new Map<string, number>()
  let spent = 0
  if (decisions.length !== 5) issues.push({ code: 'count', message: 'Для симуляции нужно ровно 5 решений.' })
  for (const decision of decisions) {
    const measure = measures.find((item) => item.id === decision.id)
    if (!measure) { issues.push({ code: 'unknown', message: `Неизвестная мера: ${decision.id}.` }); continue }
    if (ids.has(decision.id)) issues.push({ code: 'duplicate', message: 'Одну меру можно выбрать только один раз.' })
    ids.add(decision.id)
    spent += measure.cost
    const count = (directions.get(measure.direction) ?? 0) + 1
    directions.set(measure.direction, count)
    if (count > 2) issues.push({ code: 'direction', message: 'Допустимо не более 2 решений на одно направление.' })
    const district = districts.find((item) => item.name === decision.district)
    if (measure.requiresDistrict && !district) issues.push({ code: 'district', message: `Выберите район для меры «${measure.title}».` })
    if (!measure.requiresDistrict && decision.district) issues.push({ code: 'city', message: 'Общегородская мера не должна содержать район.' })
    if (district && measure.allowedDistricts && !measure.allowedDistricts.includes(district.id)) issues.push({ code: 'restriction', message: 'Мера недоступна в этом районе.' })
  }
  if (spent > 100) issues.push({ code: 'budget', message: 'Бюджет превышен. Замените одну из мер перед запуском.' })
  if (ids.has('M1') && ids.has('M3')) issues.push({ code: 'conflict', message: 'M1 и M3 несовместимы: выберите автобусные полосы или ЛРТ.' })
  for (const [first, second] of [['M4', 'M7'], ['M5', 'M13']]) {
    const a = decisions.find((item) => item.id === first)
    const b = decisions.find((item) => item.id === second)
    if (a && b && a.district === b.district) issues.push({ code: 'conflict', message: `${first} и ${second} нельзя применять в одном районе.` })
  }
  return { valid: issues.length === 0, issues, budget: { total: 100, spent, remaining: 100 - spent } }
}

const analysis: AiAnalysis = {
  summary: 'Это пример аналитического отчёта для демонстрации интерфейса. Фиксированный сценарий показывает умеренный рост качества жизни. После подключения движка объяснение будет учитывать именно ваш набор решений.',
  strengths: ['Пример: развитие транспорта повышает доступность городской инфраструктуры.', 'Пример: локальные меры помогают адресно работать с проблемами районов.'],
  risks: ['Пример: эффект капитальных проектов зависит от сроков реализации.'],
  tradeoffs: ['Пример: вложения в инфраструктуру сокращают резерв для быстрых операционных мер.'],
  recommendations: ['Сопоставить приоритеты районов с результатом детерминированной модели.', 'После запуска проектов отслеживать показатели и обратную связь жителей.'],
}

export const mockApi: CityApi = {
  async getOverview() { return { aqolScore: 52.56, budget: { total: 100, spent: 0, remaining: 100 }, mode: 'demo' } },
  async getDistricts() { return structuredClone(districts) },
  async getMeasures() { return structuredClone(measures) },
  async validateDecisions(request) { await delay(180); return validate(request) },
  async simulateDecisions(request) {
    const validation = validate(request)
    if (!validation.valid) throw new Error(validation.issues.map((issue) => issue.message).join(' '))
    await delay(1500)
    return {
      id: 'demo-report', mode: 'demo', baseScore: 52.56, finalScore: 56.5, scoreDelta: 3.94,
      budget: validation.budget, decisions: structuredClone(request.decisions),
      impacts: { transport: 5.2, ecology: 3.1, social: 4.6, safety: 2.3, services: 4.5 },
      districtScores: [
        { district: 'esil', score: 65.8, delta: 2.4 }, { district: 'almaty', score: 60.4, delta: 3.1 },
        { district: 'saryarka', score: 59.3, delta: 4.2 }, { district: 'baikonur', score: 60.5, delta: 3.7 },
        { district: 'nura', score: 54.8, delta: 5.6 },
      ],
    }
  },
  async getAiAnalysis() { await delay(450); return structuredClone(analysis) },
}
