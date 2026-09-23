import { useId, useState } from 'react'
import { Bus, Check, Hospital, Leaf, MapPin, Minus, Plus, RotateCcw, School, Shield, TriangleAlert, Wrench } from 'lucide-react'
import type { Catalog, Decision } from '../api'
import type { CityIssue } from '../city'
import './CityMap.css'

type Props = {
  catalog: Catalog
  selectedDistrictId: string
  onSelectDistrict: (id: string) => void
  issues: CityIssue[]
  onOpenIssue: (issue: CityIssue) => void
  decisions: Decision[]
  districtScores?: Record<string, unknown>
  busy?: boolean
}

const regions = [
  { id: 'SARYARKA', points: '130,95 275,55 360,145 310,260 165,294 74,206', x: 224, y: 168 },
  { id: 'BAIKONUR', points: '360,145 275,55 520,38 580,88 718,115 672,247 516,292 434,215', x: 503, y: 142 },
  { id: 'ALMATY', points: '516,292 672,247 718,115 775,245 708,366 604,461 463,482 448,375', x: 630, y: 325 },
  { id: 'ESIL', points: '310,260 434,215 516,292 448,375 463,482 275,468 205,388', x: 370, y: 369 },
  { id: 'NURA', points: '165,294 310,260 205,388 275,468 132,440 71,337 74,206', x: 169, y: 353 },
]
const offsets = [[-41, 39], [9, 57], [55, 31], [-64, -10], [63, -16], [-31, -51], [20, -52], [-8, 98], [83, 65], [-80, 61]]
function IssueIcon({ id }: { id: string }) {
  const Icon = id === 'S1' ? School : id === 'S2' ? Hospital : id.startsWith('T') ? Bus : id.startsWith('E') ? Leaf : id.startsWith('B') ? Shield : id.startsWith('C') ? Wrench : TriangleAlert
  return <Icon x={-9} y={-9} width={18} height={18} strokeWidth={1.8} aria-hidden="true" />
}

