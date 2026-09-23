import { motion } from 'framer-motion'
import { directions } from '../../data/presentation'
import type { IndicatorValues } from '../../types/city'
import { DirectionIcon } from '../DirectionIcon'

export function ImpactChart({ impacts }: { impacts: IndicatorValues }) {
  return <section className="impact-chart panel"><span className="eyebrow">CITY IMPACT</span><h2>Как меняется город</h2><p>Изменения по пяти направлениям</p>{directions.map((direction) => <div className="impact-row" key={direction.id}><DirectionIcon direction={direction.id} size={32} /><div><span>{direction.label}</span><div className="impact-track"><motion.span initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.abs(impacts[direction.id]) * 10)}%` }} transition={{ duration: 1 }} style={{ background: direction.color }} /></div></div><strong>{impacts[direction.id] >= 0 ? '+' : ''}{impacts[direction.id].toFixed(1)}</strong></div>)}<small>Шкала диаграммы: 0–10 пунктов · значения получены от API</small></section>
}
