import type { District } from '../types/city'

// Supplied synthetic dataset. Coordinates refer to the illustration, not GIS.
export const districts: District[] = [
  { id: 'saryarka', name: 'Saryarka', label: 'Сарыарка', description: 'Смог от частного сектора и недостаток зелёных пространств.', populationShare: 0.20, baseScore: 54.65, x: 27, y: 28, color: '#73b9e2', indicators: { T1: 50, T2: 70, E1: 42, E2: 40, S1: 62, S2: 68, B1: 58, B2: 55, C1: 45, C2: 55 }, priority: 'Воздух и озеленение' },
  { id: 'baikonur', name: 'Baikonur', label: 'Байконур', description: 'Сбалансированный район без ярких перекосов в показателях.', populationShare: 0.13, baseScore: 56.63, x: 46, y: 17, color: '#ad98dd', indicators: { T1: 52, T2: 68, E1: 55, E2: 50, S1: 58, S2: 60, B1: 52, B2: 58, C1: 55, C2: 58 }, priority: 'Последовательное развитие' },
  { id: 'almaty', name: 'Almaty', label: 'Алматы', description: 'Старые коммунальные сети и высокая нагрузка на дороги.', populationShare: 0.24, baseScore: 57.06, x: 83, y: 39, color: '#8ccbac', indicators: { T1: 40, T2: 75, E1: 50, E2: 55, S1: 60, S2: 65, B1: 62, B2: 52, C1: 50, C2: 60 }, priority: 'Надёжное ЖКХ и транспорт' },
  { id: 'nura', name: 'Nura', label: 'Нура', description: 'Растущий район с дефицитом социальной и транспортной инфраструктуры.', populationShare: 0.16, baseScore: 49.18, x: 27, y: 57, color: '#dfc875', indicators: { T1: 55, T2: 40, E1: 45, E2: 65, S1: 38, S2: 35, B1: 55, B2: 50, C1: 60, C2: 50 }, priority: 'Школы и первичная медицина' },
  { id: 'esil', name: 'Esil', label: 'Есиль', description: 'Развитый левый берег с пробками на мостах и переполненными школами.', populationShare: 0.27, baseScore: 62.99, x: 49, y: 76, color: '#dc9f99', indicators: { T1: 45, T2: 62, E1: 68, E2: 72, S1: 48, S2: 55, B1: 78, B2: 60, C1: 75, C2: 70 }, priority: 'Связность и новые учебные места' },
]
