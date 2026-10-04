import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createId,
  createInitialDocument,
  createPlan,
  type DeskItem,
  type DeviceType,
  type LayoutAnalysis,
  type WorkspaceDocument,
  type WorkspacePlan,
  type WorkspaceStatus,
} from '../../shared/models'
import { clampDeskSize, clampItemDimension, findFitOffset, isInsideDesk, orientedBoxesOverlap } from '../../shared/layoutRules'
import {
  moveCanvasItem,
  nudgeCanvasItem,
  resizeCanvasItemAroundCenter,
  rotateCanvasItem,
  setCanvasItemRotation,
  snapCanvasItemRotation,
} from '../canvas/canvasViewModel'
import { createMaterialDraft } from '../materials/materialsViewModel'
import { inspectPlan } from '../inspection/inspectionViewModel'
import { LocalWorkspaceRepository, type WorkspaceRepository } from './workspaceRepository'

export interface WorkspaceViewModel {
  status: WorkspaceStatus
  document: WorkspaceDocument | null
  activePlan: WorkspacePlan | null
  selectedItem: DeskItem | null
  analysis: LayoutAnalysis
  issueIds: string[]
  issueCount: number
  feedback: string
  isPreviewOpen: boolean
  selectItem: (id: string | null) => void
  addItem: (type: DeviceType) => void
  removeItem: (id: string) => void
  moveItem: (id: string, x: number, y: number) => void
  rotateItem: (id: string, delta: number) => void
  setItemRotation: (id: string, angle: number) => void
  snapItemRotation: (id: string) => void
  nudgeItem: (id: string, dx: number, dy: number) => void
  fitItemInPlace: (id: string) => void
  updateItemCenter: (id: string, center: Partial<Pick<DeskItem, 'x' | 'y'>>) => void
  updateItemSize: (id: string, size: Partial<Pick<DeskItem, 'widthMm' | 'heightMm'>>) => void
  updateDesk: (field: 'deskWidthMm' | 'deskHeightMm', value: number) => void
  createNewPlan: () => void
  duplicatePlan: () => void
  selectPlan: (id: string) => void
  deleteCurrentPlan: () => void
  openPreview: () => void
  closePreview: () => void
}

const emptyInspection = { analysis: { overlapIds: [], outOfBoundsIds: [], coveragePercent: 0, status: 'clear' as const }, issueIds: [], issueCount: 0 }

