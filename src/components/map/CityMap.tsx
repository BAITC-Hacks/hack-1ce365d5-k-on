import { useState } from 'react'
import type { CSSProperties } from 'react'
import { motion, useMotionValue } from 'framer-motion'
import { Layers, Minus, Navigation, Plus, RotateCcw, Building2 } from 'lucide-react'
import baseMap from '../../../map.png'
import { useCityStore } from '../../store/cityStore'
import { DistrictLayer } from './DistrictLayer'
import { DistrictMarker } from './DistrictMarker'
import { LandmarkLayer } from './LandmarkLayer'
import { RoadLayer } from './RoadLayer'
import { ProblemMarker } from './ProblemMarker'
import { Budget } from '../hud/Budget'

export function CityMap() {
  const [zoom, setZoom] = useState(1)
  const [tilted, setTilted] = useState(true)
  const [districtsVisible, setDistrictsVisible] = useState(true)
  const [buildingsVisible, setBuildingsVisible] = useState(true)
  const [imageError, setImageError] = useState(false)
  const districts = useCityStore((s) => s.districts)
  const selected = useCityStore((s) => s.selectedDistrict)
  const decisions = useCityStore((s) => s.decisions)
  const panX = useMotionValue(0)
  const panY = useMotionValue(0)
  const reset = () => { setZoom(1); panX.set(0); panY.set(0) }
  return <section className={`city-map ${selected ? 'has-selection' : ''}`} aria-label="Интерактивная карта Астаны">
    <div className="map-heading"><span className="eyebrow">ВАШ ГОРОД. ВАШИ РЕШЕНИЯ.</span><h1>Астана начинается<br />с вашего решения<span>.</span></h1><p>Выберите район на карте и начните менять город.</p></div>
    <div className="map-layer-controls"><button aria-pressed={districtsVisible} onClick={() => setDistrictsVisible(!districtsVisible)}><Layers size={14} />Районы</button><button aria-pressed={buildingsVisible} onClick={() => setBuildingsVisible(!buildingsVisible)}><Building2 size={14} />Объекты</button></div>
    <div className="map-compass"><span>N</span><Navigation size={29} strokeWidth={1} /><small>W <b>+</b> E</small></div>
    <div className="map-viewport">
      <motion.div className="map-pan" drag dragConstraints={{ left: -180, right: 180, top: -120, bottom: 120 }} dragElastic={0.15} dragMomentum={false} style={{ x: panX, y: panY }}>
        <div className="map-zoom" style={{ transform: `scale(${zoom})` }}>
          <div className={`map-world ${tilted ? 'tilted' : ''}`}>
            <div className="map-ground map-layer"><img src={baseMap} onError={() => setImageError(true)} alt="Карта городской структуры Астаны" draggable={false} />{imageError && <div className="map-fallback">Подложка недоступна · выберите район по метке</div>}</div>
            <DistrictLayer visible={districtsVisible} />
            <RoadLayer />
            {buildingsVisible && <LandmarkLayer />}
            <div className="map-layer problems-layer"><ProblemMarker /></div>
            <div className="map-layer effects-layer" aria-hidden="true">{decisions.map((decision) => {
              const district = districts.find((item) => item.name === decision.district)
              return district ? <span className="decision-beacon" key={decision.id} style={{ left: `${district.x}%`, top: `${district.y}%` } as CSSProperties} /> : null
            })}</div>
            <div className="map-layer ui-markers">{districts.map((district) => <DistrictMarker key={district.id} district={district} />)}</div>
          </div>
        </div>
      </motion.div>
    </div>
    <div className="map-budget"><Budget /></div>
    <div className="map-bottom-info"><span className="coordinate">51°10′ N &nbsp; 71°26′ E</span><span>АСТАНА, КАЗАХСТАН</span><small>Иллюстративная карта · условные границы</small></div>
    <div className="map-controls"><div className="map-view-toggle"><button aria-pressed={!tilted} onClick={() => setTilted(false)}>2D</button><button aria-pressed={tilted} onClick={() => setTilted(true)}>2.5D</button></div><div className="zoom-controls"><button onClick={() => setZoom(Math.min(1.7, zoom + 0.15))} disabled={zoom >= 1.7} aria-label="Приблизить карту"><Plus size={17} /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.max(0.7, zoom - 0.15))} disabled={zoom <= 0.7} aria-label="Отдалить карту"><Minus size={17} /></button><button onClick={reset} aria-label="Сбросить вид карты"><RotateCcw size={15} /></button></div></div>
  </section>
}
