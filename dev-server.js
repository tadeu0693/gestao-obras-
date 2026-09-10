// Servidor local: roda o Vite e as funções de /api no mesmo endereço,
// imitando o comportamento da Vercel. Uso: npm run dev
import http from 'http';
import { createServer as createVite } from 'vite';

const PORT = process.env.PORT || 5173;
const vite = await createVite({ server: { middlewareMode: true }, appType: 'spa' });

function shim(res) {
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (o) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(o));
    return res;
  };
  return res;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const m = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (!m) return vite.middlewares(req, res);
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      req.query = Object.fromEntries(url.searchParams);
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = raw;
      }
      const mod = await import(`./api/${m[1]}.js?t=${Date.now()}`);
      await mod.default(req, shim(res));
    } catch (e) {
      console.error(e);
      shim(res).status(e.code === 'ERR_MODULE_NOT_FOUND' ? 404 : 500).json({ erro: e.message });
    }
  })
  .listen(PORT, () => console.log(`\n  Gestão de Obras rodando em http://localhost:${PORT}\n  Login inicial: admin / admin123 (somente local)\n`));
