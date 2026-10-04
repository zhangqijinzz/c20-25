import { describe, expect, it } from 'vitest'
import { createPlan, createItem } from '../../../shared/models'
import {
  analyzeLayout,
  canPlaceItem,
  findFitOffset,
  getBoundsViolation,
  getItemBounds,
  getItemCorners,
  normalizeRotation,
  orientedBoxesOverlap,
  snapRotation,
} from '../../../shared/layoutRules'

describe('workspace rules', () => {
  it('normalizes rotation and calculates rotated bounds around the item center', () => {
    const item = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    const bounds = getItemBounds(item)
    expect(normalizeRotation(-15)).toBe(345)
    expect(Math.round(bounds.width)).toBe(200)
    expect(Math.round(bounds.height)).toBe(400)
    expect(Math.round(bounds.left)).toBe(200)
  })

  it('uses the real rotated shape (OBB) instead of axis-aligned boxes for overlap', () => {
    // 一条横放长条和一条竖放长条：y 方向外接框相交（[80,120]），
    // 但 x 方向真实形状之间还隔着 20mm 空隙，不应判为压住
    const first = { ...createItem('monitor'), x: 50, y: 80, widthMm: 270, heightMm: 40, rotation: 0 }
    const second = { ...createItem('monitor'), x: 340, y: 50, widthMm: 40, heightMm: 300, rotation: 0 }
    expect(orientedBoxesOverlap(first, second)).toBe(false)
    const plan = createPlan('test', false)
    const analysis = analyzeLayout({ ...plan, items: [first, second] })
    expect(analysis.overlapIds).toHaveLength(0)
  })

  it('reports overlap when rotated shapes actually touch', () => {
    const first = { ...createItem('monitor'), x: 100, y: 100, widthMm: 200, heightMm: 200, rotation: 45 }
    const second = { ...createItem('keyboard'), x: 250, y: 250, widthMm: 200, heightMm: 200, rotation: 10 }
    expect(orientedBoxesOverlap(first, second)).toBe(true)
  })

  it('detects overlap and out-of-bounds items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200 }
    const second = { ...createItem('keyboard'), x: 300, y: 150, widthMm: 400, heightMm: 200 }
    const outside = { ...createItem('lamp'), x: 1500, y: 700 }
    const analysis = analyzeLayout({ ...plan, items: [first, second, outside] })
    expect(analysis.overlapIds).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(analysis.outOfBoundsIds).toContain(outside.id)
    expect(analysis.status).toBe('attention')
  })

  it('returns a healthy state for separated items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100 }
    const second = { ...createItem('keyboard'), x: 800, y: 500 }
    const analysis = analyzeLayout({ ...plan, items: [first, second] })
    expect(analysis.status).toBe('clear')
    expect(analysis.coveragePercent).toBeGreaterThan(0)
  })

  it('snaps arbitrary angles to the nearest common gear', () => {
    expect(snapRotation(22)).toBe(0)
    expect(snapRotation(23)).toBe(45)
    expect(snapRotation(350)).toBe(0)
    expect(snapRotation(91)).toBe(90)
  })

  it('reports overflow amounts per edge from the real rotated footprint', () => {
    const plan = createPlan('test', false)
    const item = { ...createItem('monitor'), x: 0, y: 0, widthMm: 400, heightMm: 200, rotation: 45 }
    const violation = getBoundsViolation(item, plan.deskWidthMm, plan.deskHeightMm)
    const corner = getItemCorners(item)
    expect(violation.left).toBeCloseTo(-Math.min(...corner.map((point) => point.x)))
    expect(violation.top).toBeCloseTo(-Math.min(...corner.map((point) => point.y)))
    expect(violation.right).toBe(0)
    expect(violation.bottom).toBe(0)
  })

  it('finds the nearest offset that fits while keeping the current angle', () => {
    const plan = createPlan('test', false)
    // 放在桌面右下边缘、旋转 90° 后必然越界
    const item = { ...createItem('monitor'), x: 1400, y: 650, widthMm: 400, heightMm: 200, rotation: 90 }
    expect(canPlaceItem(plan, item)).toBe(false)
    const offset = findFitOffset(plan, item)
    expect(offset).not.toBeNull()
    const moved = { ...item, x: item.x + offset!.dx, y: item.y + offset!.dy }
    expect(canPlaceItem(plan, moved)).toBe(true)
  })

  it('returns zero offset when the item already fits and null when the desk cannot hold it', () => {
    const plan = createPlan('test', false)
    const fitting = { ...createItem('lamp'), x: 100, y: 100, rotation: 30 }
    expect(findFitOffset(plan, fitting)).toEqual({ dx: 0, dy: 0 })
    const tooLarge = { ...createItem('monitor'), x: 0, y: 0, widthMm: 400, heightMm: 200, rotation: 45 }
    const tinyDesk = { ...plan, deskWidthMm: 100, deskHeightMm: 100 }
    expect(findFitOffset(tinyDesk, tooLarge)).toBeNull()
  })

  it('avoids other devices when searching for a fit position', () => {
    const plan = createPlan('test', false)
    const blocker = { ...createItem('monitor'), x: 700, y: 300, widthMm: 200, heightMm: 200 }
    const item = { ...createItem('keyboard'), x: 700, y: 300, widthMm: 200, heightMm: 200, rotation: 45 }
    const crowded = { ...plan, items: [blocker] }
    const offset = findFitOffset(crowded, item)
    expect(offset).not.toBeNull()
    const moved = { ...item, x: item.x + offset!.dx, y: item.y + offset!.dy }
    expect(canPlaceItem(crowded, moved)).toBe(true)
  })
})
