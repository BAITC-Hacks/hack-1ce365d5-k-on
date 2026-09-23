import { profiles, targets } from './model'
import type { HistoryEntry, PreviewSnapshot, ProfileId, StudioProject, StudioReport } from './types'

export function createReport(project: StudioProject, snapshots: Partial<Record<ProfileId, PreviewSnapshot>>, history: HistoryEntry[]): StudioReport {
  const currentSnapshots = Object.fromEntries(Object.entries(snapshots).filter(([id, snapshot]) => snapshot.layoutFingerprint === JSON.stringify(project.profiles[id as ProfileId])))
  return {
    kind: 'astana-layout-report', schemaVersion: 1, exportedAt: new Date().toISOString(),
    project: structuredClone(project), snapshots: structuredClone(currentSnapshots), history: structuredClone(history), sourceMap: targets,
    instructions: [
      'Это предложение расстановки, оно не применено к исходному коду. Сначала изучить notes, изменения и геометрию, затем внести нужные правки.',
      'Для map-position значения x/y — абсолютные проценты 0–100 плоскости карты; для map-offset — смещение в процентах; для screen-offset — смещение в CSS px от исходной позиции.',
      'scale — множитель поверх исходного размера (для landmarks поверх scale из src/data/landmarks.ts); width/height=null сохраняет автоматическую раскладку.',
      'Профили экранов независимы. Незаполненные свойства сохраняют значения текущей версии сайта; snapshots фиксируют базовые значения и реальные экранные прямоугольники посещённых профилей.',
      'Подсказки перекрытий основаны на прямоугольниках, а не на непрозрачных пикселях. Совпадение исходного overlay с географией не гарантируется.',
    ],
  }
}

export function reportMarkdown(report: StudioReport): string {
  const lines = [`# ${report.project.name}`, '', `Экспорт: ${report.exportedAt}`, '', '## Что нужно исправить', '', report.project.notes || 'Общий комментарий не добавлен.', '', '## Расстановка по экранам', '']
  for (const profile of profiles) {
    const layout = report.project.profiles[profile.id]
    const snapshot = report.snapshots[profile.id]
    lines.push(`### ${profile.label} — ${profile.width} × ${profile.height}`, '', `Камера: наклон ${layout.camera.tilt}°, поворот ${layout.camera.rotation}°, масштаб ${layout.camera.scale}, перспектива ${layout.camera.perspective}px.`, '')
    for (const [id, changes] of Object.entries(layout.elements)) {
      const definition = targets.find((target) => target.id === id)!
      lines.push(`- **${definition.label}** (${id}), ${definition.space}: ${JSON.stringify(changes)}. Файл: \`${definition.source}\`.`)
    }
    if (!Object.keys(layout.elements).length) lines.push('Нет индивидуальных изменений элементов.')
    lines.push('', snapshot ? `Последняя проверка: ${snapshot.viewport.width} × ${snapshot.viewport.height}; геометрических подсказок: ${snapshot.issues.length}.` : 'Этот профиль ещё не проверен в рабочей области.', '')
    for (const issue of snapshot?.issues ?? []) lines.push(`- ${issue.message}`)
    lines.push('')
  }
  lines.push('## Как передать задачу', '', 'Приложить к задаче этот файл и JSON-лог из того же экспорта. JSON содержит координаты, baseline, DOM-метрики, историю и привязку к исходным файлам.', '', ...report.instructions.map((line) => `- ${line}`), '')
  return lines.join('\n')
}

export function downloadText(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
