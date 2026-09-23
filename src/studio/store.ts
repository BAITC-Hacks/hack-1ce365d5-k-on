import { create } from 'zustand'
import { createProject, validateProject, targets } from './model'
import type { Camera, ElementLayout, HistoryEntry, PreviewSnapshot, ProfileId, StudioProject } from './types'

const STORAGE_KEY = 'astana-layout-studio:v1'
let lastContinuousEdit: { key: string; time: number } | null = null
function restore(): StudioProject {
  try { const draft = localStorage.getItem(STORAGE_KEY); return draft ? validateProject(JSON.parse(draft)) : createProject() }
  catch { return createProject() }
}
interface StudioState {
  project: StudioProject
  selected: string | null
  editing: boolean
  grid: boolean
  snap: boolean
  zoom: number | 'fit'
  revision: number
  snapshots: Partial<Record<ProfileId, PreviewSnapshot>>
  history: HistoryEntry[]
  undoStack: StudioProject[]
  redoStack: StudioProject[]
  storageError: boolean
  select: (id: string | null) => void
  change: (project: StudioProject, action: string, target?: string, before?: unknown, after?: unknown) => void
  updateElement: (id: string, patch: ElementLayout) => void
  updateCamera: (patch: Partial<Camera>) => void
  setProfile: (id: ProfileId) => void
  setNotes: (notes: string) => void
  resetProfile: () => void
  undo: () => void
  redo: () => void
}
export const useStudioStore = create<StudioState>((set, get) => ({
  project: restore(), selected: 'landmark:baiterek', editing: true, grid: false, snap: false, zoom: 'fit', revision: 0,
  snapshots: {}, history: [], undoStack: [], redoStack: [], storageError: false,
  select: (selected) => set({ selected }),
  change: (project, action, target, before, after) => {
    const state = get()
    if (JSON.stringify(project) === JSON.stringify(state.project)) return
    const continuous = action === 'Настройка камеры' || action === 'Комментарий к задаче' || action === 'Название проекта'
    const key = `${project.activeProfile}:${action}:${target ?? ''}`
    const merge = continuous && lastContinuousEdit?.key === key && Date.now() - lastContinuousEdit.time < 700 && state.history.length > 0
    const previous = state.history.at(-1)
    lastContinuousEdit = continuous ? { key, time: Date.now() } : null
    const entry = { at: new Date().toISOString(), profile: project.activeProfile, action, target, before: merge ? previous!.before : before, after }
    set({ project, revision: state.revision + 1, undoStack: merge ? state.undoStack : [...state.undoStack.slice(-79), state.project], redoStack: [], history: merge ? [...state.history.slice(0, -1), entry] : [...state.history.slice(-299), entry] })
  },
  updateElement: (id, patch) => {
    if (!targets.some((target) => target.id === id)) return
    const project = structuredClone(get().project)
    const profile = project.profiles[project.activeProfile]
    const previous = profile.elements[id] ?? {}
    profile.elements[id] = { ...previous, ...patch }
    get().change(project, 'Изменение элемента', id, previous, profile.elements[id])
  },
  updateCamera: (patch) => {
    const project = structuredClone(get().project)
    const profile = project.profiles[project.activeProfile]
    const before = { ...profile.camera }
    profile.camera = { ...profile.camera, ...patch }
    get().change(project, 'Настройка камеры', undefined, before, profile.camera)
  },
  setProfile: (id) => { lastContinuousEdit = null; set((state) => ({ project: { ...state.project, activeProfile: id }, revision: state.revision + 1 })) },
  setNotes: (notes) => { const project = { ...get().project, notes }; get().change(project, 'Комментарий к задаче', undefined, get().project.notes, notes) },
  resetProfile: () => {
    const project = structuredClone(get().project)
    project.profiles[project.activeProfile] = createProject().profiles[project.activeProfile]
    get().change(project, 'Сброс текущего экрана')
  },
  undo: () => {
    lastContinuousEdit = null
    const state = get()
    const project = state.undoStack.at(-1)
    if (!project) return
    set({ project, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, state.project], revision: state.revision + 1, history: [...state.history.slice(-299), { at: new Date().toISOString(), profile: project.activeProfile, action: 'Отмена', before: null, after: null }] })
  },
  redo: () => {
    lastContinuousEdit = null
    const state = get()
    const project = state.redoStack.at(-1)
    if (!project) return
    set({ project, redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack, state.project], revision: state.revision + 1, history: [...state.history.slice(-299), { at: new Date().toISOString(), profile: project.activeProfile, action: 'Повтор', before: null, after: null }] })
  },
}))

let saveTimer: ReturnType<typeof setTimeout> | undefined
useStudioStore.subscribe((state, previous) => {
  if (state.project === previous.project) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project)); if (state.storageError) useStudioStore.setState({ storageError: false }) }
    catch { useStudioStore.setState({ storageError: true }) }
  }, 350)
})
