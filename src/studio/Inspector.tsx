import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Crosshair, RotateCcw } from 'lucide-react'
import { clamp, elementLimits, targets } from './model'
import { useStudioStore } from './store'
import { nudgeSelection } from './actions'
import type { Camera as CameraType, ElementLayout } from './types'

function NumericField({ label, value, placeholder, min, max, step = 1, optional = false, disabled = false, onChange }: { label: string; value: number | null | undefined; placeholder?: string; min: number; max: number; step?: number; optional?: boolean; disabled?: boolean; onChange: (value: number | null) => void }) {
  const commit = (input: HTMLInputElement) => {
    if (!input.value && optional) { onChange(null); return }
    const parsed = Number.parseFloat(input.value)
    if (Number.isFinite(parsed)) onChange(clamp(parsed, min, max))
    else input.value = value == null ? '' : String(value)
  }
  return <label className="studio-numeric"><span>{label}</span><input key={String(value)} type="number" aria-label={label} defaultValue={value ?? ''} placeholder={placeholder} min={min} max={max} step={step} disabled={disabled} onBlur={(event) => commit(event.currentTarget)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
}

export function Inspector() {
  const state = useStudioStore()
  const [tab, setTab] = useState<'element' | 'camera'>('element')
  const profile = state.project.profiles[state.project.activeProfile]
  const definition = targets.find((target) => target.id === state.selected)
  const element = definition ? profile.elements[definition.id] ?? {} : {}
  const snapshot = state.snapshots[state.project.activeProfile]?.targets.find((target) => target.id === state.selected)
  const native = definition?.space === 'map-position'
  const unit = definition?.space === 'screen-offset' ? 'px' : '%'
  const update = (patch: ElementLayout) => { if (definition) state.updateElement(definition.id, patch) }
  const resetElement = () => {
    if (!definition) return
    const project = structuredClone(state.project)
    delete project.profiles[project.activeProfile].elements[definition.id]
    state.change(project, 'Сброс элемента', definition.id, element, {})
  }
  const cameraFields: { key: keyof CameraType; label: string; min: number; max: number; step: number; unit: string }[] = [
    { key: 'tilt', label: 'Наклон карты', min: 0, max: 65, step: 1, unit: '°' },
    { key: 'rotation', label: 'Поворот карты', min: -45, max: 45, step: 1, unit: '°' },
    { key: 'scale', label: 'Масштаб сцены', min: 0.4, max: 2, step: 0.01, unit: '×' },
    { key: 'perspective', label: 'Перспектива', min: 600, max: 4000, step: 50, unit: 'px' },
    { key: 'brightness', label: 'Яркость подложки', min: 0.2, max: 1.2, step: 0.01, unit: '×' },
  ]
  return <aside className="studio-inspector"><div className="studio-panel-tabs"><button className={tab === 'element' ? 'active' : ''} onClick={() => setTab('element')}><Crosshair size={13} />Элемент</button><button className={tab === 'camera' ? 'active' : ''} onClick={() => setTab('camera')}><Camera size={13} />Камера</button></div><div className="studio-inspector-scroll">
    {tab === 'camera' ? <><div className="studio-inspector-title"><small>ПЛОСКОСТЬ ГОРОДА</small><h2>Ракурс и атмосфера</h2><p>Все слои карты двигаются вместе. Здания и метки сохраняют вертикальное положение.</p></div><div className="studio-camera-presets"><button onClick={() => state.updateCamera({ tilt: 0, rotation: 0 })}>Вид сверху</button><button onClick={() => state.updateCamera({ tilt: 48, rotation: -12 })}>Под углом</button></div>{cameraFields.map((field) => <div className="studio-range" key={field.key}><label htmlFor={`camera-${field.key}`}>{field.label}<span>{profile.camera[field.key]}{field.unit}</span></label><input id={`camera-${field.key}`} type="range" min={field.min} max={field.max} step={field.step} value={profile.camera[field.key]} onChange={(event) => state.updateCamera({ [field.key]: Number(event.target.value) })} /></div>)}<div className="studio-inspector-note">Изменения сохраняются отдельно для каждого размера экрана. Переключайте Desktop, Laptop, Tablet и Mobile в верхней панели.</div></> : definition ? <>
      <div className="studio-inspector-title"><small>{definition.id.toUpperCase()}</small><h2>{definition.label}</h2><p>{native ? 'Координаты на плоскости карты, 0–100%.' : definition.space === 'map-offset' ? 'Смещение overlay относительно подложки, в процентах.' : 'Смещение от исходной позиции в CSS-пикселях.'}</p></div>
      {element.locked && <div className="studio-inspector-note">Элемент заблокирован. Снимите замок в списке слоёв для изменения геометрии.</div>}
      <section className="studio-property-section"><h3>Положение <span>{unit}</span></h3><div className="studio-field-grid"><NumericField label="X" value={element.x ?? snapshot?.baseline.x ?? 0} min={native ? 0 : -3000} max={native ? 100 : 3000} step={unit === '%' ? 0.1 : 1} disabled={element.locked} onChange={(value) => update({ x: value ?? 0 })} /><NumericField label="Y" value={element.y ?? snapshot?.baseline.y ?? 0} min={native ? 0 : -3000} max={native ? 100 : 3000} step={unit === '%' ? 0.1 : 1} disabled={element.locked} onChange={(value) => update({ y: value ?? 0 })} /></div><div className="studio-nudge"><span>Точный сдвиг</span>{([{ label: 'Влево', dx: -1, dy: 0, Icon: ArrowLeft }, { label: 'Вверх', dx: 0, dy: -1, Icon: ArrowUp }, { label: 'Вниз', dx: 0, dy: 1, Icon: ArrowDown }, { label: 'Вправо', dx: 1, dy: 0, Icon: ArrowRight }]).map(({ label, dx, dy, Icon }) => <button key={label} disabled={element.locked} aria-label={label} onClick={() => nudgeSelection(dx, dy)}><Icon size={13} /></button>)}</div></section>
      <section className="studio-property-section"><h3>Размер и вид</h3>{!native && <div className="studio-field-grid"><NumericField label="Ширина" value={element.width} placeholder={`auto · ${Math.round(snapshot?.baseline.width ?? 0)}`} min={10} max={4000} optional disabled={element.locked} onChange={(value) => update({ width: value })} /><NumericField label="Высота" value={element.height} placeholder={`auto · ${Math.round(snapshot?.baseline.height ?? 0)}`} min={10} max={4000} optional disabled={element.locked} onChange={(value) => update({ height: value })} /></div>}<div className="studio-field-grid"><NumericField label="Масштаб ×" value={element.scale ?? 1} min={elementLimits.scale[0]} max={elementLimits.scale[1]} step={0.05} disabled={element.locked} onChange={(value) => update({ scale: value ?? 1 })} /><NumericField label="Поворот °" value={element.rotation ?? 0} min={-180} max={180} disabled={element.locked} onChange={(value) => update({ rotation: value ?? 0 })} /></div><div className="studio-range"><label htmlFor="element-opacity">Непрозрачность<span>{Math.round((element.opacity ?? 1) * 100)}%</span></label><input id="element-opacity" type="range" min={0} max={1} step={0.01} value={element.opacity ?? 1} disabled={element.locked} onChange={(event) => update({ opacity: Number(event.target.value) })} /></div></section>
      <section className="studio-property-section"><h3>Заметка для исправления</h3><textarea key={`${definition.id}-${state.project.activeProfile}-${element.note ?? ''}`} aria-label="Заметка к элементу" maxLength={2000} placeholder="Например: подпись перекрывает мечеть; закрепить справа от здания." defaultValue={element.note ?? ''} onBlur={(event) => update({ note: event.target.value })} /><p className="studio-help">Комментарий попадёт в JSON-лог и отчёт для разработчика.</p></section>
      <section className="studio-property-section studio-dom-info"><h3>Фактически на экране</h3>{snapshot?.rect ? <><div><span>X / Y</span><code>{snapshot.rect.x} / {snapshot.rect.y}</code></div><div><span>W × H</span><code>{snapshot.rect.width} × {snapshot.rect.height}</code></div><div><span>Единицы</span><code>CSS px</code></div></> : <p className="studio-help">Элемент скрыт или ещё не загружен.</p>}<code className="studio-source-path">{definition.source}</code></section><button className="studio-reset-element" onClick={resetElement}><RotateCcw size={12} />Вернуть исходное положение</button>
    </> : <div className="studio-empty-selection"><Crosshair size={28} /><h2>Выберите элемент</h2><p>Нажмите на холсте или в списке слоёв, чтобы настроить его положение.</p></div>}
  </div></aside>
}
