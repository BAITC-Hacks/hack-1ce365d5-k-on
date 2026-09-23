import { Check, MapPin, Plus, Globe2 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Measure } from '../../types/city'
import { useCityStore } from '../../store/cityStore'
import { DirectionIcon } from '../DirectionIcon'

export function MeasureCard({ measure }: { measure: Measure }) {
  const state = useCityStore()
  const district = state.districts.find((item) => item.id === state.selectedDistrict)
  const picked = state.decisions.some((item) => item.id === measure.id)
  const sameDirection = state.decisions.filter((item) => state.measures.find((m) => m.id === item.id)?.direction === measure.direction).length
  const restricted = !!(measure.allowedDistricts && district && !measure.allowedDistricts.includes(district.id))
  const reason = picked ? 'В вашем плане' : state.decisions.length >= 5 ? 'План заполнен' : measure.requiresDistrict && !district ? 'Сначала выберите район' : restricted ? 'Недоступно в районе' : sameDirection >= 2 ? 'Лимит направления: 2' : measure.cost > (state.budget?.remaining ?? 0) ? 'Недостаточно бюджета' : ''
  return <motion.article className={`measure-card ${picked ? 'is-picked' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <div className="measure-card-top"><DirectionIcon direction={measure.icon} /><span className="measure-id">{measure.id}</span><span className="measure-cost">{measure.cost}<small> ед.</small></span></div>
    <h3>{measure.title}</h3><p>{measure.description}</p>
    <div className="measure-meta"><span>{measure.requiresDistrict ? <MapPin size={11} /> : <Globe2 size={11} />}{measure.requiresDistrict ? district?.label ?? 'Выберите район' : 'Весь город'}</span><span>Лаг: {measure.lag} кв.</span></div>
    <div className="measure-effects" title="Полный эффект до учёта лага. Итог рассчитывает движок.">{measure.effects}<span>до лага</span></div>
    <button className={`measure-add ${picked ? 'picked' : ''}`} disabled={!!reason || state.isValidating || state.isSimulating} onClick={() => state.selectMeasure(measure.id)}>{picked ? <Check size={14} /> : <Plus size={14} />}{reason || 'Выбрать меру'}</button>
  </motion.article>
}
