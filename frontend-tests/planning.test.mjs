import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { canAddDecision, planCost, validatePlan } from '../src/planning.ts'

const catalog = JSON.parse(await readFile(new URL('../akim_ai/catalog.json', import.meta.url)))
const district = (measure_id, district_id = 'NURA') => ({ measure_id, district_id })
const city = (measure_id) => ({ measure_id, district_id: null })
const plan = [district('M7'), district('M8'), district('M10'), city('M12'), district('M5', 'SARYARKA')]

test('real catalog plan totals 95 and is complete without mutating it', () => {
  const before = structuredClone(plan)
  assert.equal(planCost(catalog, plan), 95)
  assert.deepEqual(validatePlan(catalog, plan), [])
  assert.deepEqual(plan, before)
})

test('building an incomplete plan is allowed but running requires five', () => {
  assert.equal(canAddDecision(catalog, [], plan[0]), null)
  assert.match(validatePlan(catalog, [plan[0]])[0], /5/)
  assert.match(canAddDecision(catalog, plan, city('M14')), /5/)
})

test('client validates unique measures, direction limits, and budget', () => {
  assert.match(canAddDecision(catalog, [district('M7')], district('M7', 'ESIL')), /один раз/)
  assert.match(canAddDecision(catalog, [district('M7'), district('M8')], district('M9')), /не более 2/)
  assert.match(canAddDecision(catalog, [district('M3'), district('M5'), district('M7')], district('M13', 'ESIL')), /Бюджет/)
})

test('global conflicts apply across districts; local conflicts apply only within one district', () => {
  assert.match(canAddDecision(catalog, [district('M1')], district('M3', 'ESIL')), /Несовместимые/)
  assert.match(canAddDecision(catalog, [district('M4')], district('M7')), /В одном районе/)
  assert.equal(canAddDecision(catalog, [district('M4')], district('M7', 'ESIL')), null)
})

test('city scope requires null and district scope requires an existing ID', () => {
  for (const decision of [district('M12'), city('M7'), district('M7', 'unknown')]) {
    assert.match(canAddDecision(catalog, [], decision), /корректный район/)
  }
})
