import type { Measure } from '../types/city'

// Catalogue supplied by the hackathon. Effects are descriptive, never calculated here.
export const measures: Measure[] = [
  { id: 'M1', title: 'Выделенные полосы для автобусов', description: 'Быстрые и предсказуемые поездки на общественном транспорте.', direction: 'transport', cost: 18, lag: 2, requiresDistrict: true, icon: 'transport', effects: 'T1 +6 · T2 +9' },
  { id: 'M2', title: 'Умные светофоры', description: 'Адаптивное управление движением по всему городу.', direction: 'transport', cost: 22, lag: 2, requiresDistrict: false, icon: 'transport', effects: 'T1 +4 · B2 +3' },
  { id: 'M3', title: 'Линия ЛРТ / расширение', description: 'Новая рельсовая связь для выбранного района.', direction: 'transport', cost: 30, lag: 4, requiresDistrict: true, icon: 'transport', effects: 'T1 +16 · T2 +20 · E2 +4' },
  { id: 'M4', title: 'Парк / сквер', description: 'Зелёное общественное пространство рядом с домом.', direction: 'ecology', cost: 15, lag: 2, requiresDistrict: true, icon: 'ecology', effects: 'E1 +12 · E2 +3 · B1 +2' },
  { id: 'M5', title: 'Чистое топливо', description: 'Перевод частного сектора на чистое топливо.', direction: 'ecology', cost: 25, lag: 3, requiresDistrict: true, icon: 'ecology', effects: 'E2 +14 · C1 +4' },
  { id: 'M6', title: 'Городская программа озеленения', description: 'Озеленение и ветрозащитные полосы во всех районах.', direction: 'ecology', cost: 20, lag: 4, requiresDistrict: false, icon: 'ecology', effects: 'E1 +5 · E2 +3' },
  { id: 'M7', title: 'Школа + детсад', description: 'Модульное строительство новых учебных мест.', direction: 'social', cost: 24, lag: 3, requiresDistrict: true, icon: 'social', effects: 'S1 +16' },
  { id: 'M8', title: 'Центр семейного здоровья', description: 'Поликлиника и первичная медицинская помощь.', direction: 'social', cost: 20, lag: 3, requiresDistrict: true, icon: 'social', effects: 'S2 +14' },
  { id: 'M9', title: 'Дворовые спорт-хабы', description: 'Спорт и совместный досуг внутри кварталов.', direction: 'social', cost: 10, lag: 1, requiresDistrict: true, icon: 'social', effects: 'S1 +3 · S2 +3 · B1 +3' },
  { id: 'M10', title: 'Освещение и камеры', description: 'Расширение Safe City на улицах района.', direction: 'safety', cost: 12, lag: 1, requiresDistrict: true, icon: 'safety', effects: 'B1 +12 · B2 +2' },
  { id: 'M11', title: 'Безопасные переходы', description: 'Защищённые переходы и школьные зоны.', direction: 'safety', cost: 10, lag: 1, requiresDistrict: true, icon: 'safety', effects: 'B2 +12 · T1 −2' },
  { id: 'M12', title: 'Цифровая платформа обращений', description: 'Единая система решения запросов жителей.', direction: 'services', cost: 14, lag: 1, requiresDistrict: false, icon: 'services', effects: 'C2 +5' },
  { id: 'M13', title: 'Модернизация тепло- и водосетей', description: 'Обновление коммунальной инфраструктуры района.', direction: 'services', cost: 28, lag: 4, requiresDistrict: true, icon: 'services', effects: 'C1 +18 · E2 +2' },
  { id: 'M14', title: 'Аварийные бригады ЖКХ', description: 'Раннее оповещение и быстрое реагирование.', direction: 'services', cost: 16, lag: 1, requiresDistrict: false, icon: 'services', effects: 'C1 +5 · C2 +2' },
]
