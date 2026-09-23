import { useEffect, useRef, useState } from 'react'
import { Maximize2, RefreshCw, Move } from 'lucide-react'
import { profiles } from './model'
import { useStudioStore } from './store'
import { nudgeSelection } from './actions'
import type { HostMessage, PreviewMessage } from './types'

export function StudioCanvas() {
  const state = useStudioStore()
  const iframe = useRef<HTMLIFrameElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const [space, setSpace] = useState({ width: 800, height: 600 })
  const [ready, setReady] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const device = profiles.find((profile) => profile.id === state.project.activeProfile)!
  const fit = Math.min((space.width - 72) / device.width, (space.height - 82) / device.height, 1)
  const scale = state.zoom === 'fit' ? Math.max(0.15, fit) : state.zoom
  const sendConfig = () => {
    const latest = useStudioStore.getState()
    const message: HostMessage = { channel: 'astana-studio', type: 'configure', revision: latest.revision, profileId: latest.project.activeProfile, profile: latest.project.profiles[latest.project.activeProfile], selected: latest.selected, editing: latest.editing, grid: latest.grid, snap: latest.snap }
    iframe.current?.contentWindow?.postMessage(message, location.origin)
  }
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSpace({ width: entry.contentRect.width, height: entry.contentRect.height }))
    if (area.current) observer.observe(area.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const listener = (event: MessageEvent<PreviewMessage>) => {
      if (event.origin !== location.origin || event.source !== iframe.current?.contentWindow || event.data?.channel !== 'astana-preview') return
      const message = event.data
      const latest = useStudioStore.getState()
      if (message.type === 'ready') { setReady(true); setTimedOut(false); sendConfig() }
      if (message.type === 'snapshot' && message.snapshot.profile === latest.project.activeProfile && message.snapshot.revision === latest.revision) {
        useStudioStore.setState({ snapshots: { ...latest.snapshots, [message.snapshot.profile]: message.snapshot } })
      }
      if (message.type === 'select') latest.select(message.id)
      if (message.type === 'commit' && message.profile === latest.project.activeProfile) latest.updateElement(message.id, message.patch)
      if (message.type === 'keyboard') {
        if (message.action === 'undo') latest.undo()
        else if (message.action === 'redo') latest.redo()
        else nudgeSelection(message.dx ?? 0, message.dy ?? 0)
      }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [])
  useEffect(() => { if (ready) sendConfig() }, [ready, state.revision, state.selected, state.editing, state.grid, state.snap])
  useEffect(() => {
    const timeout = setTimeout(() => { if (!ready) setTimedOut(true) }, 10000)
    return () => clearTimeout(timeout)
  }, [ready, attempt])
  return <section className="studio-canvas" aria-label="Рабочая область конструктора">
    <div className="studio-canvas-info"><span><span className="studio-dot" />{device.label} <b>{device.width} × {device.height}</b></span><span>{state.editing ? 'РЕЖИМ РАССТАНОВКИ' : 'ЧИСТЫЙ ПРОСМОТР'}</span></div>
    <div className="studio-canvas-scroll" ref={area}>
      <div className="studio-artboard-space" style={{ width: Math.max(device.width * scale + 72, space.width), minHeight: Math.max(device.height * scale + 82, space.height) }}>
        <div className="studio-artboard-wrap" style={{ width: device.width * scale, height: device.height * scale }}>
          <div className="studio-artboard-label"><span>ASTANA / CITY CONTROL</span><span>{Math.round(scale * 100)}%</span></div>
          <iframe key={attempt} ref={iframe} title="Редактируемый интерфейс Астаны" src="/?layoutStudio=1" width={device.width} height={device.height} style={{ width: device.width, height: device.height, transform: `scale(${scale})` }} />
          {!ready && <div className="studio-canvas-loading"><RefreshCw size={20} className={timedOut ? '' : 'studio-spin'} /><strong>{timedOut ? 'Предпросмотр не отвечает' : 'Загружаем настоящий интерфейс…'}</strong>{timedOut && <button onClick={() => { setReady(false); setTimedOut(false); setAttempt(attempt + 1) }}>Повторить</button>}</div>}
        </div>
      </div>
    </div>
    <div className="studio-canvas-footer"><span><Move size={13} />Перетаскивайте элементы · стрелки для точной настройки · Shift ×10</span><button onClick={() => useStudioStore.setState({ zoom: 'fit' })}><Maximize2 size={13} />Вписать</button></div>
  </section>
}
