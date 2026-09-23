import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { APIError, chat, getCatalog, simulate } from '../src/api.ts'

const originalFetch = globalThis.fetch
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
  else delete globalThis.document
})

function stubFetch(body, status = 200) {
  const calls = []
  globalThis.fetch = async (path, options) => {
    calls.push({ path, ...options })
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }
  return calls
}

test('catalog starts a credentialed session without requiring a CSRF cookie', async () => {
  const catalog = { districts: [], measures: [] }
  const calls = stubFetch(catalog)
  const controller = new AbortController()
  assert.deepEqual(await getCatalog(controller.signal), catalog)
  assert.equal(calls[0].path, '/api/catalog')
  assert.equal(calls[0].credentials, 'same-origin')
  assert.equal(calls[0].signal, controller.signal)
  assert.equal(calls[0].method, 'GET')
})

test('simulation posts only canonical IDs with the CSRF cookie and retains partial AI failures', async () => {
  globalThis.document = { cookie: 'sessionid=player; csrftoken=abc%2B123' }
  const response = { simulation: { decisions: [], result: { score: 42 } }, advisor: { reply: null, error: { code: 'service_unavailable', message: 'AI unavailable' } } }
  const calls = stubFetch(response)
  assert.deepEqual(await simulate([{ measure_id: 'M12', district_id: null, score: 999, cost: 1 }]), response)
  assert.equal(calls[0].path, '/api/simulate')
  assert.equal(calls[0].headers['X-CSRFToken'], 'abc+123')
  assert.equal(calls[0].credentials, 'same-origin')
  assert.deepEqual(JSON.parse(calls[0].body), { decisions: [{ measure_id: 'M12', district_id: null }] })
})

test('chat sends only the message and surfaces structured provider errors', async () => {
  globalThis.document = { cookie: 'csrftoken=abc' }
  const calls = stubFetch({ error: { code: 'service_unavailable', message: 'Configure provider' } }, 503)
  await assert.rejects(chat('Hello'), (error) => error instanceof APIError && error.status === 503 && error.code === 'service_unavailable' && error.message === 'Configure provider')
  assert.deepEqual(JSON.parse(calls[0].body), { message: 'Hello' })
})

test('non-JSON proxy errors and offline requests are actionable', async () => {
  globalThis.fetch = async () => new Response('<html>Bad gateway</html>', { status: 502 })
  await assert.rejects(getCatalog(), (error) => error instanceof APIError && error.code === 'invalid_response')
  globalThis.fetch = async () => { throw new TypeError('offline') }
  await assert.rejects(getCatalog(), (error) => error instanceof APIError && error.code === 'network_error')
})

test('unmounted catalog request keeps its abort error', async () => {
  const controller = new AbortController()
  controller.abort()
  globalThis.fetch = async () => { throw controller.signal.reason }
  await assert.rejects(getCatalog(controller.signal), (error) => error.name === 'AbortError')
})
