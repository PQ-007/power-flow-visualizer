import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { FlowMapData, ResourceMapData } from '../../graph/buildSolutionGraph'
import { actionTitle } from '../../model/describe'
import { KIND_BADGE } from './kinds'
import { useMapActions } from './mapContext'

const Handles = () => (
  <>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </>
)

export function FlowMapNode({ data, selected }: NodeProps<Node<FlowMapData, 'flowMap'>>) {
  const { openFlow } = useMapActions()
  const { flow, flowIndex } = data
  const trigger = flow.triggers[0]
  return (
    <div
      className={`map-flow${selected ? ' selected' : ''}`}
      onDoubleClick={() => openFlow(flowIndex)}
      title="Double-click to open this flow"
    >
      <Handles />
      <div className="card-title">{flow.displayName}</div>
      <div className="card-sub">
        {trigger ? actionTitle(trigger) : 'No trigger'} · {flow.byId.size} steps
      </div>
    </div>
  )
}

export function ResourceMapNode({
  data,
  selected,
}: NodeProps<Node<ResourceMapData, 'resourceMap'>>) {
  const r = data.resource
  return (
    <div className={`map-resource kind-${r.kind}${selected ? ' selected' : ''}`} title={r.label}>
      <Handles />
      <span className="kind-badge">{KIND_BADGE[r.kind]}</span>
      <div className="card-text">
        <div className="card-title">
          {r.dynamic && (
            <span className="dyn" title="Name computed at run time">
              ƒx{' '}
            </span>
          )}
          {r.label}
        </div>
        {r.detail && <div className="card-sub">{r.detail}</div>}
      </div>
    </div>
  )
}
