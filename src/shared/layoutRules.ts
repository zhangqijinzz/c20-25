import type { DeskItem, ItemBounds, LayoutAnalysis, WorkspacePlan } from './models'

/** 旋转相关的统一口径：
 * - 存储的 widthMm / heightMm / x / y 始终是设备本体（未旋转）的尺寸与锚点（未旋转时的左上角）
 * - 旋转中心恒为设备中心 x + widthMm / 2, y + heightMm / 2，旋转不改变锚点语义
 * - 实际占位、碰撞与越界一律按旋转后的真实投影计算（见 getItemBounds / 旋转多边形碰撞）
 */

export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

/** 常用旋转档位：每隔 30°，并补充 45° 对角档 */
export const COMMON_ROTATIONS = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315]

export function snapRotation(rotation: number): number {
  const target = normalizeRotation(rotation)
  let best = COMMON_ROTATIONS[0]
  let bestDistance = 360
  for (const candidate of COMMON_ROTATIONS) {
    const distance = Math.abs(candidate - target)
    const wrapped = Math.min(distance, 360 - distance)
    if (wrapped < bestDistance) {
      bestDistance = wrapped
      best = candidate
    }
  }
  return best
}

/** 旋转后的轴对齐外接矩形（真实占位），中心即设备中心 */
export function getItemBounds(item: DeskItem): ItemBounds {
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  const width = Math.abs(item.widthMm * Math.cos(radians)) + Math.abs(item.heightMm * Math.sin(radians))
  const height = Math.abs(item.widthMm * Math.sin(radians)) + Math.abs(item.heightMm * Math.cos(radians))
  const centerX = item.x + item.widthMm / 2
  const centerY = item.y + item.heightMm / 2
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
  }
}

export function getItemCenter(item: DeskItem): { x: number; y: number } {
  return { x: item.x + item.widthMm / 2, y: item.y + item.heightMm / 2 }
}

interface Point { x: number; y: number }

/** 设备旋转后四个角在桌面坐标系中的真实位置（与画布 SVG rotate 完全一致） */
export function getItemCorners(item: DeskItem): [Point, Point, Point, Point] {
  const { x: cx, y: cy } = getItemCenter(item)
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const halfW = item.widthMm / 2
  const halfH = item.heightMm / 2
  const rotate = (localX: number, localY: number): Point => ({
    x: cx + localX * cos - localY * sin,
    y: cy + localX * sin + localY * cos,
  })
  return [
    rotate(-halfW, -halfH),
    rotate(halfW, -halfH),
    rotate(halfW, halfH),
    rotate(-halfW, halfH),
  ]
}

export function rectanglesOverlap(first: ItemBounds, second: ItemBounds): boolean {
  const horizontal = Math.min(first.right, second.right) - Math.max(first.left, second.left)
  const vertical = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
  return horizontal > 1 && vertical > 1
}

function polygonAxes(corners: Point[]): Point[] {
  return corners.slice(0, 2).map((corner, index) => {
    const next = corners[(index + 1) % corners.length]
    const edgeX = next.x - corner.x
    const edgeY = next.y - corner.y
    const length = Math.hypot(edgeX, edgeY) || 1
    return { x: -edgeY / length, y: edgeX / length }
  })
}

function projectPolygon(corners: Point[], axis: Point): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const corner of corners) {
    const projection = corner.x * axis.x + corner.y * axis.y
    min = Math.min(min, projection)
    max = Math.max(max, projection)
  }
  return { min, max }
}

/** 按真实旋转多边形（OBB + 分离轴定理）判断碰撞，而非简单外接矩形 */
export function orientedRectanglesOverlap(first: DeskItem, second: DeskItem): boolean {
  const firstCorners = getItemCorners(first)
  const secondCorners = getItemCorners(second)
  const axes = [...polygonAxes(firstCorners), ...polygonAxes(secondCorners)]
  return axes.every((axis) => {
    const firstProjection = projectPolygon(firstCorners, axis)
    const secondProjection = projectPolygon(secondCorners, axis)
    return Math.min(firstProjection.max, secondProjection.max) - Math.max(firstProjection.min, secondProjection.min) > 1
  })
}

