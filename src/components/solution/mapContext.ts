import { createContext, useContext } from 'react'

export const MapContext = createContext<{ openFlow: (flowIndex: number) => void }>({
  openFlow: () => {},
})
export const useMapActions = () => useContext(MapContext)
