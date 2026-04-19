import { describe, it, expect } from 'vitest'
import { substituteTemplate } from '../template-substitute'

describe('substituteTemplate', () => {
  it('replaces all six placeholders', () => {
    const html = '<p>{{coupleName1}} & {{coupleName2}}</p><p>{{date}}</p><p>{{venue}} - {{venueAddress}}</p><p>{{wording}}</p>'
    const result = substituteTemplate(html, {
      coupleName1: 'Alex',
      coupleName2: 'Jordan',
      date: 'June 14, 2026',
      venue: 'Old Mill',
      venueAddress: '123 River Lane',
      wording: 'Please join us',
    })
    expect(result).toBe('<p>Alex & Jordan</p><p>June 14, 2026</p><p>Old Mill - 123 River Lane</p><p>Please join us</p>')
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    const html = '{{coupleName1}} and {{coupleName1}}'
    const result = substituteTemplate(html, {
      coupleName1: 'Alex',
      coupleName2: '',
      date: '',
      venue: '',
      venueAddress: '',
      wording: '',
    })
    expect(result).toBe('Alex and Alex')
  })

  it('leaves unknown placeholders untouched', () => {
    const html = '{{coupleName1}} and {{unknown}}'
    const result = substituteTemplate(html, {
      coupleName1: 'Alex',
      coupleName2: '',
      date: '',
      venue: '',
      venueAddress: '',
      wording: '',
    })
    expect(result).toBe('Alex and {{unknown}}')
  })

  it('is idempotent: re-applying with the same data produces the same output', () => {
    const html = '<p>{{coupleName1}}</p>'
    const data = {
      coupleName1: 'Alex',
      coupleName2: '',
      date: '',
      venue: '',
      venueAddress: '',
      wording: '',
    }
    const once = substituteTemplate(html, data)
    const twice = substituteTemplate(once, data)
    expect(twice).toBe(once)
  })
})
