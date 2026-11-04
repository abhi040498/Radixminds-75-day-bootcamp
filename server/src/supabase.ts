import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config, hasAdminAuth, hasDatabase, supabaseSecret } from './config.js'

let adminClient: SupabaseClient | undefined
let authClient: SupabaseClient | undefined

export function getDatabase(): SupabaseClient {
  if (!hasDatabase || !config.SUPABASE_URL || !supabaseSecret) throw new Error('DATABASE_NOT_CONFIGURED')
  if (!adminClient) adminClient = createClient(config.SUPABASE_URL, supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } })
  return adminClient
}

export function getAuthClient(): SupabaseClient {
  if (!hasAdminAuth || !config.SUPABASE_URL || !config.SUPABASE_PUBLIC_KEY) throw new Error('ADMIN_AUTH_NOT_CONFIGURED')
  if (!authClient) authClient = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return authClient
}
