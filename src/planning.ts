import type { Catalog, Decision } from './api'

export function planCost(catalog: Catalog, decisions: Decision[]): number {
  return decisions.reduce((sum, decision) => sum + (catalog.measures.find((measure) => measure.id === decision.measure_id)?.cost ?? 0), 0)
}

function problems(catalog: Catalog, decisions: Decision[], requireComplete: boolean): string[] {
  const errors: string[] = []
  const count = catalog.rules?.decision_count ?? 5
  if (requireComplete && decisions.length !== count) errors.push(`Выберите ровно ${count} инициатив.`)
  else if (decisions.length > count) errors.push(`В плане может быть не более ${count} инициатив.`)
  const budget = catalog.rules?.budget ?? 100
  if (planCost(catalog, decisions) > budget) errors.push(`Бюджет плана превышает ${budget} БЕ.`)
  const seen = new Set<string>()
  const directions = new Map<string, number>()
  for (const decision of decisions) {
    const measure = catalog.measures.find((item) => item.id === decision.measure_id)
    if (!measure) {
      errors.push('Неизвестная инициатива. Обновите каталог.')
      continue
    }
    if (seen.has(measure.id)) errors.push('Каждую инициативу можно выбрать только один раз.')
    seen.add(measure.id)
    if (measure.scope === 'city' ? decision.district_id !== null : !catalog.districts.some((item) => item.id === decision.district_id)) {
      errors.push(`Выберите корректный район для «${measure.name}».`)
    }
    if (measure.direction) directions.set(measure.direction, (directions.get(measure.direction) ?? 0) + 1)
  }
  const limit = catalog.rules?.max_per_direction ?? 2
  for (const [direction, amount] of directions) {
    if (amount > limit) errors.push(`Направление «${direction}»: не более ${limit} инициатив.`)
  }
  const describe = (pair: string[]) => pair.map((id) => catalog.measures.find((item) => item.id === id)?.name ?? id).join(' / ')
  for (const pair of catalog.rules?.global_conflicts ?? []) {
    if (pair.every((id) => seen.has(id))) errors.push(`Несовместимые инициативы: ${describe(pair)}.`)
  }
  for (const pair of catalog.rules?.same_district_conflicts ?? []) {
    const matching = pair.map((id) => decisions.find((item) => item.measure_id === id))
    if (matching.every((item) => item !== undefined) && matching[0]?.district_id !== null
      && matching.every((item) => item?.district_id === matching[0]?.district_id)) {
      errors.push(`В одном районе несовместимы: ${describe(pair)}.`)
    }
  }
  return [...new Set(errors)]
}

export function validatePlan(catalog: Catalog, decisions: Decision[]): string[] {
  return problems(catalog, decisions, true)
}

export function canAddDecision(catalog: Catalog, decisions: Decision[], decision: Decision): string | null {
  return problems(catalog, [...decisions, decision], false)[0] ?? null
}
