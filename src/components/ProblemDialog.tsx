import { useEffect, useRef } from 'react'
import { ArrowRight, Bus, CircleAlert, Hospital, Leaf, MessageSquare, School, Shield, Wrench, X } from 'lucide-react'
import type { Catalog } from '../api'
import { measuresForIssue, type CityIssue } from '../city'
import './ProblemDialog.css'

type Props = {
  issue: CityIssue | null
  catalog: Catalog
  busy: boolean
  onClose: () => void
  onChooseMeasures: (issue: CityIssue) => void
}
const number = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
const icons = { T1: Bus, T2: Bus, E1: Leaf, E2: Leaf, S1: School, S2: Hospital, B1: Shield, B2: Shield, C1: Wrench, C2: MessageSquare }

export function ProblemDialog({ issue, catalog, busy, onClose, onChooseMeasures }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (issue && !dialog.open) dialog.showModal()
    if (!issue && dialog.open) dialog.close()
  }, [issue])

  const Icon = issue ? icons[issue.indicatorId as keyof typeof icons] ?? CircleAlert : CircleAlert
  const relevantMeasures = issue ? measuresForIssue(catalog, issue) : []
  const critical = issue !== null && issue.value < issue.threshold

  return (
    <dialog ref={dialogRef} className="problem-dialog" aria-labelledby="problem-title" aria-describedby="problem-explanation"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
      }}>
      {issue && <>
        <header className="problem-header">
          <div className={`problem-icon${critical ? ' critical' : ''}`}><Icon size={26} aria-hidden="true" /></div>
          <div className="problem-heading"><p>{issue.districtName} · {issue.direction}</p><h2 id="problem-title">{issue.indicatorName}</h2></div>
          <button className="problem-close" type="button" onClick={onClose} aria-label="Закрыть проблему" autoFocus><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="problem-content">
          <div className={`problem-reading${critical ? ' critical' : ''}`}>
            <div><span>Текущее значение</span><strong>{number(issue.value)}<small> / 100</small></strong></div>
            <div><span>Порог критичности</span><strong>{number(issue.threshold)}<small> / 100</small></strong></div>
          </div>
          <p id="problem-explanation" className="problem-explanation">{critical
            ? `Показатель ниже порога критичности на ${number(issue.threshold - issue.value)} п. и требует внимания.`
            : `Показатель не ниже порога критичности ${number(issue.threshold)}. Можно улучшить его с помощью подходящих мер.`}</p>
          {issue.meaning && <p className="problem-meaning">{issue.meaning}</p>}
          <section className="problem-measures" aria-labelledby="problem-measures-title">
            <h3 id="problem-measures-title">Меры, улучшающие показатель <span>{relevantMeasures.length}</span></h3>
            <p className="problem-effects-note">Полный эффект до учёта задержки. Итоговое изменение рассчитает движок после запуска плана.</p>
            {relevantMeasures.length ? <ul>{relevantMeasures.map((measure) => <li key={measure.id}>
              <div className="problem-measure-name"><strong>{measure.name}</strong><span>+{number(measure.full_effects![issue.indicatorId])} п.</span></div>
              <p><span>{number(measure.cost)} ед. бюджета</span><span>{measure.scope === 'city' ? 'Весь город' : issue.districtName}</span><span>{measure.lag === undefined ? 'Задержка не указана' : `Задержка: ${measure.lag} кв.`}</span></p>
            </li>)}</ul> : <p className="problem-no-measures">В каталоге пока нет мер с положительным эффектом на этот показатель.</p>}
          </section>
        </div>
        <footer className="problem-footer"><button type="button" disabled={busy || !relevantMeasures.length} onClick={() => { dialogRef.current?.close(); onChooseMeasures(issue) }}>Подобрать меры <ArrowRight size={17} aria-hidden="true" /></button></footer>
      </>}
    </dialog>
  )
}
