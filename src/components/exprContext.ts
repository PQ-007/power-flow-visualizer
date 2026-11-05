import { createContext, useContext } from 'react'
import type { ParsedFlow } from '../model/types'

export interface ExprLinks {
  flow: ParsedFlow
  /** Action whose definition is being shown (resolves `item()`). */
  nodeId: string
  onNavigate: (id: string) => void
  onSelectVariable: (name: string) => void
}

export const ExprContext = createContext<ExprLinks | null>(null)
export const useExprLinks = () => useContext(ExprContext)
