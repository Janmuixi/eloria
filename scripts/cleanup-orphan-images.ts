import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '~/server/db/schema'
import { cleanupOrphanImages } from '~/server/utils/cleanup-orphan-images'
import { getUploadRoot } from '~/server/utils/image-storage'

interface ParsedArgs {
  dryRun: boolean
  graceMinutes: number
}

function parseArgs(argv: string[]): ParsedArgs {
  let dryRun = false
  let graceMinutes = 60
  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg.startsWith('--grace-minutes=')) {
      const n = Number.parseInt(arg.slice('--grace-minutes='.length), 10)
      if (!Number.isInteger(n) || n < 0) {
        console.error(`Invalid --grace-minutes value: ${arg}`)
        process.exit(2)
      }
      graceMinutes = n
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: tsx scripts/cleanup-orphan-images.ts [--dry-run] [--grace-minutes=N]')
      process.exit(0)
    } else {
      console.error(`Unknown argument: ${arg}`)
      process.exit(2)
    }
  }
  return { dryRun, graceMinutes }
}

async function main() {
  const { dryRun, graceMinutes } = parseArgs(process.argv.slice(2))
  console.log(`UPLOAD_ROOT: ${getUploadRoot()}`)
  console.log(`Mode: ${dryRun ? 'DRY RUN (no deletes)' : 'LIVE'}`)
  console.log(`Grace window: ${graceMinutes} minutes`)

  const dbUrl = process.env.DATABASE_URL || 'file:./db/eloria.db'
  const dbPath = dbUrl.replace('file:', '') || './db/eloria.db'
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })

  const result = await cleanupOrphanImages({ db, dryRun, graceMinutes })

  console.log('---')
  console.log(`Dirs ${dryRun ? 'would be ' : ''}deleted:  ${result.dirsDeleted}`)
  console.log(`Files ${dryRun ? 'would be ' : ''}deleted: ${result.filesDeleted}`)
  console.log(`Bytes ${dryRun ? 'would be ' : ''}freed:   ${result.bytesFreed}`)

  sqlite.close()
}

main().catch((err) => {
  console.error('Cleanup failed:', err)
  process.exit(1)
})
