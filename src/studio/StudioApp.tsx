import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Download, Grid2X2, Import, Laptop, Magnet, Monitor, MousePointer2, PanelLeft, Redo2, RotateCcw, Smartphone, Tablet, Undo2, X, Eye } from 'lucide-react'
import { profiles, importReport } from './model'
import { useStudioStore } from './store'
import { StudioCanvas } from './StudioCanvas'
import { nudgeSelection } from './actions'
import { LayerPanel } from './LayerPanel'
import { Inspector } from './Inspector'
import { ExportDialog } from './ExportDialog'
import type { ProfileId } from './types'

const deviceIcons = { desktop: Monitor, laptop: Laptop, tablet: Tablet, mobile: Smartphone }
export default function StudioApp() {
  const state = useStudioStore()
  const [exportOpen, setExportOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const profile = state.project.profiles[state.project.activeProfile]
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      const element = event.target
      if (element instanceof HTMLElement && (element.matches('input,textarea,select') || element.isContentEditable)) return
      const latest = useStudioStore.getState()
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) latest.redo(); else latest.undo() }
      else if (event.key.startsWith('Arrow') && latest.selected) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        nudgeSelection(event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('Максимальный размер лога — 2 МБ.')
      const project = importReport(await file.text())
      state.change(project, 'Импорт JSON-лога')
      useStudioStore.setState({ snapshots: {} })
      setNotice('Расстановка импортирована. Предыдущую можно вернуть через «Отменить».')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось прочитать лог.') }
    if (input.current) input.current.value = ''
  }
  const setProfile = (id: ProfileId) => state.setProfile(id)
  return <main className="studio-app">
    <header className="studio-topbar"><a className="studio-brand" href="/studio.html"><span><PanelLeft size={21} /></span><div>ASTANA <b>STUDIO</b><small>UI / UX LAYOUT BUILDER</small></div></a><div className="studio-project-breadcrumb">Проекты <span>/</span><strong>Аким на 5 часов</strong><span className="studio-local-badge">LOCAL</span></div><div className="studio-topbar-actions"><div className="studio-history-buttons"><button aria-label="Отменить изменение" title="Ctrl+Z" disabled={!state.undoStack.length} onClick={state.undo}><Undo2 size={16} /></button><button aria-label="Повторить изменение" title="Ctrl+Shift+Z" disabled={!state.redoStack.length} onClick={state.redo}><Redo2 size={16} /></button></div><button className="studio-secondary" onClick={() => input.current?.click()}><Import size={15} />Импорт</button><button className="studio-primary" onClick={() => setExportOpen(true)}><Download size={15} />Сохранить лог</button><a className="studio-open-site" href="/" target="_blank" rel="noopener noreferrer" title="Открыть основной сайт"><ArrowUpRight size={18} /></a></div></header>
    <div className="studio-toolbar"><div className="studio-mode-switch"><button className={state.editing ? 'active' : ''} onClick={() => useStudioStore.setState({ editing: true })}><MousePointer2 size={14} />Расстановка</button><button className={!state.editing ? 'active' : ''} onClick={() => useStudioStore.setState({ editing: false })}><Eye size={14} />Просмотр</button></div><div className="studio-device-switch">{profiles.map((device) => { const Icon = deviceIcons[device.id]; return <button key={device.id} aria-pressed={state.project.activeProfile === device.id} onClick={() => setProfile(device.id)} title={`${device.width} × ${device.height}`}><Icon size={15} /><span>{device.label}</span></button> })}</div><div className="studio-view-tools"><button className={state.grid ? 'active' : ''} aria-label="Показать сетку" aria-pressed={state.grid} onClick={() => useStudioStore.setState({ grid: !state.grid })}><Grid2X2 size={15} /></button><button className={state.snap ? 'active' : ''} aria-label="Привязка к сетке" aria-pressed={state.snap} onClick={() => useStudioStore.setState({ snap: !state.snap })}><Magnet size={15} /></button><select aria-label="Масштаб рабочей области" value={state.zoom} onChange={(event) => useStudioStore.setState({ zoom: event.target.value === 'fit' ? 'fit' : Number(event.target.value) })}><option value="fit">Вписать</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option></select></div></div>
    {notice && <div className="studio-notice" role="status"><Check size={14} /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Закрыть уведомление"><X size={14} /></button></div>}
    <div className="studio-body"><LayerPanel /><div className="studio-center"><div className="studio-scene-bar"><span>Настройте расположение. Сохраните контекст.</span><label>Панель<select aria-label="Содержимое панели района" value={profile.districtView} onChange={(event) => { const project = structuredClone(state.project); project.profiles[project.activeProfile].districtView = event.target.value as 'overview' | 'nura'; state.change(project, 'Смена содержимого панели') }}><option value="overview">Обзор города</option><option value="nura">Район Нура</option></select></label></div><StudioCanvas /><div className="studio-session-bar"><span>Каждый экран имеет свою расстановку. Изменения не затрагивают основной сайт.</span><button onClick={() => { state.resetProfile(); setNotice('Текущий экран сброшен. Действие можно отменить.') }}><RotateCcw size={12} />Сбросить экран</button></div></div><Inspector /></div>
    <input ref={input} className="studio-file-input" type="file" accept=".json,application/json" aria-label="Импорт JSON-лога" onChange={(event) => void importFile(event.target.files?.[0])} />
    {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
  </main>
}
