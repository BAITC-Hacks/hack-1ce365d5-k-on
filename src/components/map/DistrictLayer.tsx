import overlay from '../../../separated regions.png'
import { districtPaths } from '../../data/mapGeometry'
import { useCityStore } from '../../store/cityStore'

export function DistrictLayer({ visible }: { visible: boolean }) {
  const districts = useCityStore((s) => s.districts)
  const selected = useCityStore((s) => s.selectedDistrict)
  const select = useCityStore((s) => s.selectDistrict)
  return <div className={`district-layer map-layer ${visible ? '' : 'layer-hidden'}`}>
    <img className="district-art" src={overlay} alt="" draggable={false} />
    <svg viewBox="0 0 1536 1024" className="district-hit-areas" aria-hidden="true">
      {districts.map((district) => <path key={district.id} d={districtPaths[district.id]} onClick={() => select(district.id)} className={selected === district.id ? 'selected' : ''} style={{ color: district.color }} />)}
    </svg>
  </div>
}