export interface ItemOverflow {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ItemPlacementDiagnosis {
  /** 与该设备真实旋转多边形相交的其他设备 id */
  overlapIds: string[]
  /** 实际占位是否超出桌面 */
  outOfBounds: boolean
  /** 各边超出桌面的毫米数（旋转后投影口径） */
  overflow: ItemOverflow
}

interface PlacementTarget {
  deskWidthMm: number
  deskHeightMm: number
  items: DeskItem[]
}

/** 诊断某个设备（可以是尚未写入的候选位置）按当前角度放置后的真实问题 */
export function diagnosePlacement(
  target: PlacementTarget,
  item: DeskItem,
  options: { excludeId?: string } = {},
): ItemPlacementDiagnosis {
  const bounds = getItemBounds(item)
  const overflow = {
    left: Math.max(0, -bounds.left),
    top: Math.max(0, -bounds.top),
    right: Math.max(0, bounds.right - target.deskWidthMm),
    bottom: Math.max(0, bounds.bottom - target.deskHeightMm),
  }
  const overlapIds = target.items
    .filter((other) => other.id !== item.id && other.id !== options.excludeId && orientedRectanglesOverlap(item, other))
    .map((other) => other.id)
  return {
    overlapIds,
    outOfBounds: overflow.left > 1 || overflow.top > 1 || overflow.right > 1 || overflow.bottom > 1,
    overflow,
  }
}

export function placementIsValid(target: PlacementTarget, item: DeskItem, excludeId?: string): boolean {
  const diagnosis = diagnosePlacement(target, item, { excludeId })
  return !diagnosis.outOfBounds && diagnosis.overlapIds.length === 0
}

export function analyzeLayout(plan: WorkspacePlan): LayoutAnalysis {
  const overlapIds = new Set<string>()
  const outOfBoundsIds = new Set<string>()

  plan.items.forEach((item) => {
    const diagnosis = diagnosePlacement(plan, item)
    if (diagnosis.outOfBounds) outOfBoundsIds.add(item.id)
    diagnosis.overlapIds.forEach((otherId) => {
      overlapIds.add(item.id)
      overlapIds.add(otherId)
    })
  })

  // 占位以旋转后的真实投影面积计算，旋转后占位会变大
  const occupiedArea = plan.items.reduce(
    (total, item) => {
      const bounds = getItemBounds(item)
      return total + bounds.width * bounds.height
    },
    0,
  )
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

export interface FittablePosition { x: number; y: number }

/** 保持设备当前角度，从当前位置向外按距离搜索最近的、放得下（不越界、不碰撞）的位置。
 *  找不到时返回 null，调用方提示用户继续手动微调。 */
export function findFittablePosition(
  target: PlacementTarget,
  item: DeskItem,
  stepMm = 25,
  maxDistanceMm = 700,
): FittablePosition | null {
  const bounds = getItemBounds(item)
  if (bounds.width > target.deskWidthMm || bounds.height > target.deskHeightMm) return null

  if (placementIsValid(target, item, item.id)) return { x: item.x, y: item.y }

  const center = getItemCenter(item)
  for (let range = stepMm; range <= maxDistanceMm; range += stepMm) {
    const candidates: Point[] = []
    for (let delta = -range; delta <= range; delta += stepMm) {
      candidates.push({ x: center.x + delta, y: center.y - range })
      candidates.push({ x: center.x + delta, y: center.y + range })
    }
    for (let delta = -range + stepMm; delta <= range - stepMm; delta += stepMm) {
      candidates.push({ x: center.x - range, y: center.y + delta })
      candidates.push({ x: center.x + range, y: center.y + delta })
    }
    candidates.sort((first, second) => {
      const firstDistance = (first.x - center.x) ** 2 + (first.y - center.y) ** 2
      const secondDistance = (second.x - center.x) ** 2 + (second.y - center.y) ** 2
      return firstDistance - secondDistance
    })
    for (const candidate of candidates) {
      const moved: DeskItem = {
        ...item,
        x: Math.round(candidate.x) - item.widthMm / 2,
        y: Math.round(candidate.y) - item.heightMm / 2,
      }
      if (placementIsValid(target, moved, item.id)) return { x: moved.x, y: moved.y }
    }
  }
  return null
}

export function clampDeskSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(4000, Math.max(600, Math.round(value)))
}

export function clampItemDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(2000, Math.max(40, Math.round(value)))
}

export function clampRotation(value: number): number {
  if (!Number.isFinite(value)) return 0
  return normalizeRotation(Math.round(value))
}
