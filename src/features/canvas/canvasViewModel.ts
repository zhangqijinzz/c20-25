import { NUDGE_STEP_MM, normalizeRotation, snapRotation } from '../../shared/layoutRules'
import type { DeskItem } from '../../shared/models'

function updateCanvasItem(items: DeskItem[], id: string, updater: (item: DeskItem) => DeskItem): DeskItem[] {
  return items.map((item) => (item.id === id ? updater(item) : item))
}

export function moveCanvasItem(items: DeskItem[], id: string, x: number, y: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, x, y }))
}

/** 相对旋转（保留给 ±15° 微调按钮），始终围绕设备中心 */
export function rotateCanvasItem(items: DeskItem[], id: string, delta: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(item.rotation + delta) }))
}

/** 直接设定角度，始终围绕设备中心（x/y 表示未旋转左上角，不需要改变） */
export function setCanvasItemRotation(items: DeskItem[], id: string, angle: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(angle) }))
}

/** 吸附到最近的常用档位 */
export function snapCanvasItemRotation(items: DeskItem[], id: string): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: snapRotation(item.rotation) }))
}

/** 按当前角度围绕中心平移微调位置（dx/dy 为桌面坐标位移） */
export function nudgeCanvasItem(items: DeskItem[], id: string, dx: number, dy: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, x: item.x + dx, y: item.y + dy }))
}

/** 改设备本体尺寸时保持中心不动，旋转中心因此保持不变 */
export function resizeCanvasItemAroundCenter(items: DeskItem[], id: string, widthMm?: number, heightMm?: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => {
    const nextWidth = widthMm ?? item.widthMm
    const nextHeight = heightMm ?? item.heightMm
    const centerX = item.x + item.widthMm / 2
    const centerY = item.y + item.heightMm / 2
    return { ...item, widthMm: nextWidth, heightMm: nextHeight, x: centerX - nextWidth / 2, y: centerY - nextHeight / 2 }
  })
}

export { NUDGE_STEP_MM }
