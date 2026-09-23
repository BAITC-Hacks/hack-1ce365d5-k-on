import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useCityStore } from '../../store/cityStore'
import { directions } from '../../data/presentation'
import type { Direction, DistrictId } from '../../types/city'
import { MeasureCard } from './MeasureCard'
import { DecisionPreview } from './DecisionPreview'

export function MeasureDialog({ direction, setDirection, onClose }: { direction: Direction | 'all'; setDirection: (d: Direction | 'all') => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const state = useCityStore()
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  return <dialog ref={ref} className="measure-dialog" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <motion.div className="dialog-content" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="dialog-header"><div><span className="eyebrow">КОНСТРУКТОР ГОРОДСКИХ РЕШЕНИЙ</span><h2>Что изменим сегодня?</h2></div><button className="icon-button" onClick={onClose} aria-label="Закрыть каталог"><X size={22} /></button></div>
      <div className="dialog-toolbar"><label>РАЙОН<select aria-label="Район для меры" value={state.selectedDistrict ?? ''} onChange={(event) => state.selectDistrict(event.target.value ? event.target.value as DistrictId : null)}><option value="">Выберите район</option>{state.districts.map((district) => <option key={district.id} value={district.id}>{district.label}</option>)}</select></label><div><strong>{state.decisions.length} / 5</strong><span>решений в плане</span></div><div><strong>{state.isValidating ? '…' : state.budget?.remaining ?? '—'} ед.</strong><span>доступно</span></div></div>
      <div className="measure-filters"><button onClick={() => setDirection('all')} aria-pressed={direction === 'all'}>Все меры</button>{directions.map((item) => <button key={item.id} onClick={() => setDirection(item.id)} aria-pressed={direction === item.id}>{item.label}</button>)}</div>
      {state.validation?.issues.filter((issue) => issue.code !== 'count').map((issue, index) => <p className="validation-message" key={`${issue.code}-${index}`} role="alert">{issue.message}</p>)}
      <div className="measure-grid">{state.measures.filter((measure) => direction === 'all' || measure.direction === direction).map((measure) => <MeasureCard key={measure.id} measure={measure} />)}</div>
      <DecisionPreview />
      <div className="dialog-footer"><span>14 мероприятий · 5 направлений · горизонт 8 кварталов</span><button className="secondary-button" onClick={onClose}>Вернуться к городу →</button></div>
    </motion.div>
  </dialog>
}
