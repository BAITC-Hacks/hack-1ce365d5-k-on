import { useEffect, useRef, useState } from 'react'
import { chat, getCatalog, simulate, type Catalog, type Decision, type SimulationResponse } from './api'
import { canAddDecision, planCost, validatePlan } from './planning'
import './App.css'

type Message = { role: 'user' | 'assistant'; text: string }
const number = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить запрос. Попробуйте ещё раз.'
const asRecord = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [districtId, setDistrictId] = useState('')
  const [direction, setDirection] = useState('')
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [run, setRun] = useState<SimulationResponse | null>(null)
  const [busy, setBusy] = useState<'simulation' | 'chat' | null>(null)
  const inFlight = useRef(false)
  const [simulationError, setSimulationError] = useState('')
  const [advisorError, setAdvisorError] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState('')
  const [chatError, setChatError] = useState<{ text: string; request: string } | null>(null)
  const messagesEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    getCatalog(controller.signal).then((data) => {
      setCatalog(data)
      setDistrictId((current) => data.districts.some((district) => district.id === current) ? current : data.districts[0]?.id ?? '')
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setCatalogError(errorText(error))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    const conversation = messagesEnd.current?.parentElement
    conversation?.scrollTo({ top: conversation.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const cost = catalog ? planCost(catalog, decisions) : 0
  const budget = catalog?.rules?.budget ?? 100
  const decisionCount = catalog?.rules?.decision_count ?? 5
  const validation = catalog ? validatePlan(catalog, decisions) : []
  const selectedDistrict = catalog?.districts.find((district) => district.id === districtId)
  const directions = [...new Set(catalog?.measures.map((measure) => measure.direction).filter((value): value is string => Boolean(value)) ?? [])]
  const measures = catalog?.measures.filter((measure) => !direction || measure.direction === direction) ?? []
  const result = run?.simulation.result
  const districtScores = asRecord(result?.district_scores)
  const finalIndicators = asRecord(result?.district_indicators)
  const baselineIndicators = asRecord(asRecord(result?.baseline).district_indicators)
  const changed = Boolean(run && JSON.stringify(run.simulation.decisions) !== JSON.stringify(decisions))
  const describeDecision = (decision: Decision) => ({
    name: catalog?.measures.find((measure) => measure.id === decision.measure_id)?.name ?? decision.measure_id,
    place: decision.district_id === null ? 'Весь город' : catalog?.districts.find((district) => district.id === decision.district_id)?.name ?? decision.district_id,
  })

  async function runSimulation() {
    if (inFlight.current || !catalog || validation.length) return
    inFlight.current = true
    setBusy('simulation')
    setSimulationError('')
    try {
      const response = await simulate(decisions.map(({ measure_id, district_id }) => ({ measure_id, district_id })))
      setRun(response)
      setMessages(response.advisor.reply ? [{ role: 'assistant', text: response.advisor.reply }] : [])
      setAdvisorError(response.advisor.error?.message ?? '')
      setChatError(null)
    } catch (error) {
      setSimulationError(errorText(error))
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  async function sendMessage(request = message) {
    if (inFlight.current || !request.trim() || request.length > 4000 || loading) return
    inFlight.current = true
    setBusy('chat')
    setChatError(null)
    try {
      const response = await chat(request)
      setMessages((previous) => [...previous, { role: 'user', text: request }, { role: 'assistant', text: response.reply }])
      setMessage((current) => current === request ? '' : current)
      setAdvisorError('')
    } catch (error) {
      setChatError({ text: errorText(error), request })
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">К планированию</a>
      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="Astana City Control — главная">
          <span className="brand-mark" aria-hidden="true">A<span>•</span></span>
          <span>ASTANA <strong>CITY CONTROL</strong><small>ГОРОД НАЧИНАЕТСЯ С РЕШЕНИЙ</small></span>
        </a>
        <div className="topbar-meta"><span className="status-dot" />Городская стратегия<span className="edition">СИМУЛЯТОР</span></div>
      </header>

      <main id="workspace">
        <div className="page-heading"><div><p className="eyebrow">ЦЕНТР УПРАВЛЕНИЯ ГОРОДОМ</p><h1>Ваша стратегия. <span>Будущее Астаны.</span></h1><p>Выберите меры развития, распределите бюджет и оцените результат.</p></div><div className="horizon"><span>Горизонт планирования</span><strong>{catalog?.rules?.horizon_quarters !== undefined ? `${catalog.rules.horizon_quarters} кварталов` : 'По правилам модели'}</strong></div></div>

        {loading && <div className="notice" role="status">Загружаем районы и меры развития…</div>}
        {catalogError && <div className="notice error" role="alert"><span>{catalogError}</span><button className="text-button" onClick={() => { setLoading(true); setCatalogError(''); setReload((value) => value + 1) }}>Повторить загрузку</button></div>}

        <div className="dashboard">
          <div className="main-column">
            <section className="panel districts-panel" aria-labelledby="districts-title">
              <div className="section-heading"><div><p className="eyebrow">01 / ИЗУЧИТЕ ГОРОД</p><h2 id="districts-title">Районы Астаны</h2></div><span className="subtle">Исходные данные</span></div>
              <div className="district-grid">
                {catalog?.districts.map((district, index) => <button key={district.id} className={`district-card ${district.id === districtId ? 'selected' : ''}`} aria-pressed={district.id === districtId} disabled={Boolean(busy)} onClick={() => setDistrictId(district.id)}><span className="district-number">0{index + 1}<span aria-hidden="true">↗</span></span><strong>{district.name}</strong><small>{district.population_share !== undefined ? `${number(district.population_share * 100)}% населения` : 'Выбрать район'}</small></button>)}
              </div>
              {selectedDistrict && <div className="district-detail"><div className="district-detail-heading"><h3>{selectedDistrict.name}<span> / показатели района</span></h3><span className="subtle">Шкала 0–100</span></div><div className="indicator-grid">
                {Object.entries(selectedDistrict.initial_indicators ?? {}).map(([id, value]) => {
                  const indicator = catalog?.indicators?.find((item) => item.id === id)
                  const critical = value < (catalog?.rules?.critical_threshold_exclusive ?? 40)
                  return <div className={`indicator ${critical ? 'critical' : ''}`} key={id} title={indicator?.meaning}><div><span>{indicator?.name ?? id}</span><strong>{number(value)}</strong></div><div className="indicator-track" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div></div>
                })}
                {!Object.keys(selectedDistrict.initial_indicators ?? {}).length && <p className="subtle">Для этого района нет исходных показателей.</p>}
              </div></div>}
              {catalog?.rules?.critical_threshold_exclusive !== undefined && <p className="legend"><span />Показатель ниже {catalog.rules.critical_threshold_exclusive} требует внимания</p>}
            </section>

            <section className="panel measures-panel" aria-labelledby="measures-title">
              <div className="section-heading"><div><p className="eyebrow">02 / СОБЕРИТЕ ПЛАН</p><h2 id="measures-title">Меры развития</h2></div><span className="count-badge">{catalog?.measures.length ?? '—'} мер</span></div>
              <div className="direction-filters" aria-label="Фильтр по направлению"><button className={!direction ? 'active' : ''} aria-pressed={!direction} disabled={Boolean(busy)} onClick={() => setDirection('')}>Все направления</button>{directions.map((item) => <button key={item} className={direction === item ? 'active' : ''} aria-pressed={direction === item} disabled={Boolean(busy)} onClick={() => setDirection(item)}>{item}</button>)}</div>
              <p className="target-hint">Районные меры будут добавлены в <strong>{selectedDistrict?.name ?? 'выбранный район'}</strong>. Городские меры действуют на весь город.</p>
              <div className="measure-grid">
                {measures.map((measure) => {
                  const decision = { measure_id: measure.id, district_id: measure.scope === 'city' ? null : districtId }
                  const reason = catalog ? canAddDecision(catalog, decisions, decision) : null
                  const added = decisions.some((item) => item.measure_id === measure.id)
                  return <article className={`measure-card ${added ? 'is-added' : ''}`} key={measure.id}>
                    <div className="measure-topline"><span className="direction-label">{measure.direction ?? 'Развитие города'}</span><span className="measure-cost">{number(measure.cost)} <small>ед.</small></span></div>
                    <h3>{measure.name}</h3><p className="measure-scope">{measure.scope === 'city' ? '◎ Весь город' : `◈ ${selectedDistrict?.name ?? 'Район'}`}{measure.lag !== undefined && <span>Эффект через {measure.lag} кв.</span>}</p>
                    {measure.full_effects && <div className="effects" aria-label="Полный эффект меры"><span className="effects-label">Полный эффект</span>{Object.entries(measure.full_effects).map(([id, value]) => <span key={id} className={value < 0 ? 'negative' : ''} title={catalog?.indicators?.find((item) => item.id === id)?.name}>{id} {value > 0 ? '+' : ''}{number(value)}</span>)}</div>}
                    <button className={`add-button ${added ? 'added' : ''}`} disabled={Boolean(busy) || Boolean(reason)} title={reason ?? undefined} onClick={() => { if (!inFlight.current && catalog && !canAddDecision(catalog, decisions, decision)) { setDecisions((previous) => [...previous, decision]); setSimulationError('') } }}>{added ? '✓ Добавлено в план' : '+ Добавить в план'}</button>
                    {reason && !added && <p className="restriction">{reason}</p>}
                  </article>
                })}
              </div>
            </section>

            <section className="panel results-panel" aria-labelledby="results-title">
              <div className="section-heading"><div><p className="eyebrow">03 / ОЦЕНИТЕ РЕЗУЛЬТАТ</p><h2 id="results-title">Прогноз развития</h2></div>{run && <span className="success-badge">Расчёт завершён</span>}</div>
              {!run ? <div className="empty-state"><span aria-hidden="true">↗</span><h3>Большие перемены начинаются с плана</h3><p>Добавьте {decisionCount} решений и запустите симуляцию.<br />Здесь появится результат расчёта вашего города.</p></div> : <>
                {changed && <p className="notice warning" role="status">План изменён. Ниже показан результат предыдущего расчёта. Запустите симуляцию снова, чтобы обновить прогноз.</p>}
                <div className="result-summary"><div className="score-box"><span>Итоговый балл</span><strong>{typeof result?.score === 'number' ? number(result.score) : '—'}</strong>{typeof result?.score_delta === 'number' && <small>Изменение: {result.score_delta > 0 ? '+' : ''}{number(result.score_delta)}</small>}</div><div className="result-metrics">{[['budget_spent', 'Потрачено бюджета'], ['budget_remaining', 'Остаток бюджета'], ['critical_count', 'Критических показателей']].map(([key, label]) => typeof result?.[key] === 'number' && <div key={key}><span>{label}</span><strong>{number(result[key] as number)}</strong></div>)}</div></div>
                {Object.keys(districtScores).length > 0 && <div className="district-results">{Object.entries(districtScores).map(([id, score]) => typeof score === 'number' && <div key={id}><span>{catalog?.districts.find((district) => district.id === id)?.name ?? id}</span><strong>{number(score)}</strong></div>)}</div>}
                <details className="result-details"><summary>Решения в этом расчёте</summary><ol>{run.simulation.decisions.map((decision, index) => { const item = describeDecision(decision); return <li key={index}>{item.name} <span>— {item.place}</span></li> })}</ol></details>
                {Object.keys(finalIndicators).length > 0 ? <details className="result-details"><summary>Показатели районов: до и после</summary><div className="result-table-wrap"><table className="result-table"><thead><tr><th>Район / показатель</th><th>До</th><th>После</th><th>Изменение</th></tr></thead><tbody>{Object.entries(finalIndicators).flatMap(([district, values]) => Object.entries(asRecord(values)).map(([indicator, value]) => {
                  if (typeof value !== 'number') return null
                  const before = asRecord(baselineIndicators[district])[indicator]
                  const delta = typeof before === 'number' ? value - before : null
                  return <tr key={`${district}-${indicator}`}><th scope="row">{catalog?.districts.find((item) => item.id === district)?.name ?? district}<small>{catalog?.indicators?.find((item) => item.id === indicator)?.name ?? indicator}</small></th><td>{typeof before === 'number' ? number(before) : '—'}</td><td>{number(value)}</td><td>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${number(delta)}`}</td></tr>
                }))}</tbody></table></div></details> : <details className="result-details"><summary>Все данные расчёта</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}
              </>}
            </section>
          </div>

          <aside className="side-column">
            <section className="panel plan-panel" aria-labelledby="plan-title">
              <div className="section-heading"><h2 id="plan-title">Ваш план</h2><span className="count-badge">{decisions.length} / {decisionCount}</span></div>
              <div className="budget-header"><span>Бюджет развития</span><strong>{number(cost)} <small>/ {number(budget)}</small></strong></div><div className="budget-track" role="progressbar" aria-label="Использовано бюджета" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={cost}><span style={{ width: `${budget > 0 ? Math.min(100, cost / budget * 100) : 0}%` }} /></div><p className="budget-remaining">Доступно ещё <strong>{number(budget - cost)} ед.</strong></p>
              <ol className="plan-list">{decisions.map((decision, index) => { const item = describeDecision(decision); const measure = catalog?.measures.find((candidate) => candidate.id === decision.measure_id); return <li key={`${decision.measure_id}-${decision.district_id}`}><span className="plan-number">{index + 1}</span><div><strong>{item.name}</strong><small>{item.place} <span>· {number(measure?.cost ?? 0)} ед.</span></small></div><button className="remove-button" disabled={Boolean(busy)} aria-label={`Удалить: ${item.name}`} onClick={() => { setDecisions((previous) => previous.filter((_, position) => index !== position)); setSimulationError('') }}>×</button></li> })}{Array.from({ length: Math.max(0, decisionCount - decisions.length) }, (_, index) => <li className="empty-slot" key={`empty-${index}`}><span className="plan-number">{decisions.length + index + 1}</span><span>Добавьте решение</span></li>)}</ol>
              <div className="plan-rules"><p>{decisionCount} решений · бюджет до {number(budget)} ед.</p>{catalog?.rules?.max_per_direction !== undefined && <p>Не больше {catalog.rules.max_per_direction} мер на направление</p>}</div>
              {decisions.length > 0 && validation.length > 0 && <ul className="validation-list" aria-live="polite">{validation.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
              {simulationError && <p className="notice error" role="alert">{simulationError}</p>}
              <button className="primary-button simulate-button" disabled={!catalog || loading || Boolean(busy) || validation.length > 0} onClick={() => void runSimulation()}>{busy === 'simulation' ? 'Рассчитываем результат…' : 'Запустить симуляцию'}<span aria-hidden="true">↗</span></button>
              <p className="plan-footnote">Результат рассчитывается по выбранным мерам и правилам модели.</p>
            </section>

            <section className="panel advisor-panel" aria-labelledby="advisor-title">
              <div className="section-heading"><div className="advisor-heading"><span className="advisor-symbol" aria-hidden="true">✦</span><div><h2 id="advisor-title">Советник</h2><p>Помощник по развитию города</p></div></div></div>
              <div className="conversation" role="log" aria-live="polite" aria-label="Разговор с советником">
                {messages.length === 0 && <div className="advisor-welcome"><p>С чего начнём?</p><span>Спросите о районах, выборе мер или результатах симуляции.</span></div>}
                {messages.map((item, index) => <div key={index} className={`chat-message ${item.role}`}><span className="chat-role">{item.role === 'assistant' ? 'СОВЕТНИК' : 'ВЫ'}</span><p>{item.text}</p></div>)}
                {busy === 'chat' && <p className="thinking" role="status">Советник готовит ответ…</p>}
                <div ref={messagesEnd} />
              </div>
              {advisorError && <div className="notice warning" role="alert"><p>Результат сохранён. Объяснение советника недоступно: {advisorError}</p><button className="text-button" disabled={Boolean(busy)} onClick={() => void sendMessage('Объясни результаты последней симуляции и предложи, как улучшить решения.')}>Повторить объяснение</button></div>}
              {chatError && <div className="notice error" role="alert"><p>{chatError.text}</p><button className="text-button" disabled={Boolean(busy)} onClick={() => void sendMessage(chatError.request)}>Повторить сообщение</button></div>}
              {changed && <p className="advisor-context">Советник видит последний рассчитанный план. Изменения появятся после новой симуляции.</p>}
              <form className="chat-form" onSubmit={(event) => { event.preventDefault(); void sendMessage() }}><label className="sr-only" htmlFor="advisor-message">Сообщение советнику</label><textarea id="advisor-message" value={message} disabled={Boolean(busy) || loading} onChange={(event) => setMessage(event.target.value)} placeholder="Как улучшить мой город?" rows={3} aria-describedby="message-limit" /><div className="chat-form-bottom"><span id="message-limit" className={message.length > 4000 ? 'over-limit' : ''}>{message.length} / 4000</span><button type="submit" className="send-button" disabled={Boolean(busy) || loading || !message.trim() || message.length > 4000} aria-label="Отправить сообщение">Отправить <span aria-hidden="true">↑</span></button></div></form>
            </section>
          </aside>
        </div>
        <footer className="page-footer"><span>ASTANA CITY CONTROL</span><span>Каждое решение меняет город.</span></footer>
      </main>
    </div>
  )
}

export default App
