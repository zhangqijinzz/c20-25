import { describe, expect, it } from 'vitest'
import { createItem } from '../../../shared/models'
import {
  moveCanvasItem,
  nudgeCanvasItem,
  resizeCanvasItemAroundCenter,
  rotateCanvasItem,
  setCanvasItemRotation,
  snapCanvasItemRotation,
} from '../canvasViewModel'

describe('canvas module', () => {
  it('moves and rotates the requested item without changing other items', () => {
    const first = createItem('monitor')
    const second = createItem('keyboard')
    const moved = moveCanvasItem([first, second], first.id, 320, 180)
    const rotated = rotateCanvasItem(moved, first.id, -15)
    expect(rotated[0]).toMatchObject({ x: 320, y: 180, rotation: 345 })
    expect(rotated[1]).toEqual(second)
  })

  it('sets an absolute angle directly and normalizes it', () => {
    const item = createItem('monitor')
    const result = setCanvasItemRotation([item], item.id, 90)
    expect(result[0].rotation).toBe(90)
    expect(setCanvasItemRotation(result, item.id, -45)[0].rotation).toBe(315)
  })

  it('snaps to the nearest common angle', () => {
    const item = { ...createItem('monitor'), rotation: 37 }
    expect(snapCanvasItemRotation([item], item.id)[0].rotation).toBe(45)
    expect(snapCanvasItemRotation([{ ...item, rotation: 100 }], item.id)[0].rotation).toBe(90)
  })

  it('nudges by an absolute offset without changing the angle', () => {
    const item = { ...createItem('monitor'), rotation: 40 }
    const result = nudgeCanvasItem([item], item.id, 10, -10)
    expect(result[0]).toMatchObject({ x: item.x + 10, y: item.y - 10, rotation: 40 })
  })

  it('keeps the rotation center fixed when dimensions change', () => {
    const item = { ...createItem('monitor'), x: 100, y: 100, widthMm: 540, heightMm: 210, rotation: 30 }
    const result = resizeCanvasItemAroundCenter([item], item.id, 600, 240)[0]
    expect(result.x + result.widthMm / 2).toBeCloseTo(100 + 540 / 2)
    expect(result.y + result.heightMm / 2).toBeCloseTo(100 + 210 / 2)
    expect(result.rotation).toBe(30)
  })
})
