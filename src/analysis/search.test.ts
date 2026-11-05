import { describe, expect, it } from 'vitest'
import sample from '../samples/invoice-approval.json'
import { loadFlowFromJson } from '../parser/loadFlow'
import { findMatches } from './search'

const flow = loadFlowFromJson(JSON.stringify(sample))
const ids = (q: string) => [...findMatches(flow, q)].sort()

describe('findMatches', () => {
  it('matches names, friendly connector names and inputs', () => {
    expect(ids('update item')).toEqual(['Update_item'])
    expect(ids('teams')).toEqual(['Post_message_in_Teams'])
    expect(ids('ApprovalStatus')).toContain('Update_item') // used in an input expression
  })
  it('requires every term and ignores case', () => {
    expect(ids('sharepoint INVOICES')).toEqual(['Update_item', 'When_an_item_is_created'])
  })
  it('does not match a container on its nested actions', () => {
    expect(ids('PostMessageToConversation')).toEqual(['Post_message_in_Teams'])
  })
  it('returns nothing for an empty query', () => {
    expect(findMatches(flow, '   ').size).toBe(0)
  })
})
