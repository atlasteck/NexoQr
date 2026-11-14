import { getPool, ensureSchema } from '../../_db.js';

export default async function handler(req, res) {
  const pool = getPool();
  const client = await pool.connect();
  const { slug } = req.query;

  try {
    await ensureSchema(client);

    const qrResult = await client.query(
      'SELECT id, target_url FROM qr_codes WHERE slug = $1',
      [slug]
    );

    if (qrResult.rows.length === 0) {
      return res.status(404).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QR Code não encontrado | NexoQR</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8f9fa; color: #1a1a2e; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; background: #fff; padding: 48px 56px; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 10px 15px rgba(0,0,0,.08); }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #6b7280; margin: 0; font-size: 15px; }
    .logo { font-weight: 700; color: #2563eb; margin-top: 28px; font-size: 13px; letter-spacing: .04em; }
  </style>
</head>
<body>
  <div class="box">
    <h1>QR Code não encontrado</h1>
    <p>Este código QR não existe ou foi removido.</p>
    <div class="logo">NexoQR</div>
  </div>
</body>
</html>`);
    }

    const qr = qrResult.rows[0];

    await client.query(`
      INSERT INTO scan_logs (qr_id, ip, user_agent, referer)
      VALUES ($1, $2, $3, $4)
    `, [
      qr.id,
      req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
      req.headers['user-agent'] || '',
      req.headers.referer || ''
    ]);

    await client.query('UPDATE qr_codes SET scans = scans + 1 WHERE id = $1', [qr.id]);

    if (!qr.target_url) {
      return res.status(200).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Destino não configurado | NexoQR</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8f9fa; color: #1a1a2e; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; background: #fff; padding: 48px 56px; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 10px 15px rgba(0,0,0,.08); }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #6b7280; margin: 0; font-size: 15px; }
    .logo { font-weight: 700; color: #2563eb; margin-top: 28px; font-size: 13px; letter-spacing: .04em; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Destino ainda não configurado</h1>
    <p>Este QR Code foi criado, mas o link de destino ainda não foi definido.</p>
    <div class="logo">NexoQR</div>
  </div>
</body>
</html>`);
    }

    return res.redirect(302, qr.target_url);
  } catch (error) {
    console.error('Redirect error:', error);
    return res.status(500).send('Erro interno');
  } finally {
    client.release();
  }
}
