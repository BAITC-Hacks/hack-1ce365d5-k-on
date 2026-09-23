import type { AiAnalysis, CityOverview, DecisionsRequest, District, Measure, SimulationResult, ValidationResult } from '../types/city'

export interface CityApi {
  getOverview(): Promise<CityOverview>
  getDistricts(): Promise<District[]>
  getMeasures(): Promise<Measure[]>
  validateDecisions(request: DecisionsRequest): Promise<ValidationResult>
  simulateDecisions(request: DecisionsRequest): Promise<SimulationResult>
  getAiAnalysis(resultId: string): Promise<AiAnalysis>
}
