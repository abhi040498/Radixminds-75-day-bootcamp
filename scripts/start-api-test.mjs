import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'dotenv'
import { createIsolatedTestChildEnv, validateTestApiEnvironment } from './test-api-env.mjs'

const testEnvPath = resolve(process.cwd(), '.env.test.local')

function loadTestEnvironment() {
  let testEnv
  try {
    testEnv = parse(readFileSync(testEnvPath, 'utf8'))
  } catch {
    throw new Error('Test API not started: create .env.test.local from .env.test.example first.')
  }

  validateTestApiEnvironment(testEnv)
  return testEnv
}

function startTestApi() {
  let testEnv
  try {
    testEnv = loadTestEnvironment()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Test API configuration is invalid.')
    process.exit(2)
  }

  const childEnv = createIsolatedTestChildEnv(testEnv, testEnvPath)
  console.log(`Starting API with isolated Supabase test project ${new URL(testEnv.SUPABASE_URL).hostname.split('.')[0]}; payment and enrolment gates remain closed.`)
  const child = spawn(process.execPath, ['server/dist/start.js'], { cwd: process.cwd(), env: childEnv, stdio: 'inherit' })
  child.on('error', () => {
    console.error('Test API process could not start. Run npm run build:api first.')
    process.exitCode = 1
  })
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exitCode = code ?? 1
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startTestApi()
