import type { DeskItem, ItemBounds, LayoutAnalysis, WorkspacePlan } from './models'

export interface Point {
  x: number
  y: number
}

export interface Offset {
  dx: number
  dy: number
}

/** 常用旋转档位：取整时吸附到这些角度 */
export const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const
/** 角度快捷按钮 */
export const QUICK_ANGLES = [0, 30, 45, 90] as const
/** 微调一次的步进 */
export const NUDGE_STEP_MM = 10

export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

/** 任意角度输入归一化：非法值回退到当前角度，合法值取整到 0-359 */
export function clampRotation(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return normalizeRotation(fallback)
  return normalizeRotation(Math.round(value))
}

/** 吸附到距离最近的常用档位；等距时取较小的档位，保证结果确定 */
export function snapRotation(rotation: number, angles: readonly number[] = SNAP_ANGLES): number {
  const current = normalizeRotation(rotation)
  let best = angles[0]
  let bestDistance = angularDistance(current, angles[0])
  for (let index = 1; index < angles.length; index += 1) {
    const distance = angularDistance(current, angles[index])
    if (distance < bestDistance) {
      best = angles[index]
      bestDistance = distance
    }
  }
  return best
}

function angularDistance(first: number, second: number): number {
  const direct = Math.abs(first - second)
  return Math.min(direct, 360 - direct)
}

/** 旋转中心（所有旋转始终围绕这一点） */
export function getItemCenter(item: DeskItem): Point {
  return { x: item.x + item.widthMm / 2, y: item.y + item.heightMm / 2 }
}

/** 旋转后矩形在世界坐标中的四个角点（按真实旋转结果计算） */
export function getItemCorners(item: DeskItem): [Point, Point, Point, Point] {
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const halfWidth = item.widthMm / 2
  const halfHeight = item.heightMm / 2
  const center = getItemCenter(item)
  const localCorners: [Point, Point, Point, Point] = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ]
  return localCorners.map((corner) => ({
    x: center.x + corner.x * cosine - corner.y * sine,
    y: center.y + corner.x * sine + corner.y * cosine,
  })) as [Point, Point, Point, Point]
}

/** 旋转后的轴对齐外接框：画布选中框、问题标记、越界检查统一使用它 */
export function getItemBounds(item: DeskItem): ItemBounds {
  const corners = getItemCorners(item)
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

export function rectanglesOverlap(first: ItemBounds, second: ItemBounds): boolean {
  const horizontal = Math.min(first.right, second.right) - Math.max(first.left, second.left)
  const vertical = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
  return horizontal > 1 && vertical > 1
}

/**
 * 两个旋转矩形（OBB）的真实相交检测，使用分离轴定理（SAT）。
 * 轴对齐外接框相交不代表设备本身真的压到，旋转后的重叠检查必须用这个。
 */
export function orientedBoxesOverlap(first: DeskItem, second: DeskItem): boolean {
  const axes = [...getBoxAxes(first), ...getBoxAxes(second)]
  const firstCorners = getItemCorners(first)
  const secondCorners = getItemCorners(second)
  return axes.every((axis) => {
    const firstProjection = projectOntoAxis(firstCorners, axis)
    const secondProjection = projectOntoAxis(secondCorners, axis)
    const overlap = Math.min(firstProjection.max, secondProjection.max) - Math.max(firstProjection.min, secondProjection.min)
    return overlap > 1
  })
}

function getBoxAxes(item: DeskItem): Point[] {
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  return [
    { x: Math.cos(radians), y: Math.sin(radians) },
    { x: -Math.sin(radians), y: Math.cos(radians) },
  ]
}

function projectOntoAxis(corners: Point[], axis: Point): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  corners.forEach((corner) => {
    const projection = corner.x * axis.x + corner.y * axis.y
    min = Math.min(min, projection)
    max = Math.max(max, projection)
  })
  return { min, max }
}

/** 越界量（毫米），四个方向分别给出；0 表示该方向没有超出 */
export interface BoundsViolation {
  left: number
  top: number
  right: number
  bottom: number
}

export function getBoundsViolation(item: DeskItem, deskWidthMm: number, deskHeightMm: number): BoundsViolation {
  const bounds = getItemBounds(item)
  return {
    left: Math.max(0, -bounds.left),
    top: Math.max(0, -bounds.top),
    right: Math.max(0, bounds.right - deskWidthMm),
    bottom: Math.max(0, bounds.bottom - deskHeightMm),
  }
}

