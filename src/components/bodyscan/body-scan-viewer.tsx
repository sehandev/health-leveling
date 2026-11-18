import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, type Camera, type Group } from 'three'
import { createMannequin } from './mannequin'
import { adjacentMuscle, muscleNames, type Muscle } from './muscles'

type FrameHandler = (camera: Camera, model: Group, canvas: HTMLCanvasElement) => void

function Mannequin({ angle, selected, select, onFrame }: { angle: number, selected: Muscle | null, select: (id: Muscle) => void, onFrame?: FrameHandler }) {
  const model = useRef<Group>(null)
  useFrame(({ camera, gl }) => { if (model.current) onFrame?.(camera, model.current, gl.domElement) })
  const { geometry, outline, edges, neutralEdges, regions } = useMemo(createMannequin, [])
  const { background, muted } = useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    return { background: style.getPropertyValue('--page-bg').trim(), muted: style.getPropertyValue('--muted-bg').trim() }
  }, [])
  useEffect(() => () => { geometry.dispose(); outline.dispose(); edges.dispose(); neutralEdges.dispose(); regions.forEach(region => region.geometry.dispose()) }, [geometry, outline, edges, neutralEdges, regions])
  return (
    <group ref={model} rotation={[0, angle, 0]}>
      <mesh geometry={outline} raycast={() => null}>
        <meshBasicMaterial color="#929792" side={BackSide} toneMapped={false} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={background} toneMapped={false} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>
      {regions.map(region => (
        <mesh key={region.id} geometry={region.geometry} onClick={event => {
          if (event.delta <= 5) { event.stopPropagation(); select(region.id) }
        }}>
          <meshBasicMaterial toneMapped={false} color={selected === region.id ? '#87a950' : muted} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
        </mesh>
      ))}
      <lineSegments geometry={neutralEdges} raycast={() => null}>
        <lineBasicMaterial color="#929792" toneMapped={false} />
      </lineSegments>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color="#596b63" transparent opacity={0.8} />
      </lineSegments>
    </group>
  )
}


export function BodyScanViewer({ onSelectionChange, onFrame }: { onSelectionChange?: (muscle: Muscle | null) => void, onFrame?: FrameHandler }) {
  const [angle, setAngle] = useState(0)
  const [selected, setSelected] = useState<Muscle | null>(null)
  useEffect(() => { onSelectionChange?.(selected) }, [selected, onSelectionChange])
  return (
    <>
      <div
        className="bodyscan-view"
        role="application"
        tabIndex={0}
        aria-label="바디스캔. 좌우 화살표로 회전, 위아래 화살표로 근육 선택, 이스케이프로 선택 해제"
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Escape"
        onKeyDown={event => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            setAngle(value => value + (event.key === 'ArrowLeft' ? -Math.PI / 8 : Math.PI / 8))
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            setSelected(current => adjacentMuscle(current, event.key === 'ArrowDown' ? 1 : -1))
          } else if (event.key === 'Escape') {
            setSelected(null)
          }
        }}
      >
        <Canvas gl={{ alpha: true }} onCreated={({ gl }) => gl.setClearColor(0, 0)} camera={{ position: [-1.08, 0, 3.5], fov: 35 }}>
          <Mannequin angle={angle} selected={selected} select={setSelected} onFrame={onFrame} />
          <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 2} maxPolarAngle={Math.PI / 2} />
        </Canvas>
      </div>
      <p className="bodyscan-selection" aria-live="polite">{selected ? muscleNames[selected] : null}</p>
    </>
  )
}
