import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type {
  ActionNodeData,
  BranchNodeData,
  CollapsedNodeData,
  ContainerNodeData,
} from '../graph/buildGraph'
import { actionSummary, actionTitle } from '../model/describe'
import { useCanvasActions } from './canvasContext'
import { KIND_ICON } from './icons'

const Handles = () => (
  <>
    <Handle type="target" position={Position.Top} isConnectable={false} />
    <Handle type="source" position={Position.Bottom} isConnectable={false} />
  </>
)

function ToggleButton({ id, expanded }: { id: string; expanded: boolean }) {
  const { toggleCollapse } = useCanvasActions()
  return (
    <button
      className="toggle nodrag"
      aria-label={expanded ? 'Collapse' : 'Expand'}
      title={expanded ? 'Collapse' : 'Expand'}
      onClick={(e) => {
        e.stopPropagation()
        toggleCollapse(id)
      }}
    >
      {expanded ? '▾' : '▸'}
    </button>
  )
}

export function ActionNode({ data, selected }: NodeProps<Node<ActionNodeData, 'action'>>) {
  const n = data.flowNode
  const summary = actionSummary(n)
  return (
    <div className={`card kind-${n.kind}${selected ? ' selected' : ''}`} title={n.name}>
      <Handles />
      <span className="card-icon">{KIND_ICON[n.kind]}</span>
      <div className="card-text">
        <div className="card-title">{n.displayName}</div>
        <div className="card-sub">{actionTitle(n)}</div>
        {summary && (
          <div className="card-summary" title={summary}>
            {summary}
          </div>
        )}
      </div>
    </div>
  )
}

export function CollapsedNode({ data, selected }: NodeProps<Node<CollapsedNodeData, 'collapsed'>>) {
  const n = data.flowNode
  const summary = actionSummary(n)
  return (
    <div className={`card collapsed kind-${n.kind}${selected ? ' selected' : ''}`} title={n.name}>
      <Handles />
      <ToggleButton id={n.id} expanded={false} />
      <span className="card-icon">{KIND_ICON[n.kind]}</span>
      <div className="card-text">
        <div className="card-title">{n.displayName}</div>
        <div className="card-sub">
          {actionTitle(n)} · <span className="badge">{data.hiddenCount} inside</span>
        </div>
        {summary && (
          <div className="card-summary" title={summary}>
            {summary}
          </div>
        )}
      </div>
    </div>
  )
}

export function ContainerNode({ data, selected }: NodeProps<Node<ContainerNodeData, 'container'>>) {
  const n = data.flowNode
  const summary = actionSummary(n)
  return (
    <div className={`container kind-${n.kind}${selected ? ' selected' : ''}`}>
      <Handles />
      <div className="container-header" title={n.name}>
        <ToggleButton id={n.id} expanded />
        <span className="card-icon">{KIND_ICON[n.kind]}</span>
        <div className="card-text">
          <div>
            <span className="card-title">{n.displayName}</span>{' '}
            <span className="card-sub">{actionTitle(n)}</span>
          </div>
          {summary && (
            <div className="card-summary" title={summary}>
              {summary}
            </div>
          )}
        </div>
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
