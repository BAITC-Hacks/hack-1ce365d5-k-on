import { Activity, Clock3, Map, Radio } from 'lucide-react'
import { useCityStore } from '../../store/cityStore'
import { AnimatedNumber } from './AnimatedNumber'

export function TopBar() {
  const score = useCityStore((s) => s.aqolScore)
  const count = useCityStore((s) => s.decisions.length)
  const mode = useCityStore((s) => s.overview?.mode)
  return <header className="topbar">
    <a className="brand" href="#" aria-label="Астана — центр управления"><span className="brand-mark"><i /><i /><i /></span><span><strong>ASTANA</strong><small>CITY CONTROL</small></span></a>
    <div className="header-divider" /><div className="project-name">АКИМ<br /><strong>НА 5 ЧАСОВ</strong></div>
    <div className="active-view"><Map size={15} /><span>Центр управления</span></div>
    <div className="top-metric score-metric"><span><Activity size={13} /> AQOL SCORE</span><strong>{score === null ? '—' : <AnimatedNumber value={score} />}</strong></div>
    <div className="top-metric"><span>РЕШЕНИЯ</span><strong>{count}<em> / 5</em></strong></div>
    <div className="session-time"><Clock3 size={16} /><div><small>ВАША СМЕНА</small><span>05:00:00</span></div></div>
    <div className="live-tag"><Radio size={12} />{mode === 'live' ? 'LIVE' : 'ДЕМО'}</div>
  </header>
}
