import { AlertCircle } from 'lucide-react'
import { useCityStore } from '../../store/cityStore'

export function ProblemMarker() {
  const select = useCityStore((s) => s.selectDistrict)
  return <div className="problem-anchor map-anchor" style={{ left: '32%', top: '67%' }}><button className="problem-marker billboard" onClick={() => select('nura')} aria-label="Нура: 2 критических показателя"><AlertCircle size={16} /><span>2</span></button></div>
}
