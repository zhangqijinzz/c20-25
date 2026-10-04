import {
  findFittablePosition,
  normalizeRotation,
  snapRotation,
} from '../../shared/layoutRules'
import type { DeskItem, WorkspacePlan } from '../../shared/models'

function updateCanvasItem(items: DeskItem[], id: string, updater: (item: DeskItem) => DeskItem): DeskItem[] {
  return items.map((item) => item.id === id ? updater(item) : item)
}

export function moveCanvasItem(items: DeskItem[], id: string, x: number, y: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, x, y }))
}

export function rotateCanvasItem(items: DeskItem[], id: string, delta: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(item.rotation + delta) }))
}

/** 直接把设备设定到指定角度（0-359），始终围绕设备中心旋转，中心与锚点不变 */
export function setCanvasItemRotation(items: DeskItem[], id: string, rotation: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(rotation) }))
}

/** 把当前角度就近取整到常用档位 */
export function snapCanvasItemRotation(items: DeskItem[], id: string): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: snapRotation(item.rotation) }))
}

/** 按当前角度原地微调位置（dx/dy 为桌面坐标系下的毫米增量） */
export function nudgeCanvasItem(items: DeskItem[], id: string, deltaX: number, deltaY: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, x: item.x + deltaX, y: item.y + deltaY }))
}

export interface FitResult {
  items: DeskItem[]
  position: { x: number; y: number } | null
}

/** 保持当前角度不变，把设备挪到最近的可放置位置；找不到则原样返回 */
export function fitCanvasItem(plan: WorkspacePlan, id: string): FitResult {
  const item = plan.items.find((candidate) => candidate.id === id)
  if (!item) return { items: plan.items, position: null }
  const position = findFittablePosition(plan, item)
  if (!position) return { items: plan.items, position: null }
  return { items: moveCanvasItem(plan.items, id, position.x, position.y), position }
}
