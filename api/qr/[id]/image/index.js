import QRCode from 'qrcode';
import { getPool, ensureSchema } from '../../../_db.js';

export default async function handler(req, res) {
  const pool = getPool();
  const client = await pool.connect();
  const { id } = req.query;

  try {
    await ensureSchema(client);

    const result = await client.query('SELECT slug FROM qr_codes WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const qrUrl = `${proto}://${host}/r/${result.rows[0].slug}`;

    const size = Math.min(Math.max(parseInt(req.query.size) || 512, 128), 1024);

    const png = await QRCode.toBuffer(qrUrl, {
      width: size,
      margin: 2,
      type: 'png',
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'public, max-age=31536000, immutable'
    });
    return res.status(200).send(png);
  } catch (error) {
    console.error('Image error:', error);
    return res.status(500).json({ error: 'Erro ao gerar imagem' });
  } finally {
    client.release();
  }
}
