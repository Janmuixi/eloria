import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadTemplatesFromDisk } from '../load-templates'

describe('loadTemplatesFromDisk', () => {
  let tmpDir: string
  const tierMap = new Map<string, number>([['basic', 10], ['premium', 20]])

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'eloria-templates-'))
  })
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeTemplate(slug: string, html: string, meta: object) {
    mkdirSync(join(tmpDir, slug), { recursive: true })
    writeFileSync(join(tmpDir, slug, 'template.html'), html)
    writeFileSync(join(tmpDir, slug, 'meta.json'), JSON.stringify(meta))
  }

  it('loads a single valid template', () => {
    writeTemplate('sample', '<p>{{coupleName1}}</p>', {
      name: 'Sample',
      category: 'modern',
      colorScheme: { primary: '#000', secondary: '#111', background: '#fff', text: '#222', accent: '#333' },
      fontPairings: { heading: 'Inter', body: 'Inter' },
      tags: ['a', 'b'],
      minimumTier: 'basic',
    })
    const rows = loadTemplatesFromDisk(tmpDir, tierMap)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      slug: 'sample',
      name: 'Sample',
      category: 'modern',
      htmlTemplate: '<p>{{coupleName1}}</p>',
      cssTemplate: '',
      previewImageUrl: '/images/templates/sample.jpg',
      minimumTierId: 10,
    })
    expect(JSON.parse(rows[0].colorScheme)).toEqual({ primary: '#000', secondary: '#111', background: '#fff', text: '#222', accent: '#333' })
    expect(JSON.parse(rows[0].fontPairings)).toEqual({ heading: 'Inter', body: 'Inter' })
    expect(JSON.parse(rows[0].tags)).toEqual(['a', 'b'])
  })

  it('loads multiple templates sorted by slug', () => {
    writeTemplate('zebra', '<p>z</p>', {
      name: 'Z', category: 'x',
      colorScheme: { primary: '#0', secondary: '#0', background: '#0', text: '#0', accent: '#0' },
      fontPairings: { heading: 'f', body: 'f' }, tags: [], minimumTier: 'basic',
    })
    writeTemplate('apple', '<p>a</p>', {
      name: 'A', category: 'x',
      colorScheme: { primary: '#0', secondary: '#0', background: '#0', text: '#0', accent: '#0' },
      fontPairings: { heading: 'f', body: 'f' }, tags: [], minimumTier: 'premium',
    })
    const rows = loadTemplatesFromDisk(tmpDir, tierMap)
    expect(rows.map(r => r.slug)).toEqual(['apple', 'zebra'])
    expect(rows[0].minimumTierId).toBe(20)
    expect(rows[1].minimumTierId).toBe(10)
  })

  it('throws a useful error when template.html is missing', () => {
    mkdirSync(join(tmpDir, 'broken'))
    writeFileSync(join(tmpDir, 'broken', 'meta.json'), '{}')
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/template\.html.*broken/)
  })

  it('throws a useful error when meta.json is missing', () => {
    mkdirSync(join(tmpDir, 'broken'))
    writeFileSync(join(tmpDir, 'broken', 'template.html'), '<p>hi</p>')
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/meta\.json.*broken/)
  })

  it('throws when meta.json is malformed JSON', () => {
    writeTemplate('broken', '<p>hi</p>', {} as object)
    writeFileSync(join(tmpDir, 'broken', 'meta.json'), '{ not json')
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/broken.*meta\.json/i)
  })

  it('throws when minimumTier is unknown', () => {
    writeTemplate('broken', '<p>hi</p>', {
      name: 'B', category: 'x',
      colorScheme: { primary: '#0', secondary: '#0', background: '#0', text: '#0', accent: '#0' },
      fontPairings: { heading: 'f', body: 'f' }, tags: [], minimumTier: 'nonexistent',
    })
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/broken.*nonexistent/)
  })

  it('throws when required meta field is missing', () => {
    writeTemplate('broken', '<p>hi</p>', { name: 'B' } as object)
    expect(() => loadTemplatesFromDisk(tmpDir, tierMap)).toThrow(/broken.*category/)
  })
})
