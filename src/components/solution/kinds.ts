import type { Access, ResourceKind } from '../../analysis/resources'

export const KIND_BADGE: Record<ResourceKind, string> = {
  sharepoint: 'SP',
  dataverse: 'DV',
  excel: 'XL',
  sql: 'SQL',
  mailbox: '✉',
  http: 'HTTP',
  flow: 'FLOW',
  connection: 'CONN',
  envvar: 'ENV',
}

export const ACCESS_LABEL: Record<Access, string> = {
  trigger: 'triggers',
  read: 'reads',
  write: 'writes',
  call: 'calls',
  use: 'uses',
}

/** Connection references link almost everything to everything, so they start hidden. */
export const DEFAULT_MAP_KINDS: ResourceKind[] = [
  'sharepoint',
  'dataverse',
  'excel',
  'sql',
  'mailbox',
  'http',
  'flow',
  'envvar',
]
