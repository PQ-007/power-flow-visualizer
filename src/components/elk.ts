import ELK from 'elkjs/lib/elk-api'
import workerUrl from 'elkjs/lib/elk-worker.min.js?url'

/**
 * Browser ELK instance: layout runs in a Web Worker so large flows don't freeze the UI,
 * and the ~1.5 MB layout engine is loaded as a separate file instead of the main bundle.
 */
export const elk = new ELK({ workerUrl })
