import assert from 'node:assert/strict'
import { createServer } from 'vite'

const memory = new Map()
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-studio-test', ssr: { external: ['react', 'zustand'] }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { createProject, validateProject, importReport, targets } = await server.ssrLoadModule('/src/studio/model.ts')
  const { screenToPlane } = await server.ssrLoadModule('/src/studio/projection.ts')
  const { createReport, reportMarkdown } = await server.ssrLoadModule('/src/studio/report.ts')
  const { useStudioStore: store } = await server.ssrLoadModule('/src/studio/store.ts')
  const project = createProject()
  assert.equal(new Set(targets.map((t) => t.id)).size, 22)
  project.profiles.desktop.elements['landmark:baiterek'] = { x: 52.5, y: 44, scale: 1.2, note: 'Убрать перекрытие подписи' }
  project.profiles.mobile.elements.budget = { x: -18, y: 24, width: 155, height: null, locked: true }
  assert.deepEqual(validateProject(project), project)
  assert.equal(project.profiles.laptop.elements.budget, undefined)
  const report = createReport(project, {}, [])
  assert.deepEqual(importReport(JSON.stringify(report)), project)
  assert.ok(reportMarkdown(report).includes('src/data/landmarks.ts'))
  assert.ok(reportMarkdown(report).includes('не проверен'))
  for (const patch of [{ x: 101 }, { scale: 0 }, { hidden: 'true' }, { note: 'a'.repeat(2001) }, { transform: 'translate(1px)' }, { constructor: {} }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
    const invalid = structuredClone(project)
    invalid.profiles.desktop.elements['landmark:baiterek'] = patch
    assert.throws(() => validateProject(invalid))
  }
  assert.equal({}.polluted, undefined)
  assert.throws(() => importReport('{'))
  assert.throws(() => importReport(JSON.stringify({ ...report, schemaVersion: 9 })))
  assert.throws(() => importReport(' '.repeat(2_000_001)))
  const invalidCamera = createProject()
  invalidCamera.profiles.desktop.camera.tilt = NaN
  assert.throws(() => validateProject(invalidCamera))
  const fakeSnapshot = { layoutFingerprint: JSON.stringify(project.profiles.desktop), profile: 'desktop', targets: [], issues: [], viewport: { width: 1440, height: 900 } }
  assert.ok(createReport(project, { desktop: fakeSnapshot }, []).snapshots.desktop)
  const modified = structuredClone(project)
  modified.profiles.desktop.camera.tilt = 10
  assert.equal(createReport(modified, { desktop: fakeSnapshot }, []).snapshots.desktop, undefined, 'stale geometry must not be exported')

  // Known homography: a CSS-like projective plane with rotation/shear/offset.
  const projectPoint = ({ x, y }) => ({ x: (800 * x - 160 * y + 220) / (0.1 * x + 0.45 * y + 1), y: (120 * x + 500 * y + 80) / (0.1 * x + 0.45 * y + 1) })
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => projectPoint({ x, y }))
  for (const [x, y] of [[0, 0], [1, 1], [0.49, 0.56], [0.75, 0.31], [-0.1, 1.2]]) {
    const result = screenToPlane(projectPoint({ x, y }), corners)
    assert.ok(Math.abs(result.x - x) < 1e-8 && Math.abs(result.y - y) < 1e-8)
  }
  assert.equal(screenToPlane({ x: 1, y: 1 }, Array(4).fill({ x: 0, y: 0 })), null)
  assert.equal(screenToPlane({ x: 1, y: 1 }, []), null)

  store.getState().updateElement('landmark:baiterek', { x: 57, y: 51 })
  store.getState().setProfile('mobile')
  assert.deepEqual(store.getState().project.profiles.mobile.elements, {})
  store.getState().updateElement('budget', { x: 22 })
  store.getState().undo()
  assert.deepEqual(store.getState().project.profiles.mobile.elements, {})
  store.getState().redo()
  assert.equal(store.getState().project.profiles.mobile.elements.budget.x, 22)
  store.getState().resetProfile()
  assert.deepEqual(store.getState().project.profiles.mobile.elements, {})
  assert.equal(store.getState().project.profiles.desktop.elements['landmark:baiterek'].x, 57)
  store.getState().undo()
  assert.equal(store.getState().project.profiles.mobile.elements.budget.x, 22)
  const beforeCamera = store.getState().undoStack.length
  store.getState().updateCamera({ tilt: 32 })
  store.getState().updateCamera({ tilt: 33 })
  assert.equal(store.getState().undoStack.length, beforeCamera + 1, 'slider changes coalesce')
  store.getState().undo()
  assert.equal(store.getState().project.profiles.mobile.camera.tilt, 48)
  await new Promise((resolve) => setTimeout(resolve, 450))
  assert.deepEqual(validateProject(JSON.parse(memory.get('astana-layout-studio:v1'))), store.getState().project)
  console.log('PASS: 22 targets, safe import, JSON round trip, stale metrics filtering, perspective inverse, independent profiles, undo/redo/reset, coalescing and autosave.')
} finally { await server.close() }
