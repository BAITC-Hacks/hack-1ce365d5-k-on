import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowRight, X, MapPin, AlertTriangle, ScanLine } from 'lucide-react'
import { useCityStore } from '../../store/cityStore'
import { directions } from '../../data/presentation'
import { IndicatorBar } from './IndicatorBar'

export function DistrictPanel({ openMeasures }: { openMeasures: () => void }) {
  const selected = useCityStore((s) => s.selectedDistrict)
  const district = useCityStore((s) => s.districts.find((d) => d.id === selected))
  const select = useCityStore((s) => s.selectDistrict)
  return <motion.aside key={selected ?? 'overview'} className={`district-panel panel ${district ? 'district-selected' : ''}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
    {district ? <>
      <div className="panel-heading"><span className="eyebrow"><MapPin size={12} /> РАЙОН ГОРОДА</span><button className="icon-button" onClick={() => select(null)} aria-label="Закрыть район"><X size={17} /></button></div>
      <div className="district-title"><div><h2>{district.label}</h2><span>{district.name.toUpperCase()} DISTRICT</span></div><div className="local-score"><strong>{district.baseScore.toFixed(2)}</strong><span>LOCAL AQOL</span></div></div>
      <p className="district-description">{district.description}</p>
      <div className="district-indicators">{directions.map((direction) => <div className="indicator-group" key={direction.id}><h3><span style={{ background: direction.color }} />{direction.label}</h3>{direction.codes.map((code) => <IndicatorBar key={code} code={code} value={district.indicators[code]} color={direction.color} />)}</div>)}</div>
      <div className="priority"><ScanLine size={17} /><div><span>ПРИОРИТЕТ РАЙОНА</span><strong>{district.priority}</strong></div></div>
      <button className="primary-button" onClick={openMeasures}>Выбрать меру <ArrowUpRight size={17} /></button>
    </> : <>
      <div className="panel-heading"><span className="eyebrow">ВАША МИССИЯ</span><span className="micro-badge">01 / 05</span></div>
      <h2 className="mission-title">Пять решений.<br />Одна Астана.</h2><p className="district-description">У вас 100 единиц бюджета. Сделайте город удобнее для каждого жителя.</p>
      <div className="mission-steps"><div><span>01</span><p><strong>Изучите город</strong>Выберите район и его приоритеты.</p></div><div><span>02</span><p><strong>Соберите свой план</strong>5 мер, не более 2 на направление.</p></div><div><span>03</span><p><strong>Узнайте последствия</strong>Запустите симуляцию на 2 года.</p></div></div>
      <button className="city-alert" onClick={() => select('nura')}><AlertTriangle size={19} /><span><strong>Нура требует внимания</strong><small>2 критических показателя</small></span><ArrowRight size={16} /></button>
      <button className="secondary-button" onClick={openMeasures}>Все мероприятия <ArrowUpRight size={16} /></button>
      <div className="mission-note">Качество жизни — это не только средний балл, но и состояние самого уязвимого района.</div>
    </>}
  </motion.aside>
}
