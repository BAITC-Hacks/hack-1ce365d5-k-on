import { indicatorLabels } from '../../data/presentation'
import type { IndicatorCode } from '../../types/city'

export function IndicatorBar({ code, value, color }: { code: IndicatorCode; value: number; color: string }) {
  return <div className={`indicator ${value < 40 ? 'critical' : ''}`}><div><span>{indicatorLabels[code]}</span><strong>{value}</strong></div><div className="indicator-track" role="progressbar" aria-label={indicatorLabels[code]} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: value < 40 ? '#e9957d' : color }} /></div></div>
}
