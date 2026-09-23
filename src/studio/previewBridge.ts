import { useCityStore } from '../store/cityStore'
import { clamp, createProfile, round, targets } from './model'
import { screenToPlane } from './projection'
import type { Point } from './projection'
import type { ElementLayout, HostMessage, LayoutIssue, LayoutProfile, PreviewMessage, ProfileId, Rect, TargetDefinition, TargetSnapshot } from './types'

type SavedTarget = {
  node: HTMLElement
  visual: HTMLElement
  baseline: TargetSnapshot['baseline']
  baseScale: number
  original: Map<HTMLElement, Map<string, string>>
}
type Drag = {
  id: string
  mode: 'move' | 'resize'
  start: Point
  original: ElementLayout
  patch: ElementLayout
  rect: Rect
  cssSize: { width: number; height: number }
  corners: Point[] | null
  planeStart: Point | null
  pointerId: number
}
const rectangle = (rect: DOMRect): Rect => ({ x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) })
const keys = ['left', 'top', 'translate', 'scale', 'rotate', 'width', 'height', 'opacity', 'display']

export function startPreviewBridge() {
  if (window.parent === window) return
  const saved = new Map<string, SavedTarget>()
  const probes = new Map<HTMLElement, HTMLElement[]>()
  let profile: LayoutProfile = createProfile()
  let profileId: ProfileId = 'desktop'
  let revision = 0
  let selected: string | null = null
  let editing = true
  let snap = false
  let grid = false
  let drag: Drag | null = null
  let ready = false
  let frame = 0
  let pointerFrame = 0
  let lastPointer: PointerEvent | null = null
  let baselineProfile: ProfileId | null = null

  const post = (message: PreviewMessage) => window.parent.postMessage(message, window.location.origin)
  const styles = document.createElement('style')
  document.head.append(styles)
  const gridLayer = document.createElement('div')
  gridLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483644;background-image:linear-gradient(#a6c4ff14 1px,transparent 1px),linear-gradient(90deg,#a6c4ff14 1px,transparent 1px);background-size:32px 32px;display:none'
  const selection = document.createElement('div')
  selection.style.cssText = 'position:fixed;z-index:2147483646;border:1.5px solid #a7b5ff;pointer-events:none;display:none;box-sizing:border-box;box-shadow:0 0 0 1px #080c1799'
  const label = document.createElement('span')
  label.style.cssText = 'position:absolute;left:-1px;top:-23px;background:#a7b5ff;color:#151831;font:11px/20px system-ui;padding:0 7px;white-space:nowrap;border-radius:3px 3px 0 0;max-width:260px;overflow:hidden;text-overflow:ellipsis'
  const handle = document.createElement('button')
  handle.dataset.studioResize = 'true'
  handle.setAttribute('aria-label', 'Изменить размер выбранного элемента')
  handle.style.cssText = 'position:absolute;right:-5px;bottom:-5px;width:10px;height:10px;background:#c2caff;border:1px solid #151831;padding:0;pointer-events:auto;cursor:nwse-resize;min-width:0'
  selection.append(label, handle)
  document.body.append(gridLayer, selection)

  function discover() {
    for (const definition of targets) {
      const node = document.querySelector<HTMLElement>(definition.selector)
      if (!node || saved.get(definition.id)?.node === node) continue
      const visual = definition.visualSelector ? node.querySelector<HTMLElement>(definition.visualSelector) : node
      if (!visual) continue
      const rect = visual.getBoundingClientRect()
      const original = new Map<HTMLElement, Map<string, string>>()
      for (const element of new Set([node, visual])) {
        original.set(element, new Map(keys.map((key) => [key, key === 'opacity' && element.style.opacity === '0' ? '' : element.style.getPropertyValue(key)])))
      }
      saved.set(definition.id, {
        node, visual, original, baseScale: Number.parseFloat(getComputedStyle(visual).scale) || 1,
        baseline: { x: definition.space === 'map-position' ? Number.parseFloat(node.style.left) || 0 : 0, y: definition.space === 'map-position' ? Number.parseFloat(node.style.top) || 0 : 0, width: round(rect.width), height: round(rect.height) },
      })
    }
  }

  function restoreElement(entry: SavedTarget) {
    for (const [element, properties] of entry.original) {
      for (const [key, value] of properties) {
        if (value) element.style.setProperty(key, value)
        else element.style.removeProperty(key)
      }
    }
  }

  function applyElement(definition: TargetDefinition, layout: ElementLayout) {
    const entry = saved.get(definition.id)
    if (!entry?.node.isConnected) return
    restoreElement(entry)
    const { node, visual } = entry
    if (definition.space === 'map-position') {
      node.style.left = `${layout.x ?? entry.baseline.x}%`
      node.style.top = `${layout.y ?? entry.baseline.y}%`
    } else if (layout.x !== undefined || layout.y !== undefined) {
      const unit = definition.space === 'map-offset' ? '%' : 'px'
      node.style.translate = `${layout.x ?? 0}${unit} ${layout.y ?? 0}${unit}`
    }
    if (layout.width != null) node.style.width = `${layout.width}px`
    if (layout.height != null) node.style.height = `${layout.height}px`
    if (layout.scale !== undefined) visual.style.scale = String(layout.scale * entry.baseScale)
    if (layout.rotation !== undefined) visual.style.rotate = `${layout.rotation}deg`
    if (layout.opacity !== undefined) visual.style.opacity = String(layout.opacity)
    if (layout.hidden) node.style.display = 'none'
  }

  function apply() {
    discover()
    const camera = profile.camera
    const billboard = `translate(-50%,-100%) rotateZ(${-camera.rotation}deg) rotateX(${-camera.tilt}deg)`
    styles.textContent = `
      *,*::before,*::after{transition:none!important;animation:none!important}
      .map-world{transform:perspective(${camera.perspective}px) rotateX(${camera.tilt}deg) rotateZ(${camera.rotation}deg) scale(${camera.scale})!important}
      .map-world .billboard{transform:${billboard}!important}
      .map-world .district-marker{transform:${billboard} translateZ(${camera.tilt === 0 ? 0 : 100}px)!important}
      .map-ground img{filter:brightness(${camera.brightness}) saturate(.58) hue-rotate(8deg)!important}
      body{overscroll-behavior:none} .map-pan{touch-action:none}
      .landmark{pointer-events:auto!important;cursor:${editing ? 'move' : 'default'}}
      .map-heading,.map-budget,.map-compass,.map-bottom-info{pointer-events:auto!important}
    `
    if (baselineProfile !== profileId) {
      for (const entry of saved.values()) restoreElement(entry)
      for (const entry of saved.values()) {
        const rect = entry.visual.getBoundingClientRect()
        entry.baseline = { ...entry.baseline, width: round(rect.width), height: round(rect.height) }
        entry.baseScale = Number.parseFloat(getComputedStyle(entry.visual).scale) || 1
      }
      baselineProfile = profileId
    }
    for (const definition of targets) applyElement(definition, profile.elements[definition.id] ?? {})
    gridLayer.style.display = grid ? 'block' : 'none'
    drawSelection()
  }

  function drawSelection() {
    const entry = selected ? saved.get(selected) : undefined
    if (!editing || !entry?.visual.isConnected || (selected && profile.elements[selected]?.hidden)) { selection.style.display = 'none'; return }
    const rect = entry.visual.getBoundingClientRect()
    if (!rect.width || !rect.height) { selection.style.display = 'none'; return }
    Object.assign(selection.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
    label.style.top = rect.top < 23 ? '0px' : '-23px'
    label.textContent = `${targets.find((item) => item.id === selected)?.label ?? ''} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`
    handle.style.display = selected && profile.elements[selected]?.locked ? 'none' : 'block'
  }

  function collect() {
    const snapshots: TargetSnapshot[] = targets.map((definition) => {
      const entry = saved.get(definition.id)
      if (!entry?.node.isConnected) return { id: definition.id, present: false, visible: false, rect: null, baseline: { x: 0, y: 0, width: 0, height: 0 }, computed: { transform: '', position: '', zIndex: '', overflow: '' }, clipped: false }
      const rect = entry.visual.getBoundingClientRect()
      const computed = getComputedStyle(entry.visual)
      const visible = rect.width > 0 && rect.height > 0 && computed.visibility !== 'hidden' && computed.opacity !== '0' && !profile.elements[definition.id]?.hidden
      let clipped = visible && (rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1)
      if (definition.collisionGroup === 'objects' || definition.collisionGroup === 'hud') {
        const boundary = entry.node.closest('.city-map')?.getBoundingClientRect()
        if (boundary && (rect.left < boundary.left - 1 || rect.top < boundary.top - 1 || rect.right > boundary.right + 1 || rect.bottom > boundary.bottom + 1)) clipped = true
      }
      return { id: definition.id, present: true, visible, rect: rectangle(rect), baseline: entry.baseline, computed: { transform: computed.transform, position: computed.position, zIndex: computed.zIndex, overflow: computed.overflow }, clipped }
    })
    const issues: LayoutIssue[] = []
    for (const snapshot of snapshots) if (snapshot.clipped) issues.push({ kind: 'clipped', targets: [snapshot.id], message: `${targets.find((t) => t.id === snapshot.id)?.label}: рамка выходит за видимую область.` })
    const objects = snapshots.filter((item) => item.visible && targets.find((t) => t.id === item.id)?.collisionGroup)
    for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
      const a = objects[i], b = objects[j], ar = a.rect!, br = b.rect!
      if (Math.min(ar.x + ar.width, br.x + br.width) - Math.max(ar.x, br.x) > 4 && Math.min(ar.y + ar.height, br.y + br.height) - Math.max(ar.y, br.y) > 4) {
        issues.push({ kind: 'overlap', targets: [a.id, b.id], message: `Пересекаются рамки: ${targets.find((t) => t.id === a.id)?.label} / ${targets.find((t) => t.id === b.id)?.label}.` })
      }
    }
    post({ channel: 'astana-preview', type: 'snapshot', snapshot: { revision, capturedAt: new Date().toISOString(), layoutFingerprint: JSON.stringify(profile), profile: profileId, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio, scrollX, scrollY, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight }, targets: snapshots, issues } })
  }
  function schedule() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { apply(); collect() })
  }

  function planeCorners(parent: HTMLElement): Point[] {
    let elements = probes.get(parent)
    if (!elements) {
      elements = [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => {
        const probe = document.createElement('i')
        probe.dataset.studioProbe = 'true'
        probe.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:0;height:0;pointer-events:none;visibility:hidden;transform:none`
        parent.append(probe)
        return probe
      })
      probes.set(parent, elements)
    }
    return elements.map((probe) => { const rect = probe.getBoundingClientRect(); return { x: rect.x, y: rect.y } })
  }

  function onPointerDown(event: PointerEvent) {
    if (!editing) { event.stopImmediatePropagation(); return }
    if (event.button !== 0) return
    const eventTarget = event.target instanceof Element ? event.target : null
    const resize = !!eventTarget?.closest('[data-studio-resize]')
    const definition = resize ? targets.find((t) => t.id === selected) : [...targets].reverse().find((t) => eventTarget?.closest(t.selector))
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!definition) { selected = null; drawSelection(); post({ channel: 'astana-preview', type: 'select', id: null }); return }
    selected = definition.id
    post({ channel: 'astana-preview', type: 'select', id: selected })
    drawSelection()
    const entry = saved.get(selected)
    const original = { ...profile.elements[selected] }
    if (!entry || original.locked || original.hidden) return
    const start = { x: event.clientX, y: event.clientY }
    const parent = definition.space === 'map-position' ? entry.node.parentElement : document.querySelector<HTMLElement>('.map-world')
    const corners = definition.space === 'screen-offset' || !parent ? null : planeCorners(parent)
    drag = { id: selected, mode: resize ? 'resize' : 'move', start, original, patch: {}, rect: rectangle(entry.visual.getBoundingClientRect()), cssSize: { width: entry.node.offsetWidth, height: entry.node.offsetHeight }, corners, planeStart: corners ? screenToPlane(start, corners) : null, pointerId: event.pointerId }
    document.documentElement.setPointerCapture(event.pointerId)
  }

  function updateDrag(event: PointerEvent) {
    if (!drag) return
    const definition = targets.find((target) => target.id === drag!.id)!
    const entry = saved.get(drag.id)!
    const dx = event.clientX - drag.start.x, dy = event.clientY - drag.start.y
    const snapping = snap && !event.altKey
    const quantize = (value: number, step: number) => round(snapping ? Math.round(value / step) * step : value)
    let patch: ElementLayout
    if (drag.mode === 'resize') {
      if (definition.group !== 'interface') patch = { scale: round(clamp((drag.original.scale ?? 1) * Math.max((drag.rect.width + dx) / drag.rect.width, (drag.rect.height + dy) / drag.rect.height), 0.2, 4)) }
      else patch = { width: quantize(clamp(drag.cssSize.width * (drag.rect.width + dx) / drag.rect.width, 10, 4000), 8), height: quantize(clamp(drag.cssSize.height * (drag.rect.height + dy) / drag.rect.height, 10, 4000), 8) }
    } else if (definition.space !== 'screen-offset' && drag.corners && drag.planeStart) {
      const projected = screenToPlane({ x: event.clientX, y: event.clientY }, drag.corners)
      if (!projected) return
      const limits = definition.space === 'map-position' ? [0, 100] : [-3000, 3000]
      patch = { x: quantize(clamp((drag.original.x ?? entry.baseline.x) + (projected.x - drag.planeStart.x) * 100, limits[0], limits[1]), 1), y: quantize(clamp((drag.original.y ?? entry.baseline.y) + (projected.y - drag.planeStart.y) * 100, limits[0], limits[1]), 1) }
    } else patch = { x: quantize(clamp((drag.original.x ?? 0) + dx, -3000, 3000), 8), y: quantize(clamp((drag.original.y ?? 0) + dy, -3000, 3000), 8) }
    applyElement(definition, { ...drag.original, ...patch })
    if (drag.mode === 'resize' && definition.group === 'interface') {
      // Keep the opposite corner fixed even for bottom/right-anchored HUDs.
      const resized = entry.visual.getBoundingClientRect()
      patch = { ...patch, x: round(clamp((drag.original.x ?? 0) + drag.rect.x - resized.x, -3000, 3000)), y: round(clamp((drag.original.y ?? 0) + drag.rect.y - resized.y, -3000, 3000)) }
      applyElement(definition, { ...drag.original, ...patch })
    }
    drag.patch = patch
    drawSelection()
  }
  function onPointerMove(event: PointerEvent) {
    if (!drag) return
    event.preventDefault()
    event.stopImmediatePropagation()
    lastPointer = event
    if (pointerFrame) return
    pointerFrame = requestAnimationFrame(() => { pointerFrame = 0; if (lastPointer) updateDrag(lastPointer) })
  }
  function finishDrag(event: PointerEvent) {
    if (!drag) return
    cancelAnimationFrame(pointerFrame)
    pointerFrame = 0
    if (event.type !== 'pointercancel') updateDrag(event)
    const finished = drag
    drag = null
    if (document.documentElement.hasPointerCapture(finished.pointerId)) document.documentElement.releasePointerCapture(finished.pointerId)
    if (event.type !== 'pointercancel' && Object.keys(finished.patch).length && Math.hypot(event.clientX - finished.start.x, event.clientY - finished.start.y) > 1) {
      profile.elements[finished.id] = { ...finished.original, ...finished.patch }
      post({ channel: 'astana-preview', type: 'commit', id: finished.id, patch: finished.patch, profile: profileId })
    }
    schedule()
  }

  window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.channel !== 'astana-studio' || event.data.type !== 'configure') return
    const message = event.data
    selected = message.selected
    editing = message.editing
    grid = message.grid
    snap = message.snap
    if (drag && message.revision === revision && message.profileId === profileId) { drawSelection(); return }
    profile = structuredClone(message.profile)
    profileId = message.profileId
    revision = message.revision
    const district = profile.districtView === 'nura' ? 'nura' : null
    if (useCityStore.getState().selectedDistrict !== district) useCityStore.getState().selectDistrict(district)
    schedule()
  })
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerup', finishDrag, true)
  window.addEventListener('pointercancel', finishDrag, true)
  window.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation() }, true)
  window.addEventListener('keydown', (event) => {
    if (!editing) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      post({ channel: 'astana-preview', type: 'keyboard', action: event.shiftKey ? 'redo' : 'undo' })
    } else if (event.key.startsWith('Arrow') && selected) {
      event.preventDefault()
      const step = event.shiftKey ? 10 : 1
      post({ channel: 'astana-preview', type: 'keyboard', action: 'nudge', dx: event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy: event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0 })
    }
  }, true)
  window.addEventListener('scroll', () => { drawSelection(); collect() }, true)
  window.addEventListener('resize', () => { baselineProfile = null; schedule() })
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !(node instanceof HTMLElement && node.dataset.studioProbe)))) return
    if (!ready && document.querySelector('[data-layout-id]')) { ready = true; post({ channel: 'astana-preview', type: 'ready' }) }
    schedule()
  })
  observer.observe(document.getElementById('root')!, { childList: true, subtree: true })
  if (document.querySelector('[data-layout-id]')) { ready = true; post({ channel: 'astana-preview', type: 'ready' }) }
  schedule()
}
