import { useEffect, useMemo, useRef } from 'react'
import { actionSummary, actionTitle } from '../model/describe'
import { isContainer } from '../model/tree'
import type { FlowNode, ParsedFlow } from '../model/types'
import { KIND_ICON } from './icons'

interface Props {
  flow: ParsedFlow
  collapsed: ReadonlySet<string>
  matches: ReadonlySet<string> | null
  roles?: ReadonlyMap<string, 'write' | 'read'> | null
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleCollapse: (id: string) => void
}

/**
 * Table-of-contents view of the flow. Shares collapse state with the canvas; while searching,
 * it shows only matches and the containers that lead to them (regardless of collapse state).
 */
export function OutlinePanel({
  flow,
  collapsed,
  matches,
  roles,
  selectedId,
  onSelect,
  onToggleCollapse,
}: Props) {
  // Ids of nodes that are, or contain, a search match.
  const visible = useMemo(() => {
    if (!matches) return null
    const keep = new Set<string>()
    for (const id of matches) {
      let cur: string | undefined = id
      while (cur && !keep.has(cur)) {
        keep.add(cur)
        cur = flow.byId.get(cur)?.parentId
      }
    }
    return keep
  }, [flow, matches])

  const selectedRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const renderNodes = (nodes: FlowNode[], depth: number) =>
    nodes
      .filter((n) => !visible || visible.has(n.id))
      .map((n) => {
        const container = isContainer(n)
        const open = container && (visible ? true : !collapsed.has(n.id))
        const selected = n.id === selectedId
        const multiBranch = n.kind === 'condition' || n.kind === 'switch'
        return (
          <li key={n.id}>
            <div
              ref={selected ? selectedRef : undefined}
              className={[
                'outline-row',
                selected && 'selected',
                matches?.has(n.id) && 'match',
                roles?.has(n.id) && `role-${roles.get(n.id)}`,
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ paddingLeft: 8 + depth * 14 }}
              title={[actionTitle(n), actionSummary(n)].filter(Boolean).join('\n')}
              onClick={() => onSelect(n.id)}
            >
              {container ? (
                <button
                  className="toggle"
                  aria-label={open ? 'Collapse' : 'Expand'}
                  disabled={!!visible}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleCollapse(n.id)
                  }}
                >
                  {open ? '▾' : '▸'}
                </button>
              ) : (
                <span className="toggle-spacer" />
              )}
              <span className="outline-icon">{KIND_ICON[n.kind]}</span>
              <span className="outline-name">{n.displayName}</span>
            </div>
            {open &&
              (multiBranch ? (
                <ul>
                  {n.branches
                    .filter((b) => !visible || b.nodes.some((c) => visible.has(c.id)))
                    .map((b) => (
                      <li key={b.id}>
                        <div className="outline-branch" style={{ paddingLeft: 30 + depth * 14 }}>
                          {b.label}
                        </div>
                        <ul>{renderNodes(b.nodes, depth + 2)}</ul>
                      </li>
                    ))}
                </ul>
              ) : (
                <ul>{renderNodes(n.branches[0]?.nodes ?? [], depth + 1)}</ul>
              ))}
          </li>
        )
      })

  return (
    <nav className="outline" aria-label="Flow outline">
      {matches && matches.size === 0 && <div className="outline-empty">No matches</div>}
      <ul>
        {renderNodes(flow.triggers, 0)}
        {renderNodes(flow.actions, 0)}
      </ul>
    </nav>
  )
}
