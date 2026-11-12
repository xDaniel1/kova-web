import { describe, expect, it } from 'vitest'
import { ageLabel, isReportRow } from './reports'

describe('ageLabel', () => {
  const now = Date.parse('2026-11-09T12:00:00Z')
  it('never says zero minutes', () => {
    expect(ageLabel('2026-11-09T11:59:50Z', now)).toBe('1 min ago')
  })
  it('counts minutes then hours', () => {
    expect(ageLabel('2026-11-09T11:35:00Z', now)).toBe('25 min ago')
    expect(ageLabel('2026-11-09T10:05:00Z', now)).toBe('2 hr ago')
  })
})

describe('shared incident rows', () => {
  const row = { id: 'report', user_id: 'owner', kind: 'Speed Trap', latitude: 28.4, longitude: -81.3, created_at: '2026-11-09T12:00:00Z' }
  it('accepts the iOS Speed Trap kind', () => expect(isReportRow(row)).toBe(true))
  it('ignores unknown kinds and malformed coordinates or timestamps', () => {
    expect(isReportRow({ ...row, kind: '<img src=x onerror=alert(1)>' })).toBe(false)
    expect(isReportRow({ ...row, latitude: NaN })).toBe(false)
    expect(isReportRow({ ...row, longitude: 181 })).toBe(false)
    expect(isReportRow({ ...row, created_at: 'bad' })).toBe(false)
  })
})
