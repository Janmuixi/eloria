import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { saveImage, deleteImage, imageAbsolutePath, getUploadRoot } from '../image-storage'

let testRoot: string

beforeEach(() => {
  testRoot = mkdtempSync(join(tmpdir(), 'eloria-uploads-'))
  process.env.UPLOAD_ROOT = testRoot
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
  delete process.env.UPLOAD_ROOT
})

async function makeJpegBuffer(width = 100, height = 100): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .jpeg()
    .toBuffer()
}

describe('image-storage', () => {
  it('getUploadRoot returns env var', () => {
    expect(getUploadRoot()).toBe(testRoot)
  })

  it('saveImage writes a re-encoded JPEG to disk and returns a relative path', async () => {
    const buffer = await makeJpegBuffer()
    const result = await saveImage(42, buffer)

    expect(result.relativePath).toMatch(/^42\/[0-9a-f-]+\.jpg$/)
    expect(result.width).toBe(100)
    expect(result.height).toBe(100)

    const fullPath = imageAbsolutePath(result.relativePath)
    expect(existsSync(fullPath)).toBe(true)

    const written = readFileSync(fullPath)
    const meta = await sharp(written).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.exif).toBeUndefined()
  })

  it('saveImage rejects bytes that are not a valid image', async () => {
    await expect(saveImage(1, Buffer.from('not-an-image'))).rejects.toThrow()
  })

  it('deleteImage removes the file from disk', async () => {
    const buffer = await makeJpegBuffer()
    const { relativePath } = await saveImage(7, buffer)
    const fullPath = imageAbsolutePath(relativePath)
    expect(existsSync(fullPath)).toBe(true)

    await deleteImage(relativePath)
    expect(existsSync(fullPath)).toBe(false)
  })

  it('deleteImage is a no-op when the file does not exist', async () => {
    await expect(deleteImage('999/missing.jpg')).resolves.toBeUndefined()
  })
})
