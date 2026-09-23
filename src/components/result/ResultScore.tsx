import { ArrowUpRight } from 'lucide-react'
import { AnimatedNumber } from '../hud/AnimatedNumber'
import type { SimulationResult } from '../../types/city'

export function ResultScore({ result }: { result: SimulationResult }) {
  return <section className="result-score panel"><span className="eyebrow">FINAL AQOL SCORE</span><div className="final-number"><AnimatedNumber from={result.baseScore} value={result.finalScore} /></div><div className="score-improvement"><ArrowUpRight size={18} />{result.scoreDelta > 0 ? '+' : ''}{result.scoreDelta.toFixed(2)}<span>к исходному {result.baseScore.toFixed(2)}</span></div><p>Качество жизни начинается<br />с осмысленных решений.</p><div className="result-budget"><span>Остаток бюджета</span><strong>{result.budget.remaining} <small>/ {result.budget.total}</small></strong></div></section>
}
