import { useEffect, useRef, useState } from 'react'
import { Download, FileJson, FileText, X, CheckCircle2 } from 'lucide-react'
import { createReport, downloadText, reportMarkdown } from './report'
import { profiles } from './model'
import { useStudioStore } from './store'

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const state = useStudioStore()
  const [downloaded, setDownloaded] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const current = state.snapshots[state.project.activeProfile]
  const pending = current?.revision !== state.revision
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  const exportFile = (format: 'json' | 'md') => {
    const latest = useStudioStore.getState()
    const report = createReport(latest.project, latest.snapshots, latest.history)
    const name = `astana-layout-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
    downloadText(`${name}.${format}`, format === 'json' ? JSON.stringify(report, null, 2) : reportMarkdown(report), format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8')
    setDownloaded(true)
  }
  return <dialog className="studio-export-dialog" ref={ref} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="studio-export-heading"><div className="studio-export-icon"><Download size={22} /></div><button className="studio-icon-button" onClick={onClose} aria-label="Закрыть экспорт"><X size={19} /></button></div>
    <span className="studio-kicker">HANDOFF / ЛОГ ДЛЯ РАЗРАБОТЧИКА</span><h2>Сохраните своё решение.</h2><p>Приложите JSON-файл к нашей следующей задаче. В нём будут точные координаты, размеры, исходные значения, история и ваши комментарии.</p>
    <label className="studio-export-label">Название расстановки<input aria-label="Название расстановки" maxLength={120} value={state.project.name} onChange={(event) => state.change({ ...state.project, name: event.target.value }, 'Название проекта')} /></label>
    <label className="studio-export-label">Что нужно исправить?<textarea aria-label="Общий комментарий к расстановке" maxLength={5000} value={state.project.notes} onChange={(event) => state.setNotes(event.target.value)} placeholder="Что сейчас расположено неправильно? Как должно работать на разных экранах? Что особенно важно сохранить?" /></label>
    <div className="studio-export-profiles">{profiles.map((profile) => <div key={profile.id}><span>{profile.label}</span><strong>{Object.keys(state.project.profiles[profile.id].elements).length} правок</strong><small>{state.snapshots[profile.id]?.layoutFingerprint === JSON.stringify(state.project.profiles[profile.id]) ? 'Просмотрен' : 'Не проверен'}</small></div>)}</div>
    <div className="studio-export-actions"><button className="studio-primary" disabled={pending} onClick={() => exportFile('json')}><FileJson size={16} />{pending ? 'Синхронизация…' : 'Скачать JSON-лог'}</button><button className="studio-secondary" disabled={pending} onClick={() => exportFile('md')}><FileText size={16} />Отчёт .md</button></div>
    {downloaded && <div className="studio-download-confirm" role="status"><CheckCircle2 size={15} />Файл передан браузеру для сохранения. JSON можно импортировать обратно.</div>}
    <button className="studio-json-toggle" onClick={() => setShowJson(!showJson)}>{showJson ? 'Скрыть содержимое JSON' : 'Показать содержимое JSON'}</button>
    {showJson && <div className="studio-raw-report"><p>Если браузер не скачивает файл: выделите текст, скопируйте и сохраните как .json либо пришлите в чат.</p><textarea aria-label="Содержимое JSON-лога" readOnly spellCheck={false} value={JSON.stringify(createReport(state.project, state.snapshots, state.history), null, 2)} /></div>}
    <div className="studio-export-footnote">Основной сайт не изменяется автоматически. Экспорт содержит предложение расстановки, которое можно перенести в код после проверки.</div>
  </dialog>
}
