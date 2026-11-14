-- NexoQR Schema for Supabase (PostgreSQL)
-- Execute no SQL Editor do Supabase

-- Tabela de QR Codes
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

-- Tabela de logs de scan
CREATE TABLE IF NOT EXISTS scan_logs (
    id BIGSERIAL PRIMARY KEY,
    qr_id TEXT NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
    ip TEXT,
    user_agent TEXT,
    referer TEXT,
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_qr_slug ON qr_codes(slug);
CREATE INDEX IF NOT EXISTS idx_scan_qr_id ON scan_logs(qr_id);
CREATE INDEX IF NOT EXISTS idx_scan_scanned_at ON scan_logs(scanned_at DESC);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_qr_codes_updated_at ON qr_codes;
CREATE TRIGGER update_qr_codes_updated_at
    BEFORE UPDATE ON qr_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (opcional, para multi-tenant futuro)
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_logs ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas (ajuste conforme necessidade)
CREATE POLICY "Allow all operations on qr_codes" ON qr_codes FOR ALL USING (true);
CREATE POLICY "Allow all operations on scan_logs" ON scan_logs FOR ALL USING (true);
