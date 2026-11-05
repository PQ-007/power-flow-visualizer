import { useState, type DragEvent } from 'react'
import { FlowCanvas } from './components/FlowCanvas'
import { DetailsPanel } from './components/DetailsPanel'
import type { FlowNode, ParsedFlow } from './model/types'
import { loadFlowFromJson, loadFlowsFromFile } from './parser/loadFlow'
import sample from './samples/invoice-approval.json'

export default function App() {
  const [flows, setFlows] = useState<ParsedFlow[]>([])
  const [active, setActive] = useState(0)
  const [selected, setSelected] = useState<FlowNode | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const open = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      const loaded = (await Promise.all([...files].map(loadFlowsFromFile))).flat()
      setFlows(loaded)
      setActive(0)
      setSelected(null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const loadSample = () => {
    setFlows([loadFlowFromJson(JSON.stringify(sample))])
    setActive(0)
    setSelected(null)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    void open(e.dataTransfer.files)
  }

  const flow = flows[active]

  return (
    <div className="app" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="toolbar">
        <strong>Power Flow Visualizer</strong>
        <label className="button">
          Open .zip / .json
          <input
            type="file"
            accept=".zip,.json"
            multiple
            hidden
            onChange={(e) => open(e.target.files)}
          />
        </label>
        <button onClick={loadSample}>Load sample</button>
        {flows.length > 1 && (
          <select value={active} onChange={(e) => setActive(Number(e.target.value))}>
            {flows.map((f, i) => (
              <option key={i} value={i}>
                {f.displayName}
              </option>
            ))}
          </select>
        )}
        {flow && (
          <input
            className="search"
            placeholder="Search actions, connectors, expressions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {flow && flow.warnings.length > 0 && (
          <span className="warn" title={flow.warnings.join('\n')}>
            ⚠ {flow.warnings.length} warning(s)
          </span>
        )}
      </header>
      {error && <div className="error">{error}</div>}
      <main>
        {flow ? (
          <FlowCanvas flow={flow} search={search} onSelect={setSelected} />
        ) : (
          <div className="empty">
            <p>Drop a Power Automate export (.zip) or flow definition (.json) here.</p>
            <p>Files are read locally in your browser — nothing is uploaded.</p>
          </div>
        )}
        {selected && <DetailsPanel node={selected} onClose={() => setSelected(null)} />}
      </main>
    </div>
  )
}
