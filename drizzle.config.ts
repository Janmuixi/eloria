import { defineConfig } from 'drizzle-kit'
import { resolveEnvVar } from './server/utils/resolve-env-var'

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: resolveEnvVar('DATABASE_URL', 'file:./db/eloria.db'),
  },
})
