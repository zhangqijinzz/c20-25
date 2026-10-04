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
} from 'lucide-react'
import type { DeskItem, WorkspacePlan } from '../../../shared/models'
import { getDeviceDefinition } from '../../../shared/models'
import {
  COMMON_ROTATIONS,
  diagnosePlacement,
  getItemBounds,
  getItemCenter,
  type ItemPlacementDiagnosis,
} from '../../../shared/layoutRules'

interface InspectorPanelProps {
  plan: WorkspacePlan
  item: DeskItem | null
  issueIds: string[]
  onUpdateDesk: (field: 'deskWidthMm' | 'deskHeightMm', value: number) => void
  onUpdateItem: (id: string, patch: Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>) => void
  onRotate: (id: string, delta: number) => void
  onSetRotation: (id: string, rotation: number) => void
  onSnapRotation: (id: string) => void
  onNudge: (id: string, deltaX: number, deltaY: number) => void
  onFit: (id: string) => void
  onDelete: (id: string) => void
}

function NumericField({ label, value, onChange, min = 40 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) {
  return <label className="numeric-field"><span>{label}</span><input type="number" value={value} min={min} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} /><em>mm</em></label>
}

function buildIssueMessages(plan: WorkspacePlan, item: DeskItem, diagnosis: ItemPlacementDiagnosis): string[] {
  const messages: string[] = []
  if (diagnosis.overlapIds.length > 0) {
    const names = diagnosis.overlapIds.map((id) => {
      const other = plan.items.find((candidate) => candidate.id === id)
      return other ? getDeviceDefinition(other.type).label : '其他设备'
    })
    messages.push(`旋转后与 ${names.join('、')} 的实际占位重叠`)
  }
  const sides: string[] = []
  if (diagnosis.overflow.left > 1) sides.push(`左 ${Math.round(diagnosis.overflow.left)}`)
  if (diagnosis.overflow.top > 1) sides.push(`上 ${Math.round(diagnosis.overflow.top)}`)
  if (diagnosis.overflow.right > 1) sides.push(`右 ${Math.round(diagnosis.overflow.right)}`)
  if (diagnosis.overflow.bottom > 1) sides.push(`下 ${Math.round(diagnosis.overflow.bottom)}`)
  if (sides.length > 0) messages.push(`实际占位超出桌面：${sides.join(' / ')} mm`)
  return messages
}

