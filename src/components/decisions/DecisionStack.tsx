import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, LoaderCircle, Plus, X } from 'lucide-react'
import { useCityStore } from '../../store/cityStore'
import { DirectionIcon } from '../DirectionIcon'

export function DecisionStack({ openMeasures }: { openMeasures: () => void }) {
  const state = useCityStore()
  const issues = state.validation?.issues.filter((issue) => issue.code !== 'count') ?? []
  return <footer className="decision-dock"><div className="decision-dock-heading"><span className="eyebrow">ВАШ ПЛАН РАЗВИТИЯ <b>{state.decisions.length} / 5</b></span>{state.decisions.length > 0 && <button disabled={state.isSimulating} onClick={state.clearDecisions}>Очистить план</button>}<span className="dock-hint">Пять решений, которые определят будущее города</span></div>
    <div className="decision-slots"><AnimatePresence mode="popLayout">{Array.from({ length: 5 }, (_, index) => {
      const decision = state.decisions[index]
      const measure = state.measures.find((item) => item.id === decision?.id)
      return <motion.div className={`decision-slot ${measure ? 'filled' : ''}`} key={decision?.id ?? `empty-${index}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}>
        {measure && decision ? <><DirectionIcon direction={measure.icon} size={27} /><div><strong>{measure.title}</strong><span>{decision.district ? state.districts.find((d) => d.name === decision.district)?.label : 'Весь город'} · {measure.cost} ед.</span></div><button disabled={state.isSimulating} className="remove-decision" onClick={() => state.removeDecision(decision.id)} aria-label={`Удалить ${measure.id}`}><X size={12} /></button></> : <button onClick={openMeasures} className="empty-slot" aria-label={`Добавить решение ${index + 1}`}><span>0{index + 1}</span><div>Ваше решение<small>Выберите мероприятие</small></div><Plus size={13} /></button>}
      </motion.div>
    })}</AnimatePresence><button className="simulate-button" disabled={state.decisions.length !== 5 || state.isSimulating || state.isValidating || !state.validation?.valid} onClick={() => void state.simulate()}>{state.isSimulating ? <LoaderCircle className="spin" size={18} /> : <ArrowUpRight size={19} />}<span>{state.isSimulating ? 'Симулируем…' : 'Запустить симуляцию'}<small>{state.decisions.length === 5 ? 'SIMULATE CITY' : `Ещё ${5 - state.decisions.length} решений`}</small></span></button></div>
    {issues.length > 0 && <div className="validation-message" role="alert">{issues.map((issue) => issue.message).join(' ')}</div>}
  </footer>
}
