import type { Camera, ElementLayout, LayoutProfile, ProfileId, StudioProject, TargetDefinition } from './types'

export const profiles: { id: ProfileId; label: string; width: number; height: number }[] = [
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
  { id: 'laptop', label: 'Laptop', width: 1280, height: 720 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'mobile', label: 'Mobile', width: 390, height: 844 },
]
export const defaultCamera: Camera = { tilt: 48, rotation: -12, scale: 0.95, perspective: 1800, brightness: 0.54 }
const target = (id: string, label: string, selector: string, source: string, collisionGroup?: 'hud'): TargetDefinition => ({ id, label, selector, source, group: 'interface', space: 'screen-offset', collisionGroup })
export const targets: TargetDefinition[] = [
  target('topbar', 'Верхняя панель', '.topbar', 'src/components/hud/TopBar.tsx'),
  target('heading', 'Заголовок карты', '.map-heading', 'src/components/map/CityMap.tsx', 'hud'),
  target('budget', 'Бюджет', '.map-budget', 'src/components/map/CityMap.tsx', 'hud'),
  target('district-panel', 'Панель района', '.district-panel', 'src/components/district/DistrictPanel.tsx'),
  target('directions', 'Направления развития', '.direction-dock', 'src/pages/CityPage.tsx'),
  target('decisions', 'Очередь решений', '.decision-dock', 'src/components/decisions/DecisionStack.tsx'),
  target('controls', 'Zoom / 2.5D', '.map-controls', 'src/components/map/CityMap.tsx', 'hud'),
  target('layers', 'Переключатели слоёв', '.map-layer-controls', 'src/components/map/CityMap.tsx', 'hud'),
  target('compass', 'Компас', '.map-compass', 'src/components/map/CityMap.tsx', 'hud'),
  target('legend', 'Подпись карты', '.map-bottom-info', 'src/components/map/CityMap.tsx', 'hud'),
  { ...target('map-world', 'Плоскость карты', '.map-world', 'src/App.css'), group: 'map' },
  { ...target('overlay', 'Границы районов', '.district-layer', 'src/components/map/DistrictLayer.tsx'), group: 'map', space: 'map-offset' },
  ...([['saryarka', 'Сарыарка'], ['baikonur', 'Байконур'], ['almaty', 'Алматы'], ['nura', 'Нура'], ['esil', 'Есиль']] as const).map(([id, label]): TargetDefinition => ({ id: `district:${id}`, label, group: 'districts', selector: `[data-layout-id="district:${id}"]`, visualSelector: '.district-marker', space: 'map-position', source: 'src/data/districts.ts', collisionGroup: 'objects' })),
  ...([['baiterek', 'Байтерек'], ['akorda', 'Акорда'], ['mosque', 'Хазрет Султан'], ['khan', 'Хан Шатыр'], ['expo', 'EXPO']] as const).map(([id, label]): TargetDefinition => ({ id: `landmark:${id}`, label, group: 'landmarks', selector: `[data-layout-id="landmark:${id}"]`, visualSelector: '.landmark', space: 'map-position', source: 'src/data/landmarks.ts', collisionGroup: 'objects' })),
]
export const groupLabels = { interface: 'Интерфейс', map: 'Карта и слои', districts: 'Метки районов', landmarks: 'Здания' }
export const createProfile = (): LayoutProfile => ({ camera: { ...defaultCamera }, elements: {}, districtView: 'overview' })
export const createProject = (): StudioProject => ({ name: 'Астана · моя расстановка', notes: '', activeProfile: 'desktop', profiles: { desktop: createProfile(), laptop: createProfile(), tablet: createProfile(), mobile: createProfile() } })
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const round = (value: number) => Math.round(value * 100) / 100
export const elementLimits: Record<Exclude<keyof ElementLayout, 'hidden' | 'locked' | 'note'>, [number, number]> = { x: [-3000, 3000], y: [-3000, 3000], width: [10, 4000], height: [10, 4000], scale: [0.2, 4], rotation: [-180, 180], opacity: [0, 1] }

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ожидался объект настроек.')
  return value as Record<string, unknown>
}
const number = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Число должно быть в диапазоне ${min}…${max}.`)
  return value
}
const string = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error('Некорректный или слишком длинный текст.')
  return value
}

// Imports and local drafts are untrusted. Rebuild an allowlisted structure;
// never spread parsed objects into a style object or the store.
export function validateProject(input: unknown): StudioProject {
  const raw = record(input)
  const project = createProject()
  project.name = string(raw.name, 120)
  project.notes = string(raw.notes, 5000)
  if (!profiles.some((p) => p.id === raw.activeProfile)) throw new Error('Неизвестный размер экрана.')
  project.activeProfile = raw.activeProfile as ProfileId
  const rawProfiles = record(raw.profiles)
  for (const { id } of profiles) {
    const source = record(rawProfiles[id])
    const camera = record(source.camera)
    project.profiles[id].camera = {
      tilt: number(camera.tilt, 0, 65), rotation: number(camera.rotation, -45, 45),
      scale: number(camera.scale, 0.4, 2), perspective: number(camera.perspective, 600, 4000), brightness: number(camera.brightness, 0.2, 1.2),
    }
    if (source.districtView !== 'overview' && source.districtView !== 'nura') throw new Error('Неизвестный вид панели.')
    project.profiles[id].districtView = source.districtView
    for (const [targetId, value] of Object.entries(record(source.elements))) {
      const definition = targets.find((item) => item.id === targetId)
      if (!definition) throw new Error(`Неизвестный элемент: ${targetId}`)
      const entry = record(value)
      const layout: ElementLayout = {}
      for (const [key, field] of Object.entries(entry)) {
        if (key === 'hidden' || key === 'locked') {
          if (typeof field !== 'boolean') throw new Error('Некорректное состояние слоя.')
          layout[key] = field
        } else if (key === 'note') layout.note = string(field, 2000)
        else if (Object.hasOwn(elementLimits, key)) {
          const numericKey = key as keyof typeof elementLimits
          if ((key === 'width' || key === 'height') && field === null) layout[key] = null
          else {
            const limits = definition.space === 'map-position' && (key === 'x' || key === 'y') ? [0, 100] : elementLimits[numericKey]
            layout[numericKey] = number(field, limits[0], limits[1])
          }
        } else throw new Error(`Неизвестное свойство: ${key}`)
      }
      project.profiles[id].elements[targetId] = layout
    }
  }
  return project
}

export function importReport(text: string): StudioProject {
  if (text.length > 2_000_000) throw new Error('Лог слишком большой. Максимум 2 МБ.')
  const report = record(JSON.parse(text))
  if (report.kind !== 'astana-layout-report' || report.schemaVersion !== 1) throw new Error('Нужен JSON-лог Astana Layout Studio версии 1.')
  return validateProject(report.project)
}
