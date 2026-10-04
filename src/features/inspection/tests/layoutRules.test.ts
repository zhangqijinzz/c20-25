import { describe, expect, it } from 'vitest'
import { createPlan, createItem } from '../../../shared/models'
import {
  analyzeLayout,
  diagnosePlacement,
  findFittablePosition,
  getItemBounds,
  getItemCorners,
  normalizeRotation,
  orientedRectanglesOverlap,
  snapRotation,
} from '../../../shared/layoutRules'

describe('workspace rules', () => {
  it('normalizes rotation and calculates rotated bounds around the item center', () => {
    const item = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    const bounds = getItemBounds(item)
    expect(normalizeRotation(-15)).toBe(345)
    expect(normalizeRotation(380)).toBe(20)
    expect(Math.round(bounds.width)).toBe(200)
    expect(Math.round(bounds.height)).toBe(400)
    expect(Math.round(bounds.left)).toBe(200)
  })

  it('keeps the same center when rotating (rotation only spins around the device center)', () => {
    const upright = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 0 }
    const rotated = { ...upright, rotation: 45 }
    const a = getItemBounds(upright)
    const b = getItemBounds(rotated)
    expect(a.left + a.width / 2).toBeCloseTo(b.left + b.width / 2, 6)
    expect(a.top + a.height / 2).toBeCloseTo(b.top + b.height / 2, 6)
    const corners = getItemCorners(rotated)
    const centerX = corners.reduce((sum, point) => sum + point.x, 0) / 4
    const centerY = corners.reduce((sum, point) => sum + point.y, 0) / 4
    expect(centerX).toBeCloseTo(300, 6)
    expect(centerY).toBeCloseTo(200, 6)
  })

  it('snaps to the nearest common gear across the 360 degree wrap', () => {
    expect(snapRotation(50)).toBe(45)
    expect(snapRotation(20)).toBe(30)
    expect(snapRotation(100)).toBe(90)
    expect(snapRotation(352)).toBe(0)
    expect(snapRotation(-20)).toBe(0)
    expect(snapRotation(28)).toBe(30)
  })

  it('uses true rotated polygons (OBB) for collision, avoiding AABB false positives', () => {
    // 两根 300x40 长条同向旋转 45°，中心分别在 (150,150) 与 (375,375)。
    // 它们的轴对齐外接矩形相交，但长条沿自身方向并不相交。
    const first = { ...createItem('monitor'), x: 0, y: 130, widthMm: 300, heightMm: 40, rotation: 45 }
    const second = { ...createItem('keyboard'), x: 225, y: 355, widthMm: 300, heightMm: 40, rotation: 45 }
    expect(orientedRectanglesOverlap(first, second)).toBe(false)

    // 拉近到中心 delta (180,180)，沿长条方向投影 255 < 300，真实相交
    const close = { ...second, x: 30, y: 160 }
    expect(orientedRectanglesOverlap(first, close)).toBe(true)
  })

  it('still detects plain axis-aligned overlap and out-of-bounds items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200 }
    const second = { ...createItem('keyboard'), x: 300, y: 150, widthMm: 400, heightMm: 200 }
    const outside = { ...createItem('lamp'), x: 1500, y: 700 }
    const analysis = analyzeLayout({ ...plan, items: [first, second, outside] })
    expect(analysis.overlapIds).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(analysis.outOfBoundsIds).toContain(outside.id)
    expect(analysis.status).toBe('attention')
  })

  it('reports overflow per side against the desk at the current angle', () => {
    const plan = createPlan('test', false)
    const item = { ...createItem('monitor'), x: -120, y: -60, widthMm: 400, heightMm: 200, rotation: 0 }
    const diagnosis = diagnosePlacement(plan, item, { excludeId: item.id })
    expect(diagnosis.outOfBounds).toBe(true)
    expect(Math.round(diagnosis.overflow.left)).toBe(120)
    expect(Math.round(diagnosis.overflow.top)).toBe(60)
    expect(diagnosis.overlapIds).toHaveLength(0)
  })

  it('finds the nearest fittable spot while keeping the angle, and gives up when the item is larger than the desk', () => {
    const plan = createPlan('test', false)
    const blocker = { ...createItem('speaker'), x: 300, y: 250, widthMm: 300, heightMm: 300, rotation: 0 }
    const item = { ...createItem('monitor'), x: 300, y: 250, widthMm: 200, heightMm: 80, rotation: 45 }
    const withDevices = { ...plan, items: [blocker, item] }
    expect(orientedRectanglesOverlap(item, blocker)).toBe(true)
    const position = findFittablePosition(withDevices, item, 25, 400)
    expect(position).not.toBeNull()
    const moved = { ...item, x: position!.x, y: position!.y }
    const diagnosis = diagnosePlacement(withDevices, moved, { excludeId: item.id })
    expect(diagnosis.outOfBounds).toBe(false)
    expect(diagnosis.overlapIds).toHaveLength(0)

    const huge = { ...item, widthMm: 3000, heightMm: 900 }
    expect(findFittablePosition(plan, huge)).toBeNull()
  })

  it('reports an already-valid item at its current position without moving it', () => {
    const plan = createPlan('test', false)
    const item = { ...createItem('monitor'), x: 100, y: 100, widthMm: 300, heightMm: 100, rotation: 30 }
    const position = findFittablePosition(plan, item)
    expect(position).toEqual({ x: item.x, y: item.y })
  })

  it('calculates coverage from the rotated real footprint', () => {
    const plan = createPlan('test', false)
    const uprightPlan = { ...plan, items: [{ ...createItem('monitor'), x: 200, y: 200, widthMm: 540, heightMm: 210, rotation: 0 }] }
    const rotatedPlan = { ...plan, items: [{ ...uprightPlan.items[0], rotation: 45 }] }
    const uprightCoverage = analyzeLayout(uprightPlan).coveragePercent
    const rotatedCoverage = analyzeLayout(rotatedPlan).coveragePercent
    expect(rotatedCoverage).toBeGreaterThan(uprightCoverage)
    // 45° 投影面积 = (w+h)/√2 的平方 ≈ 281000 mm²，占 1600x800 桌面约 22%
    expect(rotatedCoverage).toBe(22)
  })

  it('returns a healthy state for separated items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100 }
    const second = { ...createItem('keyboard'), x: 800, y: 500 }
    const analysis = analyzeLayout({ ...plan, items: [first, second] })
    expect(analysis.status).toBe('clear')
    expect(analysis.coveragePercent).toBeGreaterThan(0)
  })
})
