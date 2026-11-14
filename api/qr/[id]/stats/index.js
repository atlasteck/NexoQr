import { getPool, ensureSchema, corsHeaders } from '../../../_db.js';

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
      const qrResult = await client.query(
        'SELECT id, slug, target_url, title, scans, created_at FROM qr_codes WHERE id = $1',
        [id]
      );
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
      `, [id]);

      const dailyStats = await client.query(`
        SELECT DATE(scanned_at) as date, COUNT(*)::int as count
        FROM scan_logs
        WHERE qr_id = $1
        GROUP BY DATE(scanned_at)
        ORDER BY date DESC
        LIMIT 30
      `, [id]);

      return res.status(200).json({
        ...qr,
        recent_scans: recentScans.rows,
        daily_stats: dailyStats.rows
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
