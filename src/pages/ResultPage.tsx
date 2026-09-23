import { motion } from 'framer-motion'
import { ArrowLeft, Check, ArrowUpRight } from 'lucide-react'
import { useCityStore } from '../store/cityStore'
import { TopBar } from '../components/hud/TopBar'
import { ResultScore } from '../components/result/ResultScore'
import { ImpactChart } from '../components/result/ImpactChart'
import { AiAnalysis } from '../components/result/AiAnalysis'

export function ResultPage() {
  const state = useCityStore()
  const result = state.simulationResult
  if (!result) return null
  return <motion.main className="result-page" initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}><TopBar /><div className="result-content"><div className="result-heading"><div><span className="eyebrow"><Check size={13} /> СИМУЛЯЦИЯ ЗАВЕРШЕНА</span><h1>Будущее, которое вы выбираете<span>.</span></h1></div><button className="secondary-button" onClick={state.returnToCity}><ArrowLeft size={15} />Изменить план</button></div>
    {result.mode === 'demo' && <div className="demo-notice">Демо-отчёт: AQOL, изменения и объяснение — фиксированный пример ответа API, а не расчёт вашего набора. Бюджет проверен для выбранных мер.</div>}
    <div className="result-overview"><ResultScore result={result} /><ImpactChart impacts={result.impacts} /><section className="district-results panel"><span className="eyebrow">DISTRICT IMPACT</span><h2>Каждый район важен</h2>{result.districtScores.map((item) => <div key={item.district}><span>{state.districts.find((d) => d.id === item.district)?.label}</span><strong>{item.score.toFixed(2)}</strong><small><ArrowUpRight size={11} />+{item.delta.toFixed(1)}</small></div>)}</section></div>
    <AiAnalysis /><section className="result-decisions"><span className="eyebrow">ВАШИ ПЯТЬ РЕШЕНИЙ</span><div>{result.decisions.map((decision) => <article key={decision.id}><span>{decision.id}</span><strong>{state.measures.find((m) => m.id === decision.id)?.title}</strong><small>{decision.district ? state.districts.find((d) => d.name === decision.district)?.label : 'Весь город'}</small></article>)}</div></section>
    </div></motion.main>
}
