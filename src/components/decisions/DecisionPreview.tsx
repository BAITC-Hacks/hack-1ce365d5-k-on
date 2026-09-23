import { ArrowRight, X } from 'lucide-react'
import { useCityStore } from '../../store/cityStore'

export function DecisionPreview() {
  const state = useCityStore()
  const measure = state.measures.find((item) => item.id === state.selectedMeasure)
  const district = state.districts.find((item) => item.id === state.selectedDistrict)
  if (!measure) return null
  return <div className="decision-preview" aria-live="polite"><button className="icon-button" onClick={() => state.selectMeasure(null)} aria-label="Отменить выбор меры"><X size={16} /></button><div><strong>{measure.title}</strong><span>{measure.requiresDistrict ? district?.label : 'Весь город'} · {measure.cost} единиц бюджета</span></div><button className="primary-button" disabled={state.isValidating || (measure.requiresDistrict && !district)} onClick={() => state.addDecision(measure.requiresDistrict && district ? { id: measure.id, district: district.name } : { id: measure.id })}>Добавить в план <ArrowRight size={16} /></button></div>
}
