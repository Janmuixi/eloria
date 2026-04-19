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

  it('resolves {{t:a.b}} from a translations object', () => {
    const result = substituteTemplate(
      '<p>{{t:templates.together}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Junto con sus familias' } },
    )
    expect(result).toBe('<p>Junto con sus familias</p>')
  })

  it('resolves deeply nested translation paths', () => {
    const result = substituteTemplate(
      '<p>{{t:a.b.c.d}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { a: { b: { c: { d: 'deep value' } } } },
    )
    expect(result).toBe('<p>deep value</p>')
  })

  it('passes unknown translation keys through unchanged', () => {
    const result = substituteTemplate(
      '<p>{{t:no.such.key}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Hi' } },
    )
    expect(result).toBe('<p>{{t:no.such.key}}</p>')
  })

  it('passes t: tokens through unchanged when translations arg is omitted', () => {
    const result = substituteTemplate(
      '<p>{{t:templates.together}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
    )
    expect(result).toBe('<p>{{t:templates.together}}</p>')
  })

  it('resolves data and translation tokens in the same template', () => {
    const result = substituteTemplate(
      '<p>{{t:templates.together}}</p><h1>{{coupleName1}}</h1>',
      {
        coupleName1: 'Maria', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Hi' } },
    )
    expect(result).toBe('<p>Hi</p><h1>Maria</h1>')
  })

  it('does not re-expand placeholders that appear inside a translation value', () => {
    const result = substituteTemplate(
      '<p>{{t:templates.together}}</p>',
      {
        coupleName1: 'Maria', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Hi {{coupleName1}}' } },
    )
    expect(result).toBe('<p>Hi {{coupleName1}}</p>')
  })

  it('passes a t: token through when the resolved path is not a string', () => {
    const result = substituteTemplate(
      '<p>{{t:templates}}</p>',
      {
        coupleName1: '', coupleName2: '', date: '',
        venue: '', venueAddress: '', wording: '',
      },
      { templates: { together: 'Hi' } },
    )
    expect(result).toBe('<p>{{t:templates}}</p>')
  })
})
