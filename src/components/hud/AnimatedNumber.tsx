import { animate, useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'

export function AnimatedNumber({ value, from = value }: { value: number; from?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (reducedMotion) { if (ref.current) ref.current.textContent = value.toFixed(2); return }
    const controls = animate(from, value, { duration: 1.5, ease: 'easeOut', onUpdate: (latest) => { if (ref.current) ref.current.textContent = latest.toFixed(2) } })
    return () => controls.stop()
  }, [value, from, reducedMotion])
  return <span ref={ref}>{value.toFixed(2)}</span>
}
