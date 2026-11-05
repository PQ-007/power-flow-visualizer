/**
 * Offline lookup tables that turn internal identifiers into the names people see in the
 * Power Automate designer. Unknown values fall back to `humanize()`, so missing entries
 * only cost polish, never correctness. Add entries as real flows reveal them.
 */

const CONNECTORS: Record<string, string> = {
  sharepointonline: 'SharePoint',
  office365: 'Office 365 Outlook',
  office365users: 'Office 365 Users',
  office365groups: 'Office 365 Groups',
  outlook: 'Outlook.com',
  teams: 'Microsoft Teams',
  approvals: 'Approvals',
  commondataserviceforapps: 'Microsoft Dataverse',
  commondataservice: 'Common Data Service (legacy)',
  onedriveforbusiness: 'OneDrive for Business',
  onedrive: 'OneDrive',
  excelonlinebusiness: 'Excel Online (Business)',
  sql: 'SQL Server',
  planner: 'Planner',
  todo: 'Microsoft To Do',
  flowpush: 'Notifications',
  sendmail: 'Mail',
  powerbi: 'Power BI',
  powerplatformforadmins: 'Power Platform for Admins',
  flowmanagement: 'Power Automate Management',
  azuread: 'Microsoft Entra ID',
  webcontents: 'HTTP with Microsoft Entra ID',
  wordonlinebusiness: 'Word Online (Business)',
  formsforbusiness: 'Microsoft Forms',
  microsoftforms: 'Microsoft Forms',
  dynamicscrmonline: 'Dynamics 365',
  azureblob: 'Azure Blob Storage',
  keyvault: 'Azure Key Vault',
  servicebus: 'Service Bus',
  conversionservice: 'Content Conversion',
}

/** Built-in action/trigger types (no connector). */
const BUILTIN_TYPES: Record<string, string> = {
  initializevariable: 'Initialize variable',
  setvariable: 'Set variable',
  incrementvariable: 'Increment variable',
  decrementvariable: 'Decrement variable',
  appendtoarrayvariable: 'Append to array variable',
  appendtostringvariable: 'Append to string variable',
  compose: 'Compose',
  parsejson: 'Parse JSON',
  query: 'Filter array',
  select: 'Select',
  table: 'Create table',
  join: 'Join',
  http: 'HTTP',
  httpwebhook: 'HTTP Webhook',
  response: 'Response',
  terminate: 'Terminate',
  wait: 'Delay',
  workflow: 'Run a child flow',
  if: 'Condition',
  switch: 'Switch',
  foreach: 'Apply to each',
  until: 'Do until',
  scope: 'Scope',
  recurrence: 'Recurrence',
  request: 'When a HTTP request is received',
  expression: 'Expression',
}

/** Request trigger `kind` values. */
const REQUEST_KINDS: Record<string, string> = {
  button: 'Manually trigger a flow',
  powerapp: 'Power Apps',
  powerappv2: 'Power Apps (V2)',
  http: 'When a HTTP request is received',
  skills: 'Run from Copilot',
}

/** Connector operation titles. Key: `connector:operationId` or just `operationId`. */
const OPERATIONS: Record<string, string> = {
  'sharepointonline:GetItems': 'Get items',
  'sharepointonline:GetItem': 'Get item',
  'sharepointonline:PostItem': 'Create item',
  'sharepointonline:PatchItem': 'Update item',
  'sharepointonline:DeleteItem': 'Delete item',
  'sharepointonline:GetOnNewItems': 'When an item is created',
  'sharepointonline:GetOnUpdatedItems': 'When an item is created or modified',
  'sharepointonline:HttpRequest': 'Send an HTTP request to SharePoint',
  'sharepointonline:GetFileContent': 'Get file content',
  'sharepointonline:CreateFile': 'Create file',
  'office365:SendEmailV2': 'Send an email (V2)',
  'office365:OnNewEmailV3': 'When a new email arrives (V3)',
  'office365users:Manager_V2': 'Get manager (V2)',
  'office365users:UserProfile_V2': 'Get user profile (V2)',
  'office365users:MyProfile_V2': 'Get my profile (V2)',
  'teams:PostMessageToConversation': 'Post message in a chat or channel',
  'teams:PostCardToConversation': 'Post card in a chat or channel',
  'approvals:StartAndWaitForAnApproval': 'Start and wait for an approval',
  'approvals:CreateAnApproval': 'Create an approval',
  'approvals:WaitForAnApproval': 'Wait for an approval',
  'commondataserviceforapps:ListRecords': 'List rows',
  'commondataserviceforapps:GetItem': 'Get a row by ID',
  'commondataserviceforapps:CreateRecord': 'Add a new row',
  'commondataserviceforapps:UpdateRecord': 'Update a row',
  'commondataserviceforapps:UpdateOnlyRecord': 'Update a row',
  'commondataserviceforapps:DeleteRecord': 'Delete a row',
  'commondataserviceforapps:SubscribeWebhookTrigger': 'When a row is added, modified or deleted',
  'excelonlinebusiness:GetItems': 'List rows present in a table',
  'excelonlinebusiness:AddRowV2': 'Add a row into a table',
  'excelonlinebusiness:PatchItem': 'Update a row',
}

/** `GetFileContent` → `Get file content`, `Manager_V2` → `Manager V2`. */
export function humanize(id: string): string {
  const spaced = id
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

export function connectorName(connector: string): string {
  return CONNECTORS[connector.toLowerCase()] ?? humanize(connector)
}

export function operationTitle(connector: string | undefined, operationId: string): string {
  return (
    (connector && OPERATIONS[`${connector.toLowerCase()}:${operationId}`]) ||
    OPERATIONS[operationId] ||
    humanize(operationId)
  )
}

export function builtinTypeName(type: string, kind?: string): string {
  const t = type.toLowerCase()
  if (t === 'request' && kind) return REQUEST_KINDS[kind.toLowerCase()] ?? BUILTIN_TYPES.request
  return BUILTIN_TYPES[t] ?? humanize(type)
}
