import { clamp, round, targets } from './model'
import { useStudioStore } from './store'

export function nudgeSelection(dx: number, dy: number) {
  const state = useStudioStore.getState()
  if (!state.selected || !state.editing) return
  const definition = targets.find((target) => target.id === state.selected)!
  const profile = state.project.profiles[state.project.activeProfile]
  const current = profile.elements[state.selected] ?? {}
  if (current.locked) return
  const baseline = state.snapshots[state.project.activeProfile]?.targets.find((target) => target.id === state.selected)?.baseline
  const native = definition.space === 'map-position'
  const factor = definition.space === 'screen-offset' ? 1 : 0.1
  state.updateElement(state.selected, { x: round(clamp((current.x ?? baseline?.x ?? 0) + dx * factor, native ? 0 : -3000, native ? 100 : 3000)), y: round(clamp((current.y ?? baseline?.y ?? 0) + dy * factor, native ? 0 : -3000, native ? 100 : 3000)) })
}
