import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { cityIssues, measuresForIssue } from '../src/city.ts'
const catalog=JSON.parse(await readFile(new URL('../akim_ai/catalog.json',import.meta.url)))

test('map pins show the catalog actual critical indicators, excluding the exact threshold',()=>{
 const issues=cityIssues(catalog)
 assert.deepEqual(issues.map(({districtId,indicatorId,value})=>({districtId,indicatorId,value})),[
  {districtId:'NURA',indicatorId:'S2',value:35},
  {districtId:'NURA',indicatorId:'S1',value:38},
 ])
})

test('successful engine indicators replace initial problems and do not leave stale pins',()=>{
 const indicators=Object.fromEntries(catalog.districts.map(d=>[d.id,{...d.initial_indicators}]))
 indicators.NURA.S1=48
 indicators.NURA.S2=43.75
 assert.deepEqual(cityIssues(catalog,indicators),[])
 indicators.ESIL.T1=39
 const issues=cityIssues(catalog,indicators)
 assert.equal(issues.length,1)
 assert.equal(issues[0].districtId,'ESIL')
 assert.equal(issues[0].indicatorId,'T1')
})

test('problem popup recommends only measures with a positive catalog effect',()=>{
 const issue=cityIssues(catalog).find(item=>item.indicatorId==='S2')
 assert.deepEqual(measuresForIssue(catalog,issue).map(measure=>measure.id),['M8','M9'])
})
