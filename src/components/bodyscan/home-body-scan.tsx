import { useCallback, useRef, useState } from 'react'
import type { Camera, Group } from 'three'
import { MUSCLE_GROUPS, type MuscleGroup } from '../../domain/workouts'
import { useQuery } from '@tanstack/react-query'
import { loadProfile } from '../../lib/health-api'
import { useProgressionSnapshot } from '../../lib/use-progression-snapshot'
import { Button } from '../ui/button'
import { BodyScanViewer } from './body-scan-viewer'
import { muscleStatuses } from './muscle-status'
import { projectMuscleAnchor } from './muscle-anchors'

export function HomeBodyScan() {
  const [selected, setSelected] = useState<MuscleGroup | null>(null)
  const layout = useRef<HTMLDivElement>(null)
  const updateLines = useCallback((camera: Camera, model: Group, canvas: HTMLCanvasElement) => {
    const root = layout.current
    if (!root) return
    const outer = root.getBoundingClientRect(), view = canvas.getBoundingClientRect()
    for (const path of root.querySelectorAll<SVGPathElement>('[data-connector]')) {
      const group = path.dataset.connector as MuscleGroup
      const card = root.querySelector<HTMLElement>(`[data-muscle-group="${group}"]`)
      if (!card) { path.setAttribute('d', ''); continue }
      const box = card.getBoundingClientRect(), side = card.dataset.side as 'left' | 'right'
      const point = projectMuscleAnchor(group, side, camera, model)
      const startX = (side === 'left' ? box.right : box.left) - outer.left
      const startY = box.top + box.height / 2 - outer.top
      const endX = view.left - outer.left + (point.x + 1) * view.width / 2
      const endY = view.top - outer.top + (1 - point.y) * view.height / 2
      const bendX = startX + (side === 'left' ? 1 : -1) * Math.min(12, Math.abs(endX - startX) / 3)
      const line = `M ${startX} ${startY} H ${bendX} L ${endX} ${endY}`
      if (path.getAttribute('d') !== line) path.setAttribute('d', line)
    }
  }, [])
  const profile = useQuery({ queryKey: ['health', 'profile'], queryFn: loadProfile })
  return (
    <div className="body-status-layout" ref={layout}>
      <div className="body-status-viewer"><BodyScanViewer selected={selected} onSelectionChange={setSelected} onFrame={updateLines} /></div>
      <svg className="body-status-lines" aria-hidden="true">
        {MUSCLE_GROUPS.map(group => <path key={group} data-connector={group} data-selected={selected === group} />)}
      </svg>
      {profile.isPending ? <p role="status" className="body-status-state">불러오는 중…</p>
        : profile.isError ? <div role="alert" className="body-status-state"><p>{profile.error.message}</p><Button variant="quiet" onClick={() => void profile.refetch()}>다시 불러오기</Button></div>
          : <MuscleStatuses timezone={profile.data.timezone} selected={selected} onSelect={setSelected} />}
    </div>
  )
}

function MuscleStatuses({ timezone, selected, onSelect }: { timezone: string; selected: MuscleGroup | null; onSelect: (group: MuscleGroup) => void }) {
  const progression = useProgressionSnapshot(timezone)
  if (progression.isPending) return <p role="status" className="body-status-state">불러오는 중…</p>
  if (progression.isError) return <div role="alert" className="body-status-state"><p>{progression.error.message}</p><Button variant="quiet" onClick={() => void progression.refetch()}>다시 불러오기</Button></div>
  const statuses = muscleStatuses(progression.data.muscles)
  if (statuses.length === 0) return <p className="body-status-state">근육 기록이 없어요.</p>
  return (['left', 'right'] as const).map(side => (
    <ul className={`body-status-side body-status-side--${side}`} key={side}>
      {statuses.filter(status => status.side === side).map(status => {
        const isSelected = selected === status.group
        return (
          <li key={status.group} className="body-status-card" data-muscle-group={status.group} data-side={side} data-selected={isSelected} style={{ '--status-row': status.row } as React.CSSProperties}>
            <button type="button" aria-pressed={isSelected} onClick={() => onSelect(status.group)}>
              <strong>{status.label}</strong><span className="body-status-values"><span>레벨 {status.level}</span><span>{status.xp} XP</span></span>
            </button>
          </li>
        )
      })}
    </ul>
  ))
}