export function isInsideDesk(item: DeskItem, deskWidthMm: number, deskHeightMm: number): boolean {
  const violation = getBoundsViolation(item, deskWidthMm, deskHeightMm)
  return violation.left === 0 && violation.top === 0 && violation.right === 0 && violation.bottom === 0
}

/** 以当前角度判断设备放在 items 中是否合法（不越界、不压到别的设备） */
export function canPlaceItem(plan: WorkspacePlan, candidate: DeskItem, ignoredId?: string): boolean {
  if (!isInsideDesk(candidate, plan.deskWidthMm, plan.deskHeightMm)) return false
  return !plan.items.some((other) =>
    other.id !== candidate.id && other.id !== ignoredId && orientedBoxesOverlap(other, candidate),
  )
}

/**
 * 保持当前角度，围绕中心平移，搜索最近的可放置位置（不越界、不与其他设备重叠）。
 * 先粗搜（20mm 网格）再在命中格附近细搜（5mm 网格），返回相对当前位置的最小位移。
 * 桌面在当前角度下根本放不下时返回 null。
 */
export function findFitOffset(
  plan: WorkspacePlan,
  item: DeskItem,
  maxRadiusMm = 600,
): Offset | null {
  const fitsAt = (dx: number, dy: number) => {
    const candidate = { ...item, x: item.x + dx, y: item.y + dy }
    return canPlaceItem(plan, candidate, item.id)
  }
  if (fitsAt(0, 0)) return { dx: 0, dy: 0 }

  let anchor: Offset | null = null
  const coarseLimit = Math.ceil(maxRadiusMm / 20)
  for (let ring = 1; ring <= coarseLimit && anchor === null; ring += 1) {
    anchor = scanRing(ring, 20, fitsAt)
  }
  if (!anchor) return null

  let best: Offset = anchor
  for (let dx = anchor.dx - 20; dx <= anchor.dx + 20; dx += 5) {
    for (let dy = anchor.dy - 20; dy <= anchor.dy + 20; dy += 5) {
      if (fitsAt(dx, dy) && dx * dx + dy * dy < best.dx * best.dx + best.dy * best.dy) {
        best = { dx, dy }
      }
    }
  }
  return best
}

function scanRing(ring: number, step: number, fitsAt: (dx: number, dy: number) => boolean): Offset | null {
  const edge = ring * step
  for (let offset = -edge; offset <= edge; offset += step) {
    const candidates: Offset[] = [
      { dx: offset, dy: -edge },
      { dx: edge, dy: offset },
      { dx: -offset, dy: edge },
      { dx: -edge, dy: -offset },
    ]
    for (const candidate of candidates) {
      if (fitsAt(candidate.dx, candidate.dy)) return candidate
    }
  }
  return null
}

export function analyzeLayout(plan: WorkspacePlan): LayoutAnalysis {
  const overlapIds = new Set<string>()
  const outOfBoundsIds = new Set<string>()

  plan.items.forEach((item) => {
    if (!isInsideDesk(item, plan.deskWidthMm, plan.deskHeightMm)) {
      outOfBoundsIds.add(item.id)
    }
  })

  for (let index = 0; index < plan.items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < plan.items.length; nextIndex += 1) {
      const first = plan.items[index]
      const second = plan.items[nextIndex]
      if (orientedBoxesOverlap(first, second)) {
        overlapIds.add(first.id)
        overlapIds.add(second.id)
      }
    }
  }

  // 占用率按设备真实投影面积计算：旋转不改变矩形面积，w*h 即旋转后的真实面积
  const occupiedArea = plan.items.reduce((total, item) => total + item.widthMm * item.heightMm, 0)
  const deskArea = plan.deskWidthMm * plan.deskHeightMm
  const coveragePercent = Math.min(100, Math.round((occupiedArea / deskArea) * 100))
  const hasIssue = overlapIds.size > 0 || outOfBoundsIds.size > 0
  return {
    overlapIds: [...overlapIds],
    outOfBoundsIds: [...outOfBoundsIds],
    coveragePercent,
    status: hasIssue ? 'attention' : 'clear',
  }
}

export function clampDeskSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(4000, Math.max(600, Math.round(value)))
}

export function clampItemDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(2000, Math.max(40, Math.round(value)))
}
