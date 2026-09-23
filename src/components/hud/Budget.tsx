import { Coins } from 'lucide-react'
import { useCityStore } from '../../store/cityStore'

export function Budget() {
  const budget = useCityStore((s) => s.budget)
  const pending = useCityStore((s) => s.isValidating)
  if (!budget) return null
  return <div className={`budget ${budget.remaining < 0 ? 'over-budget' : ''}`} aria-live="polite" aria-busy={pending}>
    <div className="eyebrow"><Coins size={13} /> БЮДЖЕТ ГОРОДА</div>
    <div className="budget-number">{pending ? '···' : budget.remaining}<span> / {budget.total} ед.</span></div>
    <div className="budget-track"><span style={{ width: `${Math.max(0, Math.min(100, budget.remaining / budget.total * 100))}%` }} /></div>
    <small>{pending ? 'Проверяем бюджет…' : `Распределено ${budget.spent} · доступно ${budget.remaining}`}</small>
  </div>
}
