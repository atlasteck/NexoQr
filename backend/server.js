import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';

const app = express();

app.use(cors());
app.use(express.json());

// PostgreSQL pool (configurado para serverless/Vercel)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,                    // Importante para serverless
  idleTimeoutMillis: 0,      // Sem timeout idle
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});

// Test connection on startup
pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

// Initialize database tables
async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS qr_codes (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        target_url TEXT NOT NULL,
        title TEXT,
        description TEXT,
        scans INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

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
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Database init error:', err);
  } finally {
    client.release();
  }
}

initDb();

// ==================== API ROUTES ====================

// Create QR code
app.post('/api/qr', async (req, res) => {
  const client = await pool.connect();
  try {
    const { target_url, title, description, custom_slug } = req.body;

    if (!target_url) {
      return res.status(400).json({ error: 'target_url é obrigatório' });
    }

    // Validate URL
    try {
      new URL(target_url);
    } catch {
      return res.status(400).json({ error: 'URL inválida' });
    }

    const id = nanoid(10);
    const slug = custom_slug || nanoid(8);

    // Check if slug exists
    const existing = await client.query('SELECT id FROM qr_codes WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Slug já existe, escolha outro' });
    }

    await client.query(`
      INSERT INTO qr_codes (id, slug, target_url, title, description)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, slug, target_url, title || '', description || '']);

    // Generate QR code image
    const baseUrl = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
    const qrUrl = `${baseUrl}/r/${slug}`;
    const qrImage = await QRCode.toDataURL(qrUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });

    res.status(201).json({
      id,
      slug,
      target_url,
      title,
      description,
      qr_url: qrUrl,
      qr_image: qrImage,
      scans: 0,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao criar QR:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// List all QR codes
app.get('/api/qr', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT id, slug, target_url, title, description, scans, created_at, updated_at
      FROM qr_codes
      ORDER BY created_at DESC
    `);
    const baseUrl = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
    res.json(result.rows.map(r => ({ ...r, qr_url: `${baseUrl}/r/${r.slug}` })));
  } catch (error) {
    console.error('Erro ao listar QRs:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// Get single QR code
app.get('/api/qr/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT id, slug, target_url, title, description, scans, created_at, updated_at
      FROM qr_codes WHERE id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar QR:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// Update QR code
app.put('/api/qr/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { target_url, title, description } = req.body;
    const id = req.params.id;

    const existing = await client.query('SELECT id FROM qr_codes WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }

    if (target_url) {
      try {
        new URL(target_url);
      } catch {
        return res.status(400).json({ error: 'URL inválida' });
      }
    }

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (target_url !== undefined) {
      updates.push(`target_url = $${paramIndex++}`);
      params.push(target_url);
    }
    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    await client.query(`UPDATE qr_codes SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);

    const result = await client.query(`
      SELECT id, slug, target_url, title, description, scans, created_at, updated_at
      FROM qr_codes WHERE id = $1
    `, [id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar QR:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// Delete QR code
app.delete('/api/qr/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('DELETE FROM qr_codes WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar QR:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// Redirect endpoint (public) - increments scan count
app.get('/r/:slug', async (req, res) => {
  const client = await pool.connect();
  try {
    const qrResult = await client.query('SELECT id, target_url FROM qr_codes WHERE slug = $1', [req.params.slug]);

    if (qrResult.rows.length === 0) {
      return res.status(404).send(`
        <html>
          <head><title>QR Code não encontrado</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px;">
            <h1>QR Code não encontrado</h1>
            <p>Este código QR não existe ou foi removido.</p>
          </body>
        </html>
      `);
    }

    const qr = qrResult.rows[0];

    // Log scan
    await client.query(`
      INSERT INTO scan_logs (qr_id, ip, user_agent, referer)
      VALUES ($1, $2, $3, $4)
    `, [qr.id, req.ip, req.get('user-agent'), req.get('referer') || '']);

    // Increment scan count
    await client.query('UPDATE qr_codes SET scans = scans + 1 WHERE id = $1', [qr.id]);

    // Redirect
    res.redirect(qr.target_url);
  } catch (error) {
    console.error('Erro no redirect:', error);
    res.status(500).send('Erro interno');
  } finally {
    client.release();
  }
});

// Get stats for a QR code
app.get('/api/qr/:id/stats', async (req, res) => {
  const client = await pool.connect();
  try {
    const qrResult = await client.query('SELECT id, slug, target_url, title, scans FROM qr_codes WHERE id = $1', [req.params.id]);
    if (qrResult.rows.length === 0) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }

    const qr = qrResult.rows[0];

    const recentScans = await client.query(`
      SELECT ip, user_agent, referer, scanned_at
      FROM scan_logs
      WHERE qr_id = $1
      ORDER BY scanned_at DESC
      LIMIT 50
    `, [req.params.id]);

    const dailyStats = await client.query(`
      SELECT DATE(scanned_at) as date, COUNT(*) as count
      FROM scan_logs
      WHERE qr_id = $1
      GROUP BY DATE(scanned_at)
      ORDER BY date DESC
      LIMIT 30
    `, [req.params.id]);

    res.json({
      ...qr,
      recent_scans: recentScans.rows,
      daily_stats: dailyStats.rows
    });
  } catch (error) {
    console.error('Erro ao buscar stats:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 NexoQR API rodando em http://localhost:${PORT}`);
  });
}

export default app;