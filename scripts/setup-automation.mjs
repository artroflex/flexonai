import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = fs.readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '')
for (const line of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data: buckets, error } = await db.storage.listBuckets()
if (error) throw new Error('Could not inspect private automation storage')
const existing = buckets.find(b => b.id === 'artro-automation')
if (existing?.public) throw new Error('Automation bucket must be private')
if (!existing) {
  const { error } = await db.storage.createBucket('artro-automation', { public: false, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ['application/json'] })
  if (error) throw new Error('Could not create private automation storage')
}
console.log('Private automation storage ready')
