import { describe, expect, it } from 'vitest'
import { getAuditTrail, makers, nextStage } from './rfqEngine'

describe('Cinder RFQ demo engine', () => {
  it('selects the tightest maker quote', () => {
    const selected = makers.filter((maker) => maker.selected)
    expect(selected).toHaveLength(1)
    expect(selected[0].spreadBps).toBe(Math.min(...makers.map((maker) => maker.spreadBps)))
  })

  it('advances through the settlement flow in order', () => {
    expect(nextStage('draft')).toBe('quoted')
    expect(nextStage('quoted')).toBe('matched')
    expect(nextStage('matched')).toBe('paid')
    expect(nextStage('paid')).toBe('settled')
    expect(nextStage('settled')).toBe('settled')
  })

  it('marks FDC release active before final settlement', () => {
    const trail = getAuditTrail('paid')
    expect(trail.at(-1)?.label).toBe('FDC attestation')
    expect(trail.at(-1)?.status).toBe('active')
  })
})
