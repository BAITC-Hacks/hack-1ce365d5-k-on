import iconSheet from '../../icons.png'
import type { Direction } from '../types/city'

const positions: Record<Direction, number> = { transport: 31, ecology: 141, social: 253, safety: 365, services: 480 }
export function DirectionIcon({ direction, size = 36 }: { direction: Direction; size?: number }) {
  return <svg className="direction-icon" width={size} height={size} viewBox={`${positions[direction]} 331 80 76`} aria-hidden="true"><image href={iconSheet} width="1536" height="1024" /></svg>
}
