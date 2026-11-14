import QRCode from 'qrcode';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { getPool, ensureSchema, corsHeaders } from '../_db.js';

function hashPassword(pw) {
  if (!pw) return null;
  return crypto.createHash('sha256').update(pw).digest('hex');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).set(corsHeaders()).send('');
  }
  res.set(corsHeaders());

  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureSchema(client);

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${proto}://${host}`;

    if (req.method === 'GET') {
      const result = await client.query(`
        SELECT id, slug, target_url, title, description, scans, created_at, updated_at
        FROM qr_codes
        ORDER BY created_at DESC
      `);
      return res.status(200).json(result.rows.map(r => ({
        ...r,
        qr_url: `${baseUrl}/r/${r.slug}`
      })));
    }

    if (req.method === 'POST') {
      const { target_url, title, description, custom_slug, password } = req.body || {};

      if (target_url) {
        try {
          new URL(target_url);
        } catch {
          return res.status(400).json({ error: 'URL inválida' });
        }
      }

      const id = nanoid(10);
      const slug = (custom_slug || nanoid(8)).toString().replace(/[^a-zA-Z0-9-_]/g, '');

      if (!slug) {
        return res.status(400).json({ error: 'Slug inválido' });
      }

      const existing = await client.query('SELECT id FROM qr_codes WHERE slug = $1', [slug]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Slug já existe, escolha outro' });
      }

      const password_hash = hashPassword(password);

      await client.query(`
        INSERT INTO qr_codes (id, slug, target_url, title, description, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, slug, target_url || null, title || '', description || '', password_hash]);

      const qrUrl = `${baseUrl}/r/${slug}`;
      const qrImage = await QRCode.toDataURL(qrUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' }
      });

      return res.status(201).json({
        id, slug, target_url: target_url || null, title, description,
        qr_url: qrUrl, qr_image: qrImage, scans: 0,
        created_at: new Date().toISOString()
      });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
}
