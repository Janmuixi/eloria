import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'

const DEFAULT_UPLOAD_ROOT = '/var/lib/eloria/uploads'

export function getUploadRoot(): string {
  return process.env.UPLOAD_ROOT || DEFAULT_UPLOAD_ROOT
}

export function imageAbsolutePath(relativePath: string): string {
  const root = getUploadRoot()
  const full = resolve(root, relativePath)
  if (!full.startsWith(resolve(root) + '/') && full !== resolve(root)) {
    throw new Error('Path traversal detected')
  }
  return full
}

export async function saveImage(eventId: number, buffer: Buffer): Promise<{
  relativePath: string
  width: number
  height: number
}> {
  const processed = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  const relativePath = `${eventId}/${randomUUID()}.jpg`
  const fullPath = imageAbsolutePath(relativePath)

  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, processed.data)

  return {
    relativePath,
    width: processed.info.width,
    height: processed.info.height,
  }
}

export async function deleteImage(relativePath: string): Promise<void> {
  const fullPath = imageAbsolutePath(relativePath)
  try {
    await unlink(fullPath)
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err
  }
}
