import { useState } from 'react'
import { Building2, CircleDot, Eye, EyeOff, Layers, LockKeyhole, PanelTop, Search, UnlockKeyhole, TriangleAlert, ChevronRight } from 'lucide-react'
import { groupLabels, targets } from './model'
import { useStudioStore } from './store'

const icons = { interface: PanelTop, map: Layers, districts: CircleDot, landmarks: Building2 }
export function LayerPanel() {
  const state = useStudioStore()
  const [tab, setTab] = useState<'layers' | 'issues'>('layers')
  const [search, setSearch] = useState('')
  const profile = state.project.profiles[state.project.activeProfile]
  const snapshot = state.snapshots[state.project.activeProfile]
  const issues = snapshot?.issues ?? []
  return <aside className="studio-layer-panel">
    <div className="studio-panel-tabs"><button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}>Слои <span>{targets.length}</span></button><button className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>Проверка <span>{issues.length}</span></button></div>
    {tab === 'layers' ? <><label className="studio-search"><Search size={14} /><input aria-label="Найти элемент" placeholder="Найти элемент…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="studio-layer-list">{Object.entries(groupLabels).map(([group, label]) => {
      const entries = targets.filter((target) => target.group === group && target.label.toLowerCase().includes(search.toLowerCase()))
      const Icon = icons[group as keyof typeof icons]
      if (!entries.length) return null
      return <section key={group}><h3><ChevronRight size={11} />{label}<span>{entries.length}</span></h3>{entries.map((target) => {
        const settings = profile.elements[target.id] ?? {}
        return <div className={`studio-layer-row ${state.selected === target.id ? 'selected' : ''} ${settings.hidden ? 'hidden-layer' : ''}`} key={target.id}>
          <button className="studio-layer-select" aria-pressed={state.selected === target.id} onClick={() => state.select(target.id)}><Icon size={14} /><span>{target.label}</span>{Object.keys(settings).length > 0 && <i />}</button>
          <button className="studio-layer-action" aria-label={`${settings.hidden ? 'Показать' : 'Скрыть'} ${target.label}`} onClick={() => state.updateElement(target.id, { hidden: !settings.hidden })}>{settings.hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>
          <button className="studio-layer-action" aria-label={`${settings.locked ? 'Разблокировать' : 'Заблокировать'} ${target.label}`} onClick={() => state.updateElement(target.id, { locked: !settings.locked })}>{settings.locked ? <LockKeyhole size={12} /> : <UnlockKeyhole size={12} />}</button>
        </div>
      })}</section>
    })}</div></> : <div className="studio-issues"><div className="studio-issue-intro"><TriangleAlert size={18} /><h3>Геометрические подсказки</h3><p>Проверяем рамки элементов. Пересечение может быть намеренным — посмотрите на холст.</p></div>{issues.length === 0 && <p className="studio-empty">Перекрытий и обрезанных элементов не обнаружено.</p>}{issues.map((issue, index) => <button key={`${issue.targets.join('-')}-${index}`} onClick={() => state.select(issue.targets[0])}><span>{issue.kind === 'overlap' ? 'ПЕРЕКРЫТИЕ' : 'ОБРЕЗАНИЕ'}</span>{issue.message}<small>Выделить элемент →</small></button>)}</div>}
    <div className="studio-layer-footer"><span className="studio-dot" />{state.storageError ? 'Нет доступа к автосохранению. Скачайте лог.' : 'Черновик сохраняется на этом устройстве'}</div>
  </aside>
}
