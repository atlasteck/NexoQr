import { Pool } from 'pg';

// Pool compartilhado entre as Serverless Functions.
// max: 1 evita estourar o limite de conexões do Supabase em ambiente serverless.
let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 10000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    pool.on('error', (err) => {
      console.error('Pool error:', err.message);
    });
  }
  return pool;
}

// Garante que as tabelas existam (idempotente).
export async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      target_url TEXT,
      title TEXT,
      description TEXT,
      password_hash TEXT,
      scans INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE qr_codes ALTER COLUMN target_url DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS scan_logs (
      id BIGSERIAL PRIMARY KEY,
      qr_id TEXT NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
      ip TEXT,
      user_agent TEXT,
      referer TEXT,
      scanned_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_qr_slug ON qr_codes(slug);
    CREATE INDEX IF NOT EXISTS idx_scan_qr_id ON scan_logs(qr_id);
    CREATE INDEX IF NOT EXISTS idx_scan_scanned_at ON scan_logs(scanned_at DESC);
  `);
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
