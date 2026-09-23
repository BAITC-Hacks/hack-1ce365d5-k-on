import { create } from 'zustand'
import * as api from '../api/client'
import type { AiAnalysis, Budget, CityOverview, Decision, District, DistrictId, Measure, SimulationResult, ValidationResult } from '../types/city'

interface CityState {
  districts: District[]
  measures: Measure[]
  overview: CityOverview | null
  selectedDistrict: DistrictId | null
  selectedMeasure: string | null
  decisions: Decision[]
  budget: Budget | null
  aqolScore: number | null
  validation: ValidationResult | null
  simulationResult: SimulationResult | null
  analysis: AiAnalysis | null
  isLoading: boolean
  isValidating: boolean
  isSimulating: boolean
  isLoadingAnalysis: boolean
  error: string | null
  analysisError: string | null
  initialize: () => Promise<void>
  selectDistrict: (id: DistrictId | null) => void
  selectMeasure: (id: string | null) => void
  addDecision: (decision: Decision) => void
  removeDecision: (id: string) => void
  clearDecisions: () => void
  refreshValidation: () => Promise<void>
  simulate: () => Promise<void>
  setSimulationResult: (result: SimulationResult) => void
  loadAnalysis: () => Promise<void>
  returnToCity: () => void
  dismissError: () => void
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Не удалось связаться с сервисом. Попробуйте ещё раз.'
let validationVersion = 0
let analysisVersion = 0

export const useCityStore = create<CityState>((set, get) => ({
  districts: [], measures: [], overview: null, selectedDistrict: null, selectedMeasure: null,
  decisions: [], budget: null, aqolScore: null, validation: null, simulationResult: null, analysis: null,
  isLoading: false, isValidating: false, isSimulating: false, isLoadingAnalysis: false, error: null, analysisError: null,
  initialize: async () => {
    if (get().overview || get().isLoading) return
    set({ isLoading: true, error: null })
    try {
      const [overview, districts, measures] = await Promise.all([api.getOverview(), api.getDistricts(), api.getMeasures()])
      set({ overview, districts, measures, budget: overview.budget, aqolScore: overview.aqolScore, isLoading: false })
    } catch (error) { set({ error: errorMessage(error), isLoading: false }) }
  },
  selectDistrict: (id) => set({ selectedDistrict: id, selectedMeasure: null }),
  selectMeasure: (id) => set({ selectedMeasure: id }),
  addDecision: (decision) => {
    const { decisions, isSimulating } = get()
    if (isSimulating || decisions.length >= 5 || decisions.some((item) => item.id === decision.id)) return
    set({ decisions: [...decisions, decision], selectedMeasure: null, error: null })
    void get().refreshValidation()
  },
  removeDecision: (id) => {
    if (get().isSimulating) return
    set({ decisions: get().decisions.filter((item) => item.id !== id), error: null })
    void get().refreshValidation()
  },
  clearDecisions: () => {
    if (get().isSimulating) return
    set({ decisions: [], selectedMeasure: null, error: null })
    void get().refreshValidation()
  },
  refreshValidation: async () => {
    const version = ++validationVersion
    set({ isValidating: true, validation: null })
    try {
      const validation = await api.validateDecisions({ decisions: get().decisions })
      if (version === validationVersion) set({ validation, budget: validation.budget, isValidating: false })
    } catch (error) { if (version === validationVersion) set({ error: errorMessage(error), isValidating: false }) }
  },
  simulate: async () => {
    if (get().isSimulating || get().isValidating) return
    set({ isSimulating: true, error: null })
    try {
      const payload = { decisions: get().decisions }
      const validation = await api.validateDecisions(payload)
      set({ validation, budget: validation.budget })
      if (!validation.valid) { set({ isSimulating: false, error: validation.issues.map((issue) => issue.message).join(' ') }); return }
      get().setSimulationResult(await api.simulateDecisions(payload))
      void get().loadAnalysis()
    } catch (error) { set({ error: errorMessage(error), isSimulating: false }) }
  },
  setSimulationResult: (result) => set({ simulationResult: result, aqolScore: result.finalScore, budget: result.budget, isSimulating: false, analysis: null, analysisError: null }),
  loadAnalysis: async () => {
    const result = get().simulationResult
    if (!result) return
    const version = ++analysisVersion
    set({ isLoadingAnalysis: true, analysisError: null })
    try {
      const analysis = await api.getAiAnalysis(result.id)
      if (version === analysisVersion) set({ analysis, isLoadingAnalysis: false })
    } catch (error) { if (version === analysisVersion) set({ analysisError: errorMessage(error), isLoadingAnalysis: false }) }
  },
  returnToCity: () => {
    ++analysisVersion
    set({ simulationResult: null, aqolScore: get().overview?.aqolScore ?? null, analysis: null, isLoadingAnalysis: false, analysisError: null, error: null })
  },
  dismissError: () => set({ error: null }),
}))
