/**
 * Invented sample solution ("Finance automation") laid out like an unpacked solution export,
 * used by "Load sample solution" and tests. Loaded through the same code path as a real export.
 */
const files = import.meta.glob<string>(['./Workflows/*.json', './Other/*.xml'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Path (e.g. `Workflows/InvoiceApproval-….json`) → file text. */
export const sampleSolutionEntries: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, text]) => [path.replace(/^\.\//, ''), text]),
)
