import { describe, it, expect } from 'vitest'
import { renderInvitation } from '../render-invitation'

const sampleTemplate = `<!DOCTYPE html>
<html><head><title>T</title></head>
<body>
<h1>{{coupleName1}} &amp; {{coupleName2}}</h1>
<p>{{date}}</p>
<p>{{venue}}, {{venueAddress}}</p>
<p>{{wording}}</p>
{{#if venueMapUrl}}<a href="{{venueMapUrl}}">{{t:templates.viewOnMap}}</a>{{/if}}
{{#if description}}<p class="desc">{{description}}</p>{{/if}}
</body></html>`

const sampleTranslations = {
  templates: { viewOnMap: 'View on map' },
}

const baseEvent = {
  coupleName1: 'Alice',
  coupleName2: 'Bob',
  date: '2026-06-15',
  venue: 'Grand Hotel',
  venueAddress: '123 Main St',
  venueMapUrl: null as string | null,
  description: null as string | null,
  customization: null as string | null,
  language: 'en',
}

describe('renderInvitation', () => {
  it('substitutes couple, date, and venue values', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    expect(out).toContain('Alice &amp; Bob')
    expect(out).toContain('Grand Hotel, 123 Main St')
  })

  it('formats the date using the event language', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    // en locale, long date
    expect(out).toMatch(/June 15, 2026/)
  })

  it('formats the date in Spanish when language is es', () => {
    const out = renderInvitation({ ...baseEvent, language: 'es' }, sampleTemplate, {})
    expect(out).toMatch(/junio/)
  })

  it('uses wording from customization JSON when present', () => {
    const event = { ...baseEvent, customization: JSON.stringify({ wording: 'Please celebrate with us' }) }
    const out = renderInvitation(event, sampleTemplate, sampleTranslations)
    expect(out).toContain('Please celebrate with us')
  })

  it('falls back to empty wording when customization is null', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    // no throw, no literal "{{wording}}" left in output
    expect(out).not.toContain('{{wording}}')
  })

  it('includes the map link block when venueMapUrl is set', () => {
    const event = { ...baseEvent, venueMapUrl: 'https://maps.example.com/x' }
    const out = renderInvitation(event, sampleTemplate, sampleTranslations)
    expect(out).toContain('href="https://maps.example.com/x"')
    expect(out).toContain('View on map')
  })

  it('omits the map link block when venueMapUrl is null', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    expect(out).not.toContain('View on map')
  })

  it('includes the description block when description is set', () => {
    const event = { ...baseEvent, description: 'Ceremony outdoors' }
    const out = renderInvitation(event, sampleTemplate, sampleTranslations)
    expect(out).toContain('class="desc">Ceremony outdoors')
  })

  it('injects a noindex robots meta tag into <head>', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    expect(out).toMatch(/<meta name="robots" content="noindex, nofollow"\s*\/?>/i)
    // Must land inside <head>, before </head>
    const headEnd = out.indexOf('</head>')
    const metaIdx = out.search(/<meta name="robots"/i)
    expect(metaIdx).toBeGreaterThan(-1)
    expect(metaIdx).toBeLessThan(headEnd)
  })

  it('injects a height-reporting script before </body>', () => {
    const out = renderInvitation(baseEvent, sampleTemplate, sampleTranslations)
    expect(out).toMatch(/postMessage\(\s*\{\s*type:\s*['"]invitation-height['"]/)
    const scriptIdx = out.search(/postMessage\(\s*\{\s*type:\s*['"]invitation-height['"]/)
    const bodyEnd = out.indexOf('</body>')
    expect(scriptIdx).toBeGreaterThan(-1)
    expect(scriptIdx).toBeLessThan(bodyEnd)
  })
})
