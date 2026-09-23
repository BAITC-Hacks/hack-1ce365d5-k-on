import { BusFront, Leaf, Users, ShieldCheck, Settings, LayoutGrid } from 'lucide-react'

export default function DirectionIcon({ direction, size = 18 }: { direction?: string; size?: number }) {
  const Icon = direction === 'Транспорт' ? BusFront : direction === 'Экология' ? Leaf
    : direction === 'Соцсфера' ? Users : direction === 'Безопасность' ? ShieldCheck
      : direction === 'Сервисы' ? Settings : LayoutGrid
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
}
