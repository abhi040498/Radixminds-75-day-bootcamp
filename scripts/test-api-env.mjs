export const APPROVED_TEST_PROJECT_URL = 'https://oohcwibhjmzrrpuxonck.supabase.co'

export function isApprovedTestProjectUrl(value) {
  return value === APPROVED_TEST_PROJECT_URL
}

export function validateTestApiEnvironment(testEnv) {
  if (!isApprovedTestProjectUrl(testEnv.SUPABASE_URL)) {
    throw new Error('Test API not started: Supabase URL does not match the exact approved isolated test project URL.')
  }

  if (!testEnv.SUPABASE_PUBLIC_KEY || !testEnv.SUPABASE_SECRET_KEY ||
      testEnv.SUPABASE_PUBLIC_KEY.startsWith('REPLACE_') || testEnv.SUPABASE_SECRET_KEY.startsWith('REPLACE_')) {
    throw new Error('Test API not started: add the isolated test project keys to .env.test.local.')
  }

  if (!testEnv.STATUS_TOKEN_SECRET || testEnv.STATUS_TOKEN_SECRET.startsWith('REPLACE_') || testEnv.STATUS_TOKEN_SECRET.length < 32) {
    throw new Error('Test API not started: set a random test-only status-token secret of at least 32 characters.')
  }
}

function parentValue(parentEnv, name) {
  const key = Object.keys(parentEnv).find(candidate => candidate.toUpperCase() === name.toUpperCase())
  return key ? parentEnv[key] : undefined
}

/** Build a least-privilege child environment without inheriting shell secrets. */
export function createIsolatedTestChildEnv(testEnv, testEnvPath, parentEnv = process.env) {
  const childEnv = {}
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    const value = parentValue(parentEnv, name)
    if (value !== undefined) childEnv[name] = value
  }

  return {
    ...childEnv,
    // server/src/config.ts imports dotenv/config. Point that import at the same
    // test-only file; the normal repository .env is never the child's source.
    DOTENV_CONFIG_PATH: testEnvPath,
    SUPABASE_URL: testEnv.SUPABASE_URL,
    SUPABASE_PUBLIC_KEY: testEnv.SUPABASE_PUBLIC_KEY,
    SUPABASE_SECRET_KEY: testEnv.SUPABASE_SECRET_KEY,
    // Do not permit either credential alias or payment credentials from the
    // parent shell or the test file to turn into a production-capable process.
    SUPABASE_SERVICE_ROLE_KEY: '',
    STATUS_TOKEN_SECRET: testEnv.STATUS_TOKEN_SECRET,
    PORT: testEnv.PORT || '4001',
    APP_ORIGIN: testEnv.APP_ORIGIN || 'http://localhost:5173',
    NODE_ENV: 'test',
    PAYMENT_ENABLED: 'false',
    POLICIES_APPROVED: 'false',
    RAZORPAY_MODE: 'test',
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    RAZORPAY_WEBHOOK_SECRET: '',
  }
}
