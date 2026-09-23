export type ProfileId = 'desktop' | 'laptop' | 'tablet' | 'mobile'
export type CoordinateSpace = 'screen-offset' | 'map-position' | 'map-offset'
export interface TargetDefinition {
  id: string
  label: string
  group: 'interface' | 'map' | 'districts' | 'landmarks'
  selector: string
  visualSelector?: string
  space: CoordinateSpace
  source: string
  collisionGroup?: 'hud' | 'objects'
}
export interface ElementLayout {
  x?: number
  y?: number
  width?: number | null
  height?: number | null
  scale?: number
  rotation?: number
  opacity?: number
  hidden?: boolean
  locked?: boolean
  note?: string
}
export interface Camera { tilt: number; rotation: number; scale: number; perspective: number; brightness: number }
export interface LayoutProfile {
  camera: Camera
  elements: Record<string, ElementLayout>
  districtView: 'overview' | 'nura'
}
export interface StudioProject {
  name: string
  notes: string
  activeProfile: ProfileId
  profiles: Record<ProfileId, LayoutProfile>
}
export interface Rect { x: number; y: number; width: number; height: number }
export interface TargetSnapshot {
  id: string
  present: boolean
  visible: boolean
  rect: Rect | null
  baseline: { x: number; y: number; width: number; height: number }
  computed: { transform: string; position: string; zIndex: string; overflow: string }
  clipped: boolean
}
export interface LayoutIssue { kind: 'overlap' | 'clipped'; targets: string[]; message: string }
export interface PreviewSnapshot {
  revision: number
  capturedAt: string
  layoutFingerprint: string
  profile: ProfileId
  viewport: { width: number; height: number; devicePixelRatio: number; scrollX: number; scrollY: number; documentWidth: number; documentHeight: number }
  targets: TargetSnapshot[]
  issues: LayoutIssue[]
}
export interface HistoryEntry { at: string; profile: ProfileId; action: string; target?: string; before: unknown; after: unknown }
export interface StudioReport {
  kind: 'astana-layout-report'
  schemaVersion: 1
  exportedAt: string
  project: StudioProject
  snapshots: Partial<Record<ProfileId, PreviewSnapshot>>
  history: HistoryEntry[]
  sourceMap: TargetDefinition[]
  instructions: string[]
}
export type HostMessage = { channel: 'astana-studio'; type: 'configure'; revision: number; profileId: ProfileId; profile: LayoutProfile; selected: string | null; editing: boolean; grid: boolean; snap: boolean }
export type PreviewMessage =
  | { channel: 'astana-preview'; type: 'ready' }
  | { channel: 'astana-preview'; type: 'snapshot'; snapshot: PreviewSnapshot }
  | { channel: 'astana-preview'; type: 'select'; id: string | null }
  | { channel: 'astana-preview'; type: 'commit'; id: string; patch: ElementLayout; profile: ProfileId }
  | { channel: 'astana-preview'; type: 'keyboard'; action: 'undo' | 'redo' | 'nudge'; dx?: number; dy?: number }
