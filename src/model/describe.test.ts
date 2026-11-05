import { describe, expect, it } from 'vitest'
import sample from '../samples/invoice-approval.json'
import { loadFlowFromJson } from '../parser/loadFlow'
import { humanize, operationTitle } from './catalog'
import { actionSummary, actionTitle, conditionText, exprText } from './describe'

const flow = loadFlowFromJson(JSON.stringify(sample))
const node = (id: string) => flow.byId.get(id)!

describe('catalog', () => {
  it('humanizes unknown identifiers', () => {
    expect(humanize('GetFileContent')).toBe('Get file content')
    expect(humanize('Manager_V2')).toBe('Manager v2')
    expect(humanize('HTTPRequest')).toBe('Http request')
  })
  it('prefers connector-specific operation titles', () => {
    expect(operationTitle('sharepointonline', 'GetItem')).toBe('Get item')
    expect(operationTitle('commondataserviceforapps', 'GetItem')).toBe('Get a row by ID')
    expect(operationTitle('unknown', 'DoThing')).toBe('Do thing')
  })
})

describe('actionTitle', () => {
  it('names connector actions and built-ins like the designer', () => {
    expect(actionTitle(node('Update_item'))).toBe('SharePoint · Update item')
    expect(actionTitle(node('When_an_item_is_created'))).toBe(
      'SharePoint · When an item is created',
    )
    expect(actionTitle(node('Initialize_ApprovalStatus'))).toBe('Initialize variable')
    expect(actionTitle(node('Notify_each_watcher'))).toBe('Apply to each')
    expect(actionTitle(node('Check_amount'))).toBe('Condition')
  })
})

describe('expressions', () => {
  it('strips @ and unwraps a whole @{…}', () => {
    expect(exprText("@variables('x')")).toBe("variables('x')")
    expect(exprText("@{variables('x')}")).toBe("variables('x')")
    expect(exprText("Hi @{variables('x')}")).toBe(`"Hi @{variables('x')}"`)
    expect(exprText(5)).toBe('5')
  })
  it('renders condition objects', () => {
    expect(
      conditionText({
        and: [
          { greater: ['@a', 1] },
          { or: [{ equals: ['@b', 'x'] }, { not: { equals: ['@c', true] } }] },
        ],
      }),
    ).toBe('a > 1 and (b = "x" or c ≠ true)')
    expect(conditionText({ not: { contains: ['@s', 'y'] } })).toBe('s does not contain "y"')
  })
})

describe('actionSummary', () => {
  it('shows the key input of common actions', () => {
    expect(actionSummary(node('Check_amount'))).toBe("triggerOutputs()?['body/Amount'] > 10000")
    expect(actionSummary(node('Initialize_ApprovalStatus'))).toBe(
      'ApprovalStatus (string) = "Pending"',
    )
    expect(actionSummary(node('Set_status_Approved'))).toBe('ApprovalStatus = "Approved"')
    expect(actionSummary(node('Switch_on_outcome'))).toBe(
      "on body('Start_and_wait_for_an_approval')?['outcome']",
    )
    expect(actionSummary(node('Notify_each_watcher'))).toBe(
      "for each in triggerOutputs()?['body/Watchers']",
    )
    expect(actionSummary(node('Update_item'))).toBe('"Invoices"')
    expect(actionSummary(node('Terminate'))).toBe('status: Failed')
  })
})
