import { execSync } from 'child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import path from 'path'

const BACKEND_ROOT = path.resolve(__dirname, '../..')
const MAIN_SCHEMA_PATH = path.resolve(BACKEND_ROOT, 'prisma/schema.prisma')
const TEST_SCHEMA_PATH = path.resolve(BACKEND_ROOT, 'prisma/schema.test.prisma')
const TEST_DB_PATH = path.resolve(BACKEND_ROOT, 'prisma/test.db')

export const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`

// prisma/schema.prisma hardcodes `url = "file:./dev.db"` (not env-based), so the CLI
// can't be pointed at a different SQLite file via DATABASE_URL. We generate a throwaway
// schema with the same models but a test-only url, `db push` against that, then point the
// real (already-generated) Prisma Client at the resulting file via `datasourceUrl` at runtime.
export default function setup() {
  const testSchema = readFileSync(MAIN_SCHEMA_PATH, 'utf-8').replace(
    'url      = "file:./dev.db"',
    `url      = "file:./test.db"`
  )
  writeFileSync(TEST_SCHEMA_PATH, testSchema)

  execSync(`npx prisma db push --schema=${TEST_SCHEMA_PATH} --skip-generate --accept-data-loss`, {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
  })

  return () => {
    for (const file of [TEST_SCHEMA_PATH, TEST_DB_PATH, `${TEST_DB_PATH}-journal`]) {
      if (existsSync(file)) rmSync(file)
    }
  }
}
