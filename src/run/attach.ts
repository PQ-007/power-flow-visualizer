import type { ParsedFlow } from '../model/types'
import { matchRun } from './overlay'
import type { RunData } from './parseRun'

/** Minimum share of a run's actions a flow must contain to be considered its flow. */
const MIN_COVERAGE = 0.5

/**
 * Which loaded flow a run belongs to: the flow with the run's flow id, otherwise `preferred`
 * (the flow on screen) if it fits, otherwise the flow containing most of the run's actions.
 */
export function pickFlowForRun(
  flows: ParsedFlow[],
  run: RunData,
  preferred?: number,
): number | undefined {
  if (run.flowId) {
    const byId = flows.findIndex((f) => f.id === run.flowId)
    if (byId >= 0) return byId
  }
  const coverage = flows.map((f) => matchRun(f, run).coverage)
  if (preferred !== undefined && coverage[preferred] >= MIN_COVERAGE) return preferred
  let best = -1
  coverage.forEach((c, i) => {
    if (c >= MIN_COVERAGE && (best < 0 || c > coverage[best])) best = i
  })
  return best >= 0 ? best : undefined
}
