import type { Catalog } from './api'

export interface CityIssue {
  districtId: string
  indicatorId: string
  districtName: string
  indicatorName: string
  direction: string
  value: number
  threshold: number
  meaning?: string
}

export function cityIssues(catalog: Catalog, districtIndicators?: Record<string, unknown>): CityIssue[] {
  const threshold = catalog.rules?.critical_threshold_exclusive ?? 40
  const issues: CityIssue[] = []
  for (const district of catalog.districts) {
    const supplied = districtIndicators?.[district.id]
    const values = supplied && typeof supplied === 'object' && !Array.isArray(supplied)
      ? supplied as Record<string, unknown> : district.initial_indicators ?? {}
    for (const indicator of catalog.indicators ?? []) {
      const value = values[indicator.id]
      if (typeof value === 'number' && Number.isFinite(value) && value < threshold) {
        issues.push({ districtId: district.id, districtName: district.name,
          indicatorId: indicator.id, indicatorName: indicator.name,
          direction: indicator.direction ?? 'Развитие города', value, threshold,
          meaning: indicator.meaning,
        })
      }
    }
  }
  return issues.sort((first, second) => first.value - second.value)
}

export function measuresForIssue(catalog: Catalog, issue: CityIssue) {
  return catalog.measures.filter((measure) => (measure.full_effects?.[issue.indicatorId] ?? 0) > 0)
}
