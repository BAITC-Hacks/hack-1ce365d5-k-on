import type { Direction, IndicatorCode } from '../types/city'

export const directions: { id: Direction; label: string; subtitle: string; color: string; codes: IndicatorCode[] }[] = [
  { id: 'transport', label: 'Транспорт', subtitle: 'Город в движении', color: '#96cbe5', codes: ['T1', 'T2'] },
  { id: 'ecology', label: 'Экология', subtitle: 'Больше жизни', color: '#a8cea1', codes: ['E1', 'E2'] },
  { id: 'social', label: 'Соцсфера', subtitle: 'Ближе к людям', color: '#c7b4e8', codes: ['S1', 'S2'] },
  { id: 'safety', label: 'Безопасность', subtitle: 'Спокойствие рядом', color: '#e8b3a2', codes: ['B1', 'B2'] },
  { id: 'services', label: 'Городской сервис', subtitle: 'Всё работает', color: '#c3cfda', codes: ['C1', 'C2'] },
]
export const indicatorLabels: Record<IndicatorCode, string> = { T1: 'Разгрузка дорог', T2: 'Общественный транспорт', E1: 'Озеленение', E2: 'Качество воздуха', S1: 'Школы и детсады', S2: 'Первичная медпомощь', B1: 'Безопасность улиц', B2: 'Безопасность движения', C1: 'Надёжность ЖКХ', C2: 'Обращения жителей' }
