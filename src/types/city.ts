export type DistrictId = 'esil' | 'almaty' | 'saryarka' | 'baikonur' | 'nura'
export type DistrictName = 'Esil' | 'Almaty' | 'Saryarka' | 'Baikonur' | 'Nura'
export type Direction = 'transport' | 'ecology' | 'social' | 'safety' | 'services'
export type IndicatorValues = Record<Direction, number>
export type IndicatorCode = 'T1' | 'T2' | 'E1' | 'E2' | 'S1' | 'S2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface District {
  id: DistrictId
  name: DistrictName
  label: string
  description: string
  populationShare: number
  baseScore: number
  x: number
  y: number
  color: string
  indicators: Record<IndicatorCode, number>
  priority: string
}

export interface Measure {
  id: string
  title: string
  description: string
  direction: Direction
  cost: number
  lag: number
  effects: string
  requiresDistrict: boolean
  allowedDistricts?: DistrictId[]
  icon: Direction
}

export interface Decision { id: string; district?: DistrictName }
export interface DecisionsRequest { decisions: Decision[] }
export interface Budget { total: number; spent: number; remaining: number }
export interface ValidationIssue { code: string; message: string }
export interface ValidationResult { valid: boolean; issues: ValidationIssue[]; budget: Budget }
export interface CityOverview {
  aqolScore: number
  budget: Budget
  mode: 'demo' | 'live'
}
export interface AiAnalysis {
  summary: string
  strengths: string[]
  risks: string[]
  tradeoffs: string[]
  recommendations: string[]
}
export interface SimulationResult {
  id: string
  mode: 'demo' | 'live'
  baseScore: number
  finalScore: number
  scoreDelta: number
  budget: Budget
  impacts: IndicatorValues
  districtScores: { district: DistrictId; score: number; delta: number }[]
  decisions: Decision[]
}
export interface LandmarkData {
  id: string
  name: string
  image: string
  x: number
  y: number
  scale: number
}
