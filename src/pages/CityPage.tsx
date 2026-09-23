import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, LoaderCircle, X } from 'lucide-react'
import { CityMap } from '../components/map/CityMap'
import { TopBar } from '../components/hud/TopBar'
import { DistrictPanel } from '../components/district/DistrictPanel'
import { DecisionStack } from '../components/decisions/DecisionStack'
import { MeasureDialog } from '../components/decisions/MeasureDialog'
import { DirectionIcon } from '../components/DirectionIcon'
import { useCityStore } from '../store/cityStore'
import { directions } from '../data/presentation'
import type { Direction } from '../types/city'

export function CityPage() {
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [direction, setDirection] = useState<Direction | 'all'>('all')
  const state = useCityStore()
  const openMeasures = () => setCatalogOpen(true)
  const closeMeasures = () => { setCatalogOpen(false); state.selectMeasure(null) }
  return <motion.main className="city-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <TopBar />
    {state.error && <div className="error-banner" role="alert">{state.error}{!state.overview && <button onClick={() => void state.initialize()}>Повторить</button>}<button onClick={state.dismissError} aria-label="Закрыть сообщение"><X size={15} /></button></div>}
    {state.isLoading && <div className="loading-banner"><LoaderCircle className="spin" size={16} />Загружаем город…</div>}
    <div className="workspace"><div className="map-column"><CityMap /><div className="direction-dock"><div className="direction-dock-label"><span className="eyebrow">НАПРАВЛЕНИЯ РАЗВИТИЯ</span><small>С чего начнём?</small></div>{directions.map((item) => <button key={item.id} onClick={() => { setDirection(item.id); openMeasures() }}><DirectionIcon direction={item.id} size={34} /><span><strong>{item.label}</strong><small>{item.subtitle}</small></span><ArrowUpRight size={13} /></button>)}</div></div><DistrictPanel openMeasures={openMeasures} /></div>
    <DecisionStack openMeasures={openMeasures} />
    {catalogOpen && <MeasureDialog direction={direction} setDirection={setDirection} onClose={closeMeasures} />}
  </motion.main>
}
