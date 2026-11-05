import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ActionNodeData, BranchNodeData, ContainerNodeData } from '../graph/buildGraph'
import type { Node } from '@xyflow/react'
import type { FlowNode } from '../model/types'

const KIND_ICON: Record<FlowNode['kind'], string> = {
  trigger: '⚡',
  action: '▶',
  condition: '◆',
  switch: '⑂',
  foreach: '↻',
  until: '⟳',
  scope: '▢',
}

const subtitle = (n: FlowNode) =>
  n.connector ? `${n.connector}${n.operationId ? ` · ${n.operationId}` : ''}` : n.type

const Handles = () => (
  <>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </>
)

export function ActionNode({ data, selected }: NodeProps<Node<ActionNodeData, 'action'>>) {
  const n = data.flowNode
  return (
    <div className={`card kind-${n.kind}${selected ? ' selected' : ''}`} title={n.name}>
      <Handles />
      <span className="card-icon">{KIND_ICON[n.kind]}</span>
      <div className="card-text">
        <div className="card-title">{n.displayName}</div>
        <div className="card-sub">{subtitle(n)}</div>
      </div>
    </div>
  )
}

export function ContainerNode({ data, selected }: NodeProps<Node<ContainerNodeData, 'container'>>) {
  const n = data.flowNode
  return (
    <div className={`container kind-${n.kind}${selected ? ' selected' : ''}`}>
      <Handles />
      <div className="container-header" title={n.name}>
        <span className="card-icon">{KIND_ICON[n.kind]}</span>
        <span className="card-title">{n.displayName}</span>
        <span className="card-sub">{n.type}</span>
      </div>
    </div>
  )
}

export function BranchNode({ data }: NodeProps<Node<BranchNodeData, 'branch'>>) {
  const b = data.branch
  const tone = b.id.endsWith('#true') ? 'yes' : b.id.endsWith('#false') ? 'no' : 'case'
  return (
    <div className={`branch branch-${tone}`}>
      <div className="branch-header">{b.label}</div>
      {b.nodes.length === 0 && <div className="branch-empty">(no actions)</div>}
    </div>
  )
}
