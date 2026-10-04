import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  Magnet,
  RotateCcw,
  RotateCw,
  Ruler,
  Trash2,
  Wand2,
} from 'lucide-react'
import type { DeskItem, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import {
  getBoundsViolation,
  getItemBounds,
  NUDGE_STEP_MM,
  orientedBoxesOverlap,
  QUICK_ANGLES,
} from '../../../shared/layoutRules'

interface InspectorPanelProps {
  plan: WorkspacePlan
  item: DeskItem | null
  issueIds: string[]
  onUpdateDesk: (field: 'deskWidthMm' | 'deskHeightMm', value: number) => void
  onUpdateItemSize: (id: string, size: Partial<Pick<DeskItem, 'widthMm' | 'heightMm'>>) => void
  onUpdateItemCenter: (id: string, center: Partial<Pick<DeskItem, 'x' | 'y'>>) => void
  onRotate: (id: string, delta: number) => void
  onSetRotation: (id: string, angle: number) => void
  onSnapRotation: (id: string) => void
  onNudge: (id: string, dx: number, dy: number) => void
  onFit: (id: string) => void
  onDelete: (id: string) => void
}

function NumericField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return <label className="numeric-field"><span>{label}</span><input type="number" value={value} min={min} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} /><em>mm</em></label>
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div className="numeric-field readonly-field"><span>{label}</span><input value={value} readOnly tabIndex={-1} /><em>mm</em></div>
}