export function InspectorPanel({
  plan,
  item,
  issueIds,
  onUpdateDesk,
  onUpdateItem,
  onRotate,
  onSetRotation,
  onSnapRotation,
  onNudge,
  onFit,
  onDelete,
}: InspectorPanelProps) {
  const isIssue = item ? issueIds.includes(item.id) : false
  const definition = item ? getDeviceDefinition(item.type) : null
  const diagnosis = item ? diagnosePlacement(plan, item, { excludeId: item.id }) : null
  const issueMessages = item && diagnosis ? buildIssueMessages(plan, item, diagnosis) : []
  const bounds = item ? getItemBounds(item) : null
  const center = item ? getItemCenter(item) : null

  return (
    <aside className="inspector-panel">
      <div className="module-heading">
        <div><span className="eyebrow">02 / 检查</span><h2>尺寸检查</h2></div>
        <Ruler size={18} className="muted-icon" />
      </div>
      <div className="desk-size-card">
        <div className="field-heading"><span>桌面画布</span><span className="field-status">实时</span></div>
        <div className="desk-size-fields">
          <NumericField label="宽度" value={plan.deskWidthMm} onChange={(value) => onUpdateDesk('deskWidthMm', value)} min={600} />
          <NumericField label="深度" value={plan.deskHeightMm} onChange={(value) => onUpdateDesk('deskHeightMm', value)} min={600} />
        </div>
        <p className="helper-text">建议保留 40 mm 走线缓冲空间</p>
      </div>
      {item && definition && diagnosis && bounds && center ? (
        <div className="item-editor">
          <div className="selected-item-heading"><span className="selected-swatch" style={{ backgroundColor: definition.color }} /> <div><strong>{definition.label}</strong><small>{definition.hint}</small></div><span className="item-code">{definition.shortLabel}</span></div>
          {isIssue && <div className="issue-callout"><AlertTriangle size={16} /><div>{issueMessages.map((message) => <p key={message}>{message}</p>)}</div></div>}
          <div className="field-heading"><span>设备尺寸</span><span className="unit-label">本体 · 旋转前口径，可编辑</span></div>
          <div className="two-column-fields">
            <NumericField label="宽度" value={item.widthMm} onChange={(value) => onUpdateItem(item.id, { widthMm: value })} />
            <NumericField label="深度" value={item.heightMm} onChange={(value) => onUpdateItem(item.id, { heightMm: value })} />
          </div>
          <div className="footprint-row">
            <span>旋转后实际占位</span>
            <strong>{Math.round(bounds.width)} × {Math.round(bounds.height)} mm</strong>
          </div>
          <div className="field-heading position-heading"><span>位置</span><span className="unit-label">锚点为旋转前左上角</span></div>
          <div className="two-column-fields">
            <NumericField label="X" value={Math.round(item.x)} onChange={(value) => onUpdateItem(item.id, { x: value })} min={-2000} />
            <NumericField label="Y" value={Math.round(item.y)} onChange={(value) => onUpdateItem(item.id, { y: value })} min={-2000} />
          </div>
          <p className="helper-text center-hint">旋转中心固定：({Math.round(center.x)}, {Math.round(center.y)})，旋转不会让设备平移</p>

          <div className="rotation-editor">
            <div className="field-heading"><span><Crosshair size={12} /> 旋转角度</span><span className="unit-label">绕设备中心</span></div>
            <div className="rotation-direct">
              <div className="rotation-value"><input
                aria-label="旋转角度"
                type="number"
                min={0}
                max={359}
                value={Math.round(item.rotation)}
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber
                  if (Number.isFinite(value)) onSetRotation(item.id, value)
                }}
              /><em>°</em></div>
              <button className="snap-button" type="button" onClick={() => onSnapRotation(item.id)}><Magnet size={13} /> 就近取整</button>
            </div>
            <input
              className="rotation-slider"
              type="range"
              min={0}
              max={359}
              step={1}
              value={Math.round(item.rotation)}
              aria-label="拖动设定旋转角度"
              onChange={(event) => onSetRotation(item.id, event.currentTarget.valueAsNumber)}
            />
            <div className="rotation-presets">
              {COMMON_ROTATIONS.filter((angle) => angle <= 180).map((angle) => (
                <button
                  key={angle}
                  type="button"
                  className={`preset-chip ${Math.round(item.rotation) === angle ? 'is-active' : ''}`}
                  onClick={() => onSetRotation(item.id, angle)}
                >
                  {angle}°
                </button>
              ))}
            </div>
            <div className="rotation-actions">
              <button type="button" aria-label="逆时针旋转 15 度" onClick={() => onRotate(item.id, -15)}><RotateCcw size={14} /> 15°</button>
              <button type="button" aria-label="顺时针旋转 15 度" onClick={() => onRotate(item.id, 15)}><RotateCw size={14} /> 15°</button>
            </div>
          </div>

          <div className="nudge-editor">
            <div className="field-heading"><span>按当前角度微调</span><span className="unit-label">方向键 10 mm · Shift 50 mm</span></div>
            <div className="nudge-pad">
              <span />
              <button type="button" aria-label="向上微调" onClick={() => onNudge(item.id, 0, -10)}><ArrowUp size={14} /></button>
              <span />
              <button type="button" aria-label="向左微调" onClick={() => onNudge(item.id, -10, 0)}><ArrowLeft size={14} /></button>
              <button type="button" className="fit-button" onClick={() => onFit(item.id)}><Magnet size={14} /> 就近挪位</button>
              <button type="button" aria-label="向右微调" onClick={() => onNudge(item.id, 10, 0)}><ArrowRight size={14} /></button>
              <span />
              <button type="button" aria-label="向下微调" onClick={() => onNudge(item.id, 0, 10)}><ArrowDown size={14} /></button>
              <span />
            </div>
            <p className={`nudge-status ${isIssue ? 'is-issue' : ''}`}>
              {isIssue ? '当前角度下放不下，用方向键或「就近挪位」移到绿色位置' : '当前角度下放置正常'}
            </p>
          </div>

          <button className="remove-item-button" onClick={() => onDelete(item.id)} type="button"><Trash2 size={15} /> 移除这个设备</button>
        </div>
      ) : (
        <div className="empty-inspector"><span className="empty-illustration">⌖</span><strong>选择一个设备</strong><p>点击画布上的设备查看尺寸、位置和旋转控制。</p></div>
      )}
    </aside>
  )
}
