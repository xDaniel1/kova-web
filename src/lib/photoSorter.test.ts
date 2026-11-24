import { describe, expect, it } from 'vitest'
import { categoryOf } from './photoSorter'

const probs = (hits: Record<number, number>, classes = 1000) => {
  const p = new Float32Array(classes)
  const offset = classes === 1001 ? 1 : 0
  for (const [k, v] of Object.entries(hits)) p[Number(k) + offset] = v
  return p
}

describe('photo categories', () => {
  it('reads a menu', () => {
    expect(categoryOf(probs({ 922: 0.6 }))).toBe('menu')
    expect(categoryOf(probs({ 922: 0.4, 963: 0.3 }))).toBe('menu')
    // a tray of burgers laid out in a grid scored 0.32 on "menu": not a menu
    expect(categoryOf(probs({ 922: 0.32, 868: 0.11 }))).not.toBe('menu')
  })
  it('reads food and drink across many classes', () => {
    expect(categoryOf(probs({ 963: 0.5 }))).toBe('food') // pizza
    expect(categoryOf(probs({ 967: 0.15, 968: 0.15 }))).toBe('food') // espresso + cup
    expect(categoryOf(probs({ 441: 0.4 }))).toBe('food') // beer glass
  })
  it('reads the room', () => {
    expect(categoryOf(probs({ 762: 0.5 }))).toBe('atmosphere') // restaurant
    expect(categoryOf(probs({ 532: 0.2, 706: 0.1 }))).toBe('atmosphere') // dining table + patio
  })
  it('food wins over the room when it is the larger share', () => {
    expect(categoryOf(probs({ 963: 0.4, 762: 0.3 }))).toBe('food')
    expect(categoryOf(probs({ 963: 0.26, 762: 0.5 }))).toBe('atmosphere')
  })
  it('leaves an unclear photo unsorted', () => {
    expect(categoryOf(probs({ 1: 0.9 }))).toBeNull()
    expect(categoryOf(probs({ 963: 0.1, 762: 0.1 }))).toBeNull()
  })
  it('handles the 1001-class output with a background class first', () => {
    expect(categoryOf(probs({ 922: 0.7 }, 1001))).toBe('menu')
    expect(categoryOf(probs({ 762: 0.7 }, 1001))).toBe('atmosphere')
  })
})