function AngleField({ value, onCommit }: { value: number; onCommit: (angle: number) => void }) {
  const [text, setText] = useState(String(Math.round(value)))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(String(Math.round(value)))
  }, [value, focused])
  const commit = () => {
    const parsed = Number(text)
    if (text.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed)
    setFocused(false)
  }
  return (
    <label className="numeric-field angle-field">
      <span>直接输入角度</span>
      <input
        type="number"
        value={text}
        min={0}
        max={360}
        aria-label="旋转角度，单位度"
        onFocus={() => { setFocused(true); setText(String(Math.round(value))) }}
        onChange={(event) => setText(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
      <em>°</em>
    </label>
  )
}

function describeItemIssue(plan: WorkspacePlan, item: DeskItem): string | null {
  const violation = getBoundsViolation(item, plan.deskWidthMm, plan.deskHeightMm)
  const overflowParts: string[] = []
  if (violation.left > 0) overflowParts.push(`左 ${Math.round(violation.left)}`)
  if (violation.top > 0) overflowParts.push(`上 ${Math.round(violation.top)}`)
  if (violation.right > 0) overflowParts.push(`右 ${Math.round(violation.right)}`)
  if (violation.bottom > 0) overflowParts.push(`下 ${Math.round(violation.bottom)}`)
  const outOfBounds = overflowParts.length > 0
  const overlapping = plan.items
    .filter((other) => other.id !== item.id && orientedBoxesOverlap(other, item))
    .map((other) => getDeviceDefinition(other.type).label)
  if (!outOfBounds && overlapping.length === 0) return null
  const messages: string[] = []
  if (outOfBounds) messages.push(`当前角度下超出桌面 ${overflowParts.join('、')} mm`)
  if (overlapping.length > 0) messages.push(`压到了：${overlapping.join('、')}`)
  return `${messages.join('；')}。可按当前角度微调位置或一键归位`
}

export function InspectorPanel({
  plan,
  item,
  issueIds,
  onUpdateDesk,
  onUpdateItemSize,
  onUpdateItemCenter,
  onRotate,
  onSetRotation,
  onSnapRotation,
  onNudge,
  onFit,
  onDelete,
}: InspectorPanelProps) {
  const isIssue = item ? issueIds.includes(item.id) : false
  const definition = item ? getDeviceDefinition(item.type) : null
  const issueDescription = item ? describeItemIssue(plan, item) : null
  const bounds = item ? getItemBounds(item) : null

  return (
    <aside className="inspector-panel">
      <div className="module-heading">
        <div><span className="eyebrow">02 / 检查</span><h2>尺寸检查</h2></div>
        <Ruler size={18} className="muted-icon" />
      </div>
      <div className="desk-size-card">
        <div className="field-heading"><span>桌面画布</span><span className="field-status">实时</span></div>
        <div className="desk-size-fields">
          <NumericField label="宽度" value={plan.deskWidthMm} onChange={(value) => onUpdateDesk('deskWidthMm', value)} />
          <NumericField label="深度" value={plan.deskHeightMm} onChange={(value) => onUpdateDesk('deskHeightMm', value)} />
        </div>
        <p className="helper-text">建议保留 40 mm 走线缓冲空间</p>
      </div>
      {item && definition && bounds ? (
        <div className="item-editor">
          <div className="selected-item-heading"><span className="selected-swatch" style={{ backgroundColor: definition.color }} /> <div><strong>{definition.label}</strong><small>{definition.hint}</small></div><span className="item-code">{definition.shortLabel}</span></div>
          {isIssue && issueDescription && (
            <div className="issue-callout" role="alert"><AlertTriangle size={16} /><span>{issueDescription}</span></div>
          )}

          <div className="field-heading"><span>旋转</span><span className="unit-label">始终围绕设备中心</span></div>
          <div className="rotation-editor">
            <AngleField value={item.rotation} onCommit={(angle) => onSetRotation(item.id, angle)} />
            <div className="rotation-fine" role="group" aria-label="微调角度">
              <button aria-label="逆时针旋转 15 度" onClick={() => onRotate(item.id, -15)} type="button"><RotateCcw size={14} /></button>
              <button aria-label="顺时针旋转 15 度" onClick={() => onRotate(item.id, 15)} type="button"><RotateCw size={14} /></button>
            </div>
          </div>
          <div className="angle-chips" role="group" aria-label="常用角度">
            {QUICK_ANGLES.map((angle) => (
              <button
                key={angle}
                type="button"
                className={Math.round(item.rotation) === angle ? 'is-active' : ''}
                aria-pressed={Math.round(item.rotation) === angle}
                onClick={() => onSetRotation(item.id, angle)}
              >
                {angle}°
              </button>
            ))}
            <button type="button" className="snap-button" onClick={() => onSnapRotation(item.id)}>
              <Magnet size={12} /> 取整档位
            </button>
          </div>

          <div className="field-heading"><span>本体尺寸</span><span className="unit-label">旋转前输入口径 · mm</span></div>
          <div className="two-column-fields">
            <NumericField label="宽度" value={item.widthMm} min={40} onChange={(value) => onUpdateItemSize(item.id, { widthMm: value })} />
            <NumericField label="深度" value={item.heightMm} min={40} onChange={(value) => onUpdateItemSize(item.id, { heightMm: value })} />
          </div>

          <div className="field-heading position-heading"><span>旋转中心</span><span className="unit-label">位置统一口径，围绕此点转动</span></div>
          <div className="two-column-fields">
            <NumericField label="中心 X" value={Math.round(item.x + item.widthMm / 2)} onChange={(value) => onUpdateItemCenter(item.id, { x: value })} />
            <NumericField label="中心 Y" value={Math.round(item.y + item.heightMm / 2)} onChange={(value) => onUpdateItemCenter(item.id, { y: value })} />
          </div>

          <div className="field-heading footprint-heading"><span>旋转后实际占位</span><span className="field-status">按真实旋转结果</span></div>
          <div className="two-column-fields">
            <ReadOnlyField label="占位宽" value={`${Math.round(bounds.width)}`} />
            <ReadOnlyField label="占位深" value={`${Math.round(bounds.height)}`} />
            <ReadOnlyField label="占位左上 X" value={`${Math.round(bounds.left)}`} />
            <ReadOnlyField label="占位左上 Y" value={`${Math.round(bounds.top)}`} />
          </div>

          <div className="field-heading position-heading"><span>按当前角度微调</span><span className="unit-label">每步 {NUDGE_STEP_MM} mm</span></div>
          <div className={`nudge-row ${isIssue ? 'is-issue' : ''}`}>
            <div className="nudge-pad" role="group" aria-label={`按当前角度微调位置，每步${NUDGE_STEP_MM}毫米`}>
              <button type="button" className="nudge-up" aria-label="向上微调" onClick={() => onNudge(item.id, 0, -NUDGE_STEP_MM)}><ArrowUp size={14} /></button>
              <button type="button" className="nudge-left" aria-label="向左微调" onClick={() => onNudge(item.id, -NUDGE_STEP_MM, 0)}><ArrowLeft size={14} /></button>
              <span className="nudge-center"><Crosshair size={13} /></span>
              <button type="button" className="nudge-right" aria-label="向右微调" onClick={() => onNudge(item.id, NUDGE_STEP_MM, 0)}><ArrowRight size={14} /></button>
              <button type="button" className="nudge-down" aria-label="向下微调" onClick={() => onNudge(item.id, 0, NUDGE_STEP_MM)}><ArrowDown size={14} /></button>
            </div>
            <button type="button" className="fit-button" onClick={() => onFit(item.id)}>
              <Wand2 size={13} /> 保持 {Math.round(item.rotation)}° 自动归位
            </button>
          </div>

          <button className="remove-item-button" onClick={() => onDelete(item.id)} type="button"><Trash2 size={15} /> 移除这个设备</button>
        </div>
      ) : (
        <div className="empty-inspector"><span className="empty-illustration">⌖</span><strong>选择一个设备</strong><p>点击画布上的设备查看尺寸、位置和旋转控制。</p></div>
      )}
    </aside>
  )
}
