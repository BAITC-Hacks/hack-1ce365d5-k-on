import { useEffect } from 'react'
import { AnimatePresence, MotionConfig } from 'framer-motion'
import { CityPage } from './pages/CityPage'
import { ResultPage } from './pages/ResultPage'
import { useCityStore } from './store/cityStore'
import './App.css'

export default function App() {
  const result = useCityStore((state) => state.simulationResult)
  const initialize = useCityStore((state) => state.initialize)
  useEffect(() => { void initialize() }, [initialize])
  return <MotionConfig reducedMotion="user"><AnimatePresence mode="wait">{result ? <ResultPage key="result" /> : <CityPage key="city" />}</AnimatePresence></MotionConfig>
}
