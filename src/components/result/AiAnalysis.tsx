import { Sparkles, LoaderCircle } from 'lucide-react'
import { useCityStore } from '../../store/cityStore'

export function AiAnalysis() {
  const analysis = useCityStore((s) => s.analysis)
  const loading = useCityStore((s) => s.isLoadingAnalysis)
  const error = useCityStore((s) => s.analysisError)
  const retry = useCityStore((s) => s.loadAnalysis)
  return <section className="ai-analysis panel"><div className="ai-heading"><Sparkles size={18} /><span className="eyebrow">AI CITY ANALYSIS</span><span className="micro-badge">ОБЪЯСНЕНИЕ РЕЗУЛЬТАТА</span></div><h2>За цифрами — жизнь города.</h2>
    {loading && <p className="analysis-loading"><LoaderCircle className="spin" size={16} />Готовим объяснение результата…</p>}
    {error && <div role="alert"><p>{error}</p><button className="secondary-button" onClick={() => void retry()}>Повторить загрузку</button></div>}
    {analysis && <><p className="ai-summary">{analysis.summary}</p><div className="analysis-grid">{([{ key: 'strengths', label: 'Сильные стороны', number: '01' }, { key: 'risks', label: 'Риски', number: '02' }, { key: 'tradeoffs', label: 'Компромиссы', number: '03' }, { key: 'recommendations', label: 'Рекомендации', number: '04' }] as const).map((section) => <div key={section.key}><span>{section.number}</span><h3>{section.label}</h3><ul>{analysis[section.key].map((text) => <li key={text}>{text}</li>)}</ul></div>)}</div></>}
  </section>
}
