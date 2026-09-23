import assert from 'node:assert/strict'
import { createServer } from 'vite'

// Exercise the public API and store boundary without adding a test dependency.
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-test', ssr: { external: ['react', 'zustand'] }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { mockApi } = await server.ssrLoadModule('/src/api/mock.ts')
  const { decisionsPayload } = await server.ssrLoadModule('/src/api/client.ts')
  const { useCityStore } = await server.ssrLoadModule('/src/store/cityStore.ts')
  const example = [{ id: 'M7', district: 'Nura' }, { id: 'M8', district: 'Nura' }, { id: 'M10', district: 'Nura' }, { id: 'M12' }, { id: 'M5', district: 'Saryarka' }]
  const validation = await mockApi.validateDecisions({ decisions: example })
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.budget, { total: 100, spent: 95, remaining: 5 })
  assert.equal((await mockApi.getDistricts()).find((d) => d.id === 'nura').indicators.S2, 35)
  assert.equal((await mockApi.getMeasures()).length, 14)
  const cases = [
    ['count', []],
    ['unknown', [{ id: 'M99' }]],
    ['duplicate', [{ id: 'M12' }, { id: 'M12' }]],
    ['district', [{ id: 'M7' }]],
    ['district', [{ id: 'M7', district: 'Unknown' }]],
    ['city', [{ id: 'M12', district: 'Nura' }]],
    ['direction', ['M7', 'M8', 'M9'].map((id) => ({ id, district: 'Nura' }))],
    ['conflict', [{ id: 'M1', district: 'Nura' }, { id: 'M3', district: 'Esil' }]],
    ['conflict', [{ id: 'M4', district: 'Nura' }, { id: 'M7', district: 'Nura' }]],
    ['conflict', [{ id: 'M5', district: 'Almaty' }, { id: 'M13', district: 'Almaty' }]],
    ['budget', [{ id: 'M3', district: 'Esil' }, { id: 'M7', district: 'Nura' }, { id: 'M8', district: 'Nura' }, { id: 'M13', district: 'Almaty' }, { id: 'M6' }]],
  ]
  for (const [code, decisions] of cases) {
    const result = await mockApi.validateDecisions({ decisions })
    assert.equal(result.valid, false, code)
    assert.ok(result.issues.some((issue) => issue.code === code), code)
  }
  const differentDistricts = await mockApi.validateDecisions({ decisions: [{ id: 'M4', district: 'Esil' }, { id: 'M7', district: 'Nura' }] })
  assert.ok(!differentDistricts.issues.some((issue) => issue.code === 'conflict'))
  await assert.rejects(() => mockApi.simulateDecisions({ decisions: [] }))
  assert.deepEqual(decisionsPayload({ decisions: [{ id: 'M12', score: 999, effects: [] }, { id: 'M7', district: 'Nura', budget: 9 }] }), { decisions: [{ id: 'M12' }, { id: 'M7', district: 'Nura' }] })
  await useCityStore.getState().initialize()
  await useCityStore.getState().addDecision({ id: 'M1', district: 'Nura' })
  await useCityStore.getState().addDecision({ id: 'M3', district: 'Esil' })
  assert.equal(useCityStore.getState().decisions.length, 1, 'conflicting proposal must not enter the plan')
  assert.equal(useCityStore.getState().budget.remaining, 82)
  assert.ok(useCityStore.getState().error.includes('несовместимы'))
  const result = await mockApi.simulateDecisions({ decisions: example })
  assert.equal(result.mode, 'demo')
  assert.equal(result.finalScore, 56.5)
  assert.equal(result.budget.remaining, 5)
  assert.ok((await mockApi.getAiAnalysis(result.id)).recommendations.length)
  console.log('PASS: catalogue, 11 invalid cases, valid 95-unit example, conflicts, payload isolation, store rejection and demo result.')
} finally { await server.close() }