export function useWorkspaceViewModel(repository?: WorkspaceRepository): WorkspaceViewModel {
  const repositoryRef = useRef(repository ?? new LocalWorkspaceRepository())
  const [status, setStatus] = useState<WorkspaceStatus>('loading')
  const [document, setDocument] = useState<WorkspaceDocument | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [feedback, setFeedback] = useState('正在准备你的工作台…')

  useEffect(() => {
    let active = true
    void repositoryRef.current.load().then((loaded) => {
      if (!active) return
      const nextDocument = loaded ?? createInitialDocument()
      setDocument(nextDocument)
      setStatus('ready')
      setFeedback(loaded ? '已恢复上次编辑状态' : '已创建示例工作台，可以直接拖动设备')
    }).catch(() => {
      if (!active) return
      setDocument(createInitialDocument())
      setStatus('error')
      setFeedback('本地数据读取失败，当前使用临时工作台')
    })
    return () => { active = false }
  }, [])

  const activePlan = useMemo(
    () => document?.plans.find((plan) => plan.id === document.activePlanId) ?? null,
    [document],
  )
  const selectedItem = activePlan?.items.find((item) => item.id === selectedItemId) ?? null
  const inspection = useMemo(() => activePlan ? inspectPlan(activePlan) : emptyInspection, [activePlan])
  const { analysis, issueIds, issueCount } = inspection

  const persist = useCallback(async (nextDocument: WorkspaceDocument, message: string) => {
    setDocument(nextDocument)
    setStatus('saving')
    setFeedback(message)
    try {
      await repositoryRef.current.save(nextDocument)
      setStatus('ready')
    } catch {
      setStatus('error')
      setFeedback('自动保存失败，请检查浏览器本地存储权限')
    }
  }, [])

  const updateActivePlan = useCallback((updater: (plan: WorkspacePlan) => WorkspacePlan, message: string) => {
    if (!document || !activePlan) return
    const nextPlan = { ...updater(activePlan), updatedAt: new Date().toISOString() }
    const nextDocument = { ...document, plans: document.plans.map((plan) => plan.id === nextPlan.id ? nextPlan : plan) }
    void persist(nextDocument, message)
  }, [activePlan, document, persist])

  const selectItem = useCallback((id: string | null) => setSelectedItemId(id), [])

  const addItem = useCallback((type: DeviceType) => {
    if (!activePlan) return
    const draft = createMaterialDraft(type, activePlan.items.length)
    updateActivePlan((plan) => ({ ...plan, items: [...plan.items, draft.item] }), draft.feedback)
    setSelectedItemId(draft.item.id)
  }, [activePlan, updateActivePlan])

  const removeItem = useCallback((id: string) => {
    updateActivePlan((plan) => ({ ...plan, items: plan.items.filter((item) => item.id !== id) }), '设备已移除')
    setSelectedItemId((current) => current === id ? null : current)
  }, [updateActivePlan])

  const placementFeedback = useCallback((candidatePlan: WorkspacePlan, id: string, base: string): string => {
    const item = candidatePlan.items.find((entry) => entry.id === id)
    if (!item) return base
    const inside = isInsideDesk(item, candidatePlan.deskWidthMm, candidatePlan.deskHeightMm)
    const overlaps = candidatePlan.items.some((other) => other.id !== id && orientedBoxesOverlap(other, item))
    if (!inside && overlaps) return `${base}，但当前角度超出桌面且压住其他设备，可微调或自动归位`
    if (!inside) return `${base}，但当前角度超出桌面边界，可微调或自动归位`
    if (overlaps) return `${base}，但当前角度压住其他设备，可微调或自动归位`
    return base
  }, [])

  const moveItem = useCallback((id: string, x: number, y: number) => {
    updateActivePlan((plan) => ({ ...plan, items: moveCanvasItem(plan.items, id, x, y) }), '位置已更新')
  }, [updateActivePlan])

  const rotateItem = useCallback((id: string, delta: number) => {
    if (!activePlan) return
    const items = rotateCanvasItem(activePlan.items, id, delta)
    updateActivePlan((plan) => ({ ...plan, items }), placementFeedback({ ...activePlan, items }, id, '角度已更新'))
  }, [activePlan, placementFeedback, updateActivePlan])

  const setItemRotation = useCallback((id: string, angle: number) => {
    if (!activePlan) return
    const items = setCanvasItemRotation(activePlan.items, id, angle)
    updateActivePlan((plan) => ({ ...plan, items }), placementFeedback({ ...activePlan, items }, id, '角度已设定'))
  }, [activePlan, placementFeedback, updateActivePlan])

  const snapItemRotation = useCallback((id: string) => {
    if (!activePlan) return
    const items = snapCanvasItemRotation(activePlan.items, id)
    updateActivePlan((plan) => ({ ...plan, items }), placementFeedback({ ...activePlan, items }, id, '已取整到最近档位'))
  }, [activePlan, placementFeedback, updateActivePlan])

  const nudgeItem = useCallback((id: string, dx: number, dy: number) => {
    if (!activePlan) return
    const items = nudgeCanvasItem(activePlan.items, id, dx, dy)
    updateActivePlan((plan) => ({ ...plan, items }), placementFeedback({ ...activePlan, items }, id, '位置已微调'))
  }, [activePlan, placementFeedback, updateActivePlan])

  const fitItemInPlace = useCallback((id: string) => {
    if (!activePlan) return
    const item = activePlan.items.find((entry) => entry.id === id)
    if (!item) return
    const offset = findFitOffset(activePlan, item)
    if (!offset) {
      setFeedback('当前角度下桌面放不下这个设备，请换个角度或改小尺寸')
      return
    }
    if (offset.dx === 0 && offset.dy === 0) {
      setFeedback('当前角度已经可以放下，无需移动')
      return
    }
    const items = nudgeCanvasItem(activePlan.items, id, offset.dx, offset.dy)
    const distance = Math.round(Math.hypot(offset.dx, offset.dy))
    updateActivePlan((plan) => ({ ...plan, items }), `已保持角度平移 ${distance} mm，自动放到可容纳的位置`)
  }, [activePlan, updateActivePlan])

  const updateItemCenter = useCallback((id: string, center: Partial<Pick<DeskItem, 'x' | 'y'>>) => {
    updateActivePlan((plan) => ({
      ...plan,
      items: plan.items.map((item) => {
        if (item.id !== id) return item
        const next = { ...item }
        if (center.x !== undefined && Number.isFinite(center.x)) next.x = center.x - item.widthMm / 2
        if (center.y !== undefined && Number.isFinite(center.y)) next.y = center.y - item.heightMm / 2
        return next
      }),
    }), '中心位置已更新')
  }, [updateActivePlan])

  const updateItemSize = useCallback((id: string, size: Partial<Pick<DeskItem, 'widthMm' | 'heightMm'>>) => {
    updateActivePlan((plan) => {
      const current = plan.items.find((item) => item.id === id)
      if (!current) return plan
      const widthMm = size.widthMm === undefined ? current.widthMm : clampItemDimension(size.widthMm, current.widthMm)
      const heightMm = size.heightMm === undefined ? current.heightMm : clampItemDimension(size.heightMm, current.heightMm)
      return { ...plan, items: resizeCanvasItemAroundCenter(plan.items, id, widthMm, heightMm) }
    }, '本体尺寸已更新，旋转中心保持不变')
  }, [updateActivePlan])

  const updateDesk = useCallback((field: 'deskWidthMm' | 'deskHeightMm', value: number) => {
    if (!activePlan) return
    updateActivePlan((plan) => ({ ...plan, [field]: clampDeskSize(value, plan[field]) }), '桌面尺寸已更新')
  }, [activePlan, updateActivePlan])

  const createNewPlan = useCallback(() => {
    if (!document) return
    const plan = createPlan(`工作台 ${document.plans.length + 1}`, false)
    void persist({ ...document, plans: [...document.plans, plan], activePlanId: plan.id }, '已创建空白方案')
    setSelectedItemId(null)
  }, [document, persist])

  const duplicatePlan = useCallback(() => {
    if (!document || !activePlan) return
    const copy: WorkspacePlan = {
      ...activePlan,
      id: createId('plan'),
      name: `${activePlan.name} · 副本`,
      items: activePlan.items.map((item) => ({ ...item, id: createId('item') })),
      updatedAt: new Date().toISOString(),
    }
    void persist({ ...document, plans: [...document.plans, copy], activePlanId: copy.id }, '方案已复制')
    setSelectedItemId(null)
  }, [activePlan, document, persist])

  const selectPlan = useCallback((id: string) => {
    if (!document || !document.plans.some((plan) => plan.id === id)) return
    void persist({ ...document, activePlanId: id }, '已切换方案')
    setSelectedItemId(null)
  }, [document, persist])

  const deleteCurrentPlan = useCallback(() => {
    if (!document || !activePlan || document.plans.length <= 1) {
      setFeedback('至少保留一个工作台方案')
      return
    }
    const remaining = document.plans.filter((plan) => plan.id !== activePlan.id)
    void persist({ ...document, plans: remaining, activePlanId: remaining[0].id }, '方案已删除')
    setSelectedItemId(null)
  }, [activePlan, document, persist])

  const openPreview = useCallback(() => setIsPreviewOpen(true), [])
  const closePreview = useCallback(() => setIsPreviewOpen(false), [])

  return {
    status,
    document,
    activePlan,
    selectedItem,
    analysis,
    issueIds,
    issueCount,
    feedback,
    isPreviewOpen,
    selectItem,
    addItem,
    removeItem,
    moveItem,
    rotateItem,
    setItemRotation,
    snapItemRotation,
    nudgeItem,
    fitItemInPlace,
    updateItemCenter,
    updateItemSize,
    updateDesk,
    createNewPlan,
    duplicatePlan,
    selectPlan,
    deleteCurrentPlan,
    openPreview,
    closePreview,
  }
}
