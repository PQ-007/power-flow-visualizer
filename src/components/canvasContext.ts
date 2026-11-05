import { createContext, useContext } from 'react'

export interface CanvasActions {
  toggleCollapse: (id: string) => void
}

export const CanvasContext = createContext<CanvasActions>({ toggleCollapse: () => {} })
export const useCanvasActions = () => useContext(CanvasContext)
