import crypto from 'crypto';
import { getPool, ensureSchema, corsHeaders } from '../../_db.js';

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
  const { id } = req.query;

  try {
    await ensureSchema(client);

    if (req.method === 'GET') {
      const result = await client.query(`
        SELECT id, slug, target_url, title, description, scans, created_at, updated_at
        FROM qr_codes WHERE id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'QR Code não encontrado' });
      }
      return res.status(200).json(result.rows[0]);
    }

    if (req.method === 'PUT') {
      const { target_url, title, description, password } = req.body || {};

      const existingRes = await client.query('SELECT password_hash FROM qr_codes WHERE id = $1', [id]);
      if (existingRes.rows.length === 0) {
        return res.status(404).json({ error: 'QR Code não encontrado' });
      }

      const existingHash = existingRes.rows[0].password_hash;

      if (target_url !== undefined) {
        if (!password) {
          return res.status(403).json({ error: 'Senha obrigatória para alterar destino' });
        }
        if (existingHash && hashPassword(password) !== existingHash) {
          return res.status(403).json({ error: 'Senha inválida' });
        }
        try {
          if (target_url) new URL(target_url);
        } catch {
          return res.status(400).json({ error: 'URL inválida' });
        }
      }

      const updates = [];
      const params = [];
      let i = 1;

      if (target_url !== undefined) {
        updates.push(`target_url = $${i++}`);
        params.push(target_url || null);
      }
      if (title !== undefined) {
        updates.push(`title = $${i++}`);
        params.push(title);
      }
      if (description !== undefined) {
        updates.push(`description = $${i++}`);
        params.push(description);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'Nada para atualizar' });
      }

      updates.push('updated_at = NOW()');
      params.push(id);

      await client.query(`UPDATE qr_codes SET ${updates.join(', ')} WHERE id = $${i}`, params);

      const result = await client.query(`
        SELECT id, slug, target_url, title, description, scans, created_at, updated_at
        FROM qr_codes WHERE id = $1
      `, [id]);

      return res.status(200).json(result.rows[0]);
    }

    if (req.method === 'DELETE') {
      const result = await client.query('DELETE FROM qr_codes WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'QR Code não encontrado' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
}
