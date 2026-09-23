import type { CSSProperties } from 'react'
import { Crosshair } from 'lucide-react'
import type { District } from '../../types/city'
import { useCityStore } from '../../store/cityStore'

export function DistrictMarker({ district }: { district: District }) {
  const selected = useCityStore((s) => s.selectedDistrict === district.id)
  const select = useCityStore((s) => s.selectDistrict)
  return <div className="district-anchor map-anchor" style={{ left: `${district.x}%`, top: `${district.y}%`, '--district-color': district.color } as CSSProperties}>
    <button className={`district-marker billboard ${selected ? 'active' : ''}`} onClick={() => select(district.id)} aria-pressed={selected} aria-label={`Выбрать район ${district.label}`}>
      <span className="district-marker-name">{selected && <Crosshair size={11} />}{district.label}</span><strong>{district.baseScore.toFixed(2)}</strong><span className="marker-dot" />
    </button>
  </div>
}