export default function CityMap({ catalog, selectedDistrictId, onSelectDistrict, issues, onOpenIssue, decisions, districtScores = {}, busy = false }: Props) {
  const [zoom, setZoom] = useState(1)
  const id = useId().replace(/:/g, '')
  const visibleRegions = regions.map((region) => ({ ...region, district: catalog.districts.find((district) => district.id === region.id) })).filter((region): region is typeof region & { district: Catalog['districts'][number] } => Boolean(region.district))
  const width = 820 / zoom
  const height = 520 / zoom
  const viewBox = `${410 - width / 2} ${260 - height / 2} ${width} ${height}`
  const cityDecisions = decisions.filter((decision) => decision.district_id === null)
  return <div className="city-map-shell">
    <div className="city-map-topline"><span><MapPin size={13} aria-hidden="true" /> ИГРОВАЯ КАРТА АСТАНЫ</span><span className="map-live"><i /> {issues.length} {issues.length === 1 ? 'проблема' : 'проблем'}</span></div>
    <div className="city-map-canvas">
      <svg className="city-map-svg" viewBox={viewBox} role="group" aria-label="Интерактивная карта районов Астаны" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id={`${id}-grid`} width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#1c3540" strokeWidth=".5" /></pattern>
          <pattern id={`${id}-blocks`} width="55" height="43" patternUnits="userSpaceOnUse" patternTransform="rotate(-17)"><path d="M0 0H55V43H0Z" fill="none" stroke="#467174" strokeWidth="2" opacity=".35"/><rect x="7" y="7" width="15" height="12" rx="1" fill="#4a7575" opacity=".35"/><rect x="27" y="7" width="21" height="12" rx="1" fill="#41696c" opacity=".4"/><rect x="7" y="24" width="22" height="12" rx="1" fill="#477472" opacity=".3"/><rect x="35" y="24" width="13" height="12" rx="1" fill="#55847d" opacity=".35"/></pattern>
          <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" /></filter>
          <clipPath id={`${id}-city`}>{visibleRegions.map((region) => <polygon key={region.id} points={region.points} />)}</clipPath>
        </defs>
        <rect x="-400" y="-300" width="1600" height="1100" fill={`url(#${id}-grid)`} />
        <g className="map-outskirts" fill="none" stroke="#26474d" strokeWidth="2"><path d="M-30 164 166 11 412 -24 715 19 859 172 785 439 525 572 251 538 3 369Z"/><path d="M-42 202 156 -12M776 59 936 282M28 441 354 594"/></g>
        {visibleRegions.map(({ district, ...region }) => {
          const selected = district.id === selectedDistrictId
          const critical = issues.some((issue) => issue.districtId === district.id)
          return <g key={district.id} className={`map-region ${selected ? 'is-selected' : ''} ${critical ? 'is-critical' : ''}`}>
            {selected && <polygon points={region.points} className="map-region-glow" filter={`url(#${id}-glow)`} aria-hidden="true" />}
            <polygon points={region.points} className="map-region-fill" role="button" tabIndex={busy ? -1 : 0} aria-label={`Выбрать район ${district.name}`} aria-pressed={selected} aria-disabled={busy} onClick={() => { if (!busy) onSelectDistrict(district.id) }} onKeyDown={(event) => { if (!busy && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelectDistrict(district.id) } }}><title>{district.name} — выбрать район</title></polygon>
          </g>
        })}
        <g clipPath={`url(#${id}-city)`} pointerEvents="none">
          <rect x="30" y="20" width="780" height="490" fill={`url(#${id}-blocks)`} />
          <g fill="#2b6351" stroke="#438569" strokeWidth="1" opacity=".7"><path d="m105 129 67-27 16 32-66 30Z"/><path d="m298 81 46-14 37 34-50 19Z"/><path d="m566 389 53-26 24 23-50 36Z"/><path d="m281 412 51-16 19 41-47 11Z"/><path d="m521 185 53 7-8 31-37-4Z"/></g>
          <g fill="none" strokeLinecap="round"><path d="M38 181 346 80 602 188 790 347M156 69 259 257 450 450M427 25 373 205 565 484M74 397 726 180" stroke="#77928a" strokeWidth="8" opacity=".22"/><path d="M38 181 346 80 602 188 790 347M156 69 259 257 450 450M427 25 373 205 565 484M74 397 726 180" stroke="#b1b494" strokeWidth="1.3" opacity=".48"/></g>
        </g>
        <g pointerEvents="none"><path d="M-25 274C120 218 136 263 244 294S381 338 449 305 510 258 574 277 692 236 845 170" fill="none" stroke="#183b48" strokeWidth="22"/><path d="M-25 274C120 218 136 263 244 294S381 338 449 305 510 258 574 277 692 236 845 170" fill="none" stroke="#29687a" strokeWidth="12"/><path d="M-25 274C120 218 136 263 244 294S381 338 449 305 510 258 574 277 692 236 845 170" fill="none" stroke="#4a9aaa" strokeWidth="1" opacity=".6"/><g stroke="#a7b6a6" strokeWidth="5"><path d="m247 281-7 29M414 306l11 23M633 244l11 25"/></g><text x="288" y="304" className="map-river-label" transform="rotate(14 288 304)">ЕСИЛЬ</text></g>
        <g className="map-landmark" transform="translate(406 421)" pointerEvents="none"><ellipse cy="19" rx="17" ry="5" fill="#051c27"/><path d="M-7 16 0-16 7 16M-11 16H11M-4 3H4" fill="none" stroke="#c9bc81" strokeWidth="2"/><circle cy="-17" r="7" fill="#d7bd70" stroke="#f0ddb0"/><text x="22" y="8">Байтерек</text></g>
        {visibleRegions.map(({ district, x, y }) => {
          const score = districtScores[district.id]
          const subtitle = typeof score === 'number' && Number.isFinite(score) ? `${score.toFixed(1)} · результат` : district.population_share !== undefined ? `${Math.round(district.population_share * 100)}% населения` : 'Выбрать район'
          return <g key={district.id} transform={`translate(${x} ${y})`} className={`map-district-label ${district.id === selectedDistrictId ? 'is-selected' : ''}`} pointerEvents="none"><rect x="-57" y="-21" width="114" height="44" rx="8"/><text textAnchor="middle" y="-2">{district.name}</text><text textAnchor="middle" y="13" className="map-label-detail">{subtitle}</text></g>
        })}
        {issues.map((issue) => {
          const region = visibleRegions.find((item) => item.district.id === issue.districtId)
          if (!region) return null
          const index = issues.filter((item) => item.districtId === issue.districtId).indexOf(issue)
          const [dx, dy] = offsets[index % offsets.length]
          return <g key={`${issue.districtId}-${issue.indicatorId}`} transform={`translate(${region.x + dx} ${region.y + dy})`} className="map-issue-pin" role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy} aria-label={`${issue.districtName}: ${issue.indicatorName}, показатель ${issue.value} — открыть проблему`} onClick={() => { if (!busy) onOpenIssue(issue) }} onKeyDown={(event) => { if (!busy && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenIssue(issue) } }}><title>{issue.indicatorName}: {issue.value} / 100. Открыть проблему</title><circle r="25" className="map-pin-hit"/><g className="map-pin-visual"><circle r="21" className="map-pin-halo"/><path d="M-15-14Q-15-19-10-19H10Q15-19 15-14V9Q15 14 10 14H4L0 21-4 14H-10Q-15 14-15 9Z" className="map-pin-body"/><IssueIcon id={issue.indicatorId}/><circle cx="12" cy="-15" r="4" className="map-pin-dot"/></g></g>
        })}
        {visibleRegions.map(({ district, x, y }) => {
          const placed = decisions.filter((decision) => decision.district_id === district.id)
          return placed.length > 0 && <g key={district.id} transform={`translate(${x - 49} ${y + 88})`} className="map-placement" pointerEvents="none"><title>{placed.map((decision) => catalog.measures.find((measure) => measure.id === decision.measure_id)?.name ?? decision.measure_id).join(', ')}</title><rect width="98" height="24" rx="12"/><Check x="8" y="5" width="14" height="14"/><text x="29" y="16">Мер в плане: {placed.length}</text></g>
        })}
      </svg>
      <div className="map-compass" aria-hidden="true"><span>С</span><i /><span>Ю</span></div>
      <div className="map-controls" aria-label="Масштаб карты"><button type="button" aria-label="Увеличить карту" disabled={zoom >= 1.8} onClick={() => setZoom((value) => Math.min(1.8, value + .2))}><Plus size={17}/></button><button type="button" aria-label="Уменьшить карту" disabled={zoom <= .8} onClick={() => setZoom((value) => Math.max(.8, value - .2))}><Minus size={17}/></button><button type="button" aria-label="Сбросить масштаб карты" onClick={() => setZoom(1)}><RotateCcw size={15}/></button></div>
      <div className="map-instruction">Выберите район или нажмите на значок проблемы</div>
      {cityDecisions.length > 0 && <div className="map-city-plans"><Check size={13} aria-hidden="true" /> Весь город: {cityDecisions.length} мер в плане</div>}
    </div>
    <div className="city-map-bottom"><span><i className="map-key-selected"/>Выбранный район</span><span><i className="map-key-issue"/>Проблема</span><small>Игровая карта · условные границы</small></div>
  </div>
}
