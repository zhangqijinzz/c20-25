import { Check, TriangleAlert, X } from 'lucide-react'
import type { LayoutAnalysis, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import { diagnosePlacement, getItemBounds } from '../../../shared/layoutRules'
import { CanvasStage } from '../../canvas/components/CanvasStage'

interface PreviewOverlayProps {
  plan: WorkspacePlan
  analysis: LayoutAnalysis
  issueCount: number
  onClose: () => void
}

function describeItemIssue(plan: WorkspacePlan, itemId: string): string {
  const item = plan.items.find((candidate) => candidate.id === itemId)
  if (!item) return ''
  const diagnosis = diagnosePlacement(plan, item, { excludeId: item.id })
  const name = getDeviceDefinition(item.type).label
  const bounds = getItemBounds(item)
  if (diagnosis.overlapIds.length > 0) {
    const others = diagnosis.overlapIds
      .map((id) => plan.items.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .map((candidate) => getDeviceDefinition(candidate.type).label)
    return `${name}：旋转 ${Math.round(item.rotation)}° 后实际占位 ${Math.round(bounds.width)} × ${Math.round(bounds.height)} mm，与 ${others.join('、')} 重叠`
  }
  const sides: string[] = []
  if (diagnosis.overflow.left > 1) sides.push(`左 ${Math.round(diagnosis.overflow.left)}`)
  if (diagnosis.overflow.top > 1) sides.push(`上 ${Math.round(diagnosis.overflow.top)}`)
  if (diagnosis.overflow.right > 1) sides.push(`右 ${Math.round(diagnosis.overflow.right)}`)
  if (diagnosis.overflow.bottom > 1) sides.push(`下 ${Math.round(diagnosis.overflow.bottom)}`)
  return `${name}：旋转 ${Math.round(item.rotation)}° 后超出桌面 ${sides.join(' / ')} mm`
}

export function PreviewOverlay({ plan, analysis, issueCount, onClose }: PreviewOverlayProps) {
  const issueItemIds = [...new Set([...analysis.overlapIds, ...analysis.outOfBoundsIds])]
  return (
    <div className="preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <section className="preview-modal">
        <header className="preview-modal-header"><div><span className="eyebrow">LAYOUT PREVIEW</span><h2 id="preview-title">{plan.name}</h2><p>{plan.deskWidthMm} × {plan.deskHeightMm} mm · {plan.items.length} 件设备 · 检查按旋转后的真实占位计算</p></div><button className="close-preview" aria-label="关闭预览" onClick={onClose} type="button"><X size={18} /></button></header>
        <div className="preview-canvas"><CanvasStage plan={plan} selectedItemId={null} analysis={analysis} onSelect={() => undefined} onMove={() => undefined} /></div>
        {issueItemIds.length > 0 && (
          <ul className="preview-issue-list">
            {issueItemIds.map((id) => <li key={id}><TriangleAlert size={13} /> {describeItemIssue(plan, id)}</li>)}
          </ul>
        )}
        <footer className="preview-footer"><span className={`preview-check ${issueCount > 0 ? 'has-issue' : ''}`}>{issueCount === 0 ? <Check size={15} /> : <TriangleAlert size={15} />} {issueCount === 0 ? '布局检查通过，可开始搭建' : `还有 ${issueCount} 件设备需要调整`}</span><button className="preview-done" onClick={onClose} type="button">返回编辑</button></footer>
      </section>
    </div>
  )
}
