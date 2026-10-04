import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import {
  fitCanvasItem,
  moveCanvasItem,
  nudgeCanvasItem,
  rotateCanvasItem,
  setCanvasItemRotation,
  snapCanvasItemRotation,
} from '../canvasViewModel'
import { getItemBounds, orientedRectanglesOverlap } from '../../../shared/layoutRules'

describe('canvas module', () => {
  it('moves and rotates the requested item without changing other items', () => {
    const first = createItem('monitor')
    const second = createItem('keyboard')
    const moved = moveCanvasItem([first, second], first.id, 320, 180)
    const rotated = rotateCanvasItem(moved, first.id, -15)
    expect(rotated[0]).toMatchObject({ x: 320, y: 180, rotation: 345 })
    expect(rotated[1]).toEqual(second)
  })

  it('sets an absolute angle around the same center and never drifts the anchor sideways', () => {
    const item = { ...createItem('monitor'), x: 200, y: 120, rotation: 0 }
    const rotated = setCanvasItemRotation([item], item.id, 45)[0]
    expect(rotated.rotation).toBe(45)
    expect(rotated.x).toBe(200)
    expect(rotated.y).toBe(120)
    const before = getItemBounds(item)
    const after = getItemBounds(rotated)
    expect(before.left + before.width / 2).toBeCloseTo(after.left + after.width / 2, 6)
  })

  it('normalizes out-of-range direct angles into 0..359', () => {
    const item = { ...createItem('monitor'), rotation: 10 }
    expect(setCanvasItemRotation([item], item.id, 375)[0].rotation).toBe(15)
    expect(setCanvasItemRotation([item], item.id, -30)[0].rotation).toBe(330)
  })

  it('snaps the current angle to the nearest common gear', () => {
    const item = { ...createItem('monitor'), rotation: 52 }
    expect(snapCanvasItemRotation([item], item.id)[0].rotation).toBe(45)
  })

  it('nudges position by millimetre deltas without changing angle', () => {
    const item = { ...createItem('monitor'), x: 100, y: 100, rotation: 30 }
    const nudged = nudgeCanvasItem([item], item.id, -10, 25)[0]
    expect(nudged).toMatchObject({ x: 90, y: 125, rotation: 30 })
  })

  it('fits an overlapping rotated item into the nearest valid spot at the same angle', () => {
    const plan = createPlan('fit', false)
    const blocker = { ...createItem('speaker'), x: 300, y: 250, widthMm: 300, heightMm: 300, rotation: 0 }
    const item = { ...createItem('monitor'), x: 300, y: 250, widthMm: 200, heightMm: 80, rotation: 45 }
    expect(orientedRectanglesOverlap(item, blocker)).toBe(true)
    const result = fitCanvasItem({ ...plan, items: [blocker, item] }, item.id)
    expect(result.position).not.toBeNull()
    const moved = result.items[1]
    expect(moved.rotation).toBe(45)
    const movedBounds = getItemBounds(moved)
    expect(movedBounds.left).toBeGreaterThanOrEqual(-0.001)
    expect(movedBounds.top).toBeGreaterThanOrEqual(-0.001)
    expect(movedBounds.right).toBeLessThanOrEqual(plan.deskWidthMm + 0.001)
    expect(movedBounds.bottom).toBeLessThanOrEqual(plan.deskHeightMm + 0.001)
    expect(orientedRectanglesOverlap(moved, blocker)).toBe(false)
  })

  it('leaves everything untouched when no fittable spot exists', () => {
    const plan = createPlan('fit', false)
    const item = { ...createItem('monitor'), widthMm: 3000, heightMm: 900, x: 0, y: 0 }
    const result = fitCanvasItem({ ...plan, items: [item] }, item.id)
    expect(result.position).toBeNull()
    expect(result.items[0].x).toBe(0)
  })
})
