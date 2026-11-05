import type { FlowNode } from '../model/types'

export const KIND_ICON: Record<FlowNode['kind'], string> = {
  trigger: '⚡',
  action: '▶',
  condition: '◆',
  switch: '⑂',
  foreach: '↻',
  until: '⟳',
  scope: '▢',
}
