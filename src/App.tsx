import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { buildSolutionIndex } from './analysis/solution'
import { FlowWorkspace, type FlowEntry } from './components/FlowWorkspace'
import { SolutionWorkspace } from './components/solution/SolutionWorkspace'
import type { ParsedFlow } from './model/types'
import { loadFlowFromJson, loadFlowsFromEntries, loadFlowsFromFiles } from './parser/loadFlow'
import { pickFlowForRun } from './run/attach'
import { matchRun, rootCauses } from './run/overlay'
import { loadRunFromText, parseRun, type RunData } from './run/parseRun'

type View = { kind: 'solution' } | { kind: 'flow'; index: number; entry?: FlowEntry; nonce: number }

export default function App() {
  const [flows, setFlows] = useState<ParsedFlow[]>([])
  const [view, setView] = useState<View>({ kind: 'solution' })
  const [loadId, setLoadId] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null)
  /** Run results overlaid on flows, by flow index. */
  const [runs, setRuns] = useState<Record<number, RunData>>({})

  const show = (list: ParsedFlow[]) => {
    setFlows(list)
    setRuns({})
    setLoadId((n) => n + 1)
    setView(list.length > 1 ? { kind: 'solution' } : { kind: 'flow', index: 0, nonce: 0 })
    setError(null)
  }

  /**
   * Attaches runs to flows (the newly loaded `list`, or the flows already open) and shows the
   * flow of the last one, landing on its first failure.
   */
  const attachRuns = (list: ParsedFlow[], loaded: RunData[], fresh: boolean) => {
    if (list.length === 0) {
      setError('Open the flow (or its solution) first, then load its run.')
      return
    }
    const current = !fresh && view.kind === 'flow' ? view.index : list.length === 1 ? 0 : undefined
    const next: Record<number, RunData> = fresh ? {} : { ...runs }
    let target: number | undefined
    const misses: string[] = []
    for (const run of loaded) {
      const i = pickFlowForRun(list, run, current)
      if (i === undefined) misses.push(run.flowName ?? run.name ?? 'run')
      else {
        next[i] = run
        target = i
      }
    }
    if (fresh) {
      setFlows(list)
      setLoadId((n) => n + 1)
    }
    setRuns(next)
    setError(
      misses.length
        ? `Couldn't match ${misses.join(', ')} to a loaded flow (different flow or version?)`
        : null,
    )
    if (target !== undefined) {
      const flow = list[target]
      const firstFailure = rootCauses(flow, matchRun(flow, next[target]))[0]
      openFlow(target, firstFailure ? { selectId: firstFailure } : undefined)
    } else if (fresh) {
      setView(list.length > 1 ? { kind: 'solution' } : { kind: 'flow', index: 0, nonce: 0 })
    }
  }

  const open = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      // Run files are JSON too: tell them apart from flow definitions by content.
      const runFiles: RunData[] = []
      const flowFiles: File[] = []
      for (const f of files) {
        const run =
          !f.webkitRelativePath && /\.json$/i.test(f.name) ? loadRunFromText(await f.text()) : null
        if (run) runFiles.push(run)
        else flowFiles.push(f)
      }
      const loaded = flowFiles.length ? await loadFlowsFromFiles(flowFiles) : null
      if (loaded && loaded.length === 0) throw new Error('No flows found')
      if (runFiles.length) attachRuns(loaded ?? flows, runFiles, !!loaded)
      else if (loaded) show(loaded)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Samples are loaded on demand so they don't weigh on the main bundle.
  const loadSample = async (which: string) => {
    if (which === 'flow') {
      const sample = (await import('./samples/invoice-approval.json')).default
      show([loadFlowFromJson(JSON.stringify(sample))])
    } else if (which === 'flow-run') {
      const sample = (await import('./samples/invoice-approval.json')).default
      const run = (await import('./samples/runs/invoice-approval-failed-run.json')).default
      attachRuns([loadFlowFromJson(JSON.stringify(sample))], [parseRun(run)!], true)
    } else if (which === 'solution') {
      const { sampleSolutionEntries } = await import('./samples/solution')
      show(loadFlowsFromEntries(sampleSolutionEntries))
    }
  }

  const index = useMemo(() => (flows.length > 1 ? buildSolutionIndex(flows) : null), [flows])

  const openFlow = useCallback(
    (i: number, entry?: FlowEntry) =>
      setView((v) => ({
        kind: 'flow',
        index: i,
        entry,
        nonce: (v.kind === 'flow' ? v.nonce : 0) + 1,
      })),
    [],
  )
  const solution = useMemo(
    () => (index ? { index, onOpenFlow: openFlow } : undefined),
    [index, openFlow],
  )

  const activeFlow = view.kind === 'flow' ? flows[view.index] : undefined

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e: DragEvent) => {
        e.preventDefault()
        void open(e.dataTransfer.files)
      }}
    >
      <header className="toolbar">
        <strong>Power Flow Visualizer</strong>
        <label className="button" title="Flow package, solution .zip or flow definition .json">
          Open file
          <input
            type="file"
            accept=".zip,.json"
            multiple
            hidden
            onChange={(e) => open(e.target.files)}
          />
        </label>
        <label className="button" title="An unpacked solution folder (pac solution unpack)">
          Open folder
          <input
            type="file"
            hidden
            ref={(el) => el?.setAttribute('webkitdirectory', '')}
            onChange={(e) => open(e.target.files)}
          />
        </label>
        <select
          value=""
          aria-label="Load a sample"
          onChange={(e) => void loadSample(e.target.value)}
        >
          <option value="" disabled>
            Samples…
          </option>
          <option value="flow">Sample flow</option>
          <option value="flow-run">Sample flow + failed run</option>
          <option value="solution">Sample solution (5 flows)</option>
        </select>
        {index && (
          <>
            <span className="divider" />
            <button
              aria-pressed={view.kind === 'solution'}
              onClick={() => setView({ kind: 'solution' })}
              title="Map and search across all flows"
            >
              ◫ Solution
            </button>
            <select
              aria-label="Flow"
              value={view.kind === 'flow' ? view.index : ''}
              onChange={(e) => openFlow(Number(e.target.value))}
            >
              <option value="" disabled>
                Open flow…
              </option>
              {flows.map((f, i) => (
                <option key={i} value={i}>
                  {f.displayName}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="toolbar-slot" ref={setToolbarSlot} />
      </header>
      {error && <div className="error">{error}</div>}
      <main>
        {view.kind === 'flow' && activeFlow ? (
          <FlowWorkspace
            key={`${loadId}:${view.index}:${view.nonce}`}
            flow={activeFlow}
            entry={view.entry}
            toolbarSlot={toolbarSlot}
            solution={solution}
            run={runs[view.index]}
            onOpenFiles={open}
            onClearRun={() => {
              const i = view.index
              setRuns(({ [i]: _removed, ...rest }) => rest)
            }}
          />
        ) : index ? (
          <SolutionWorkspace
            key={loadId}
            index={index}
            toolbarSlot={toolbarSlot}
            onOpenFlow={openFlow}
          />
        ) : (
          <div className="empty">
            <p>
              Drop a Power Automate export (.zip), a solution .zip or a flow definition (.json)
              here, or open an unpacked solution folder.
            </p>
            <p>Files are read locally in your browser — nothing is uploaded.</p>
          </div>
        )}
      </main>
    </div>
  )
}
