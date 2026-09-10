import { db, configPendente } from './_lib/db.js';
import { criarSessao, encerrarSessao, exigirUsuario, hashSenha, confereSenha, corpo, publico } from './_lib/auth.js';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function credenciaisIniciais() {
  const usuario = process.env.ADMIN_USER || (process.env.VERCEL ? '' : 'admin');
  const senha = process.env.ADMIN_PASSWORD || (process.env.VERCEL ? '' : 'admin123');
  return { usuario, senha };
}

export default async function handler(req, res) {
  const acao = req.query?.acao;
  try {
    const faltando = configPendente();
    if (faltando.length && acao !== 'logout') return res.status(503).json({ erro: 'Configuração pendente', configPendente: faltando });
    if (req.method === 'GET' && acao === 'me') {
      const todos = await db.hgetall('usuarios');
      if (!Object.keys(todos).length) {
        const semAdmin = process.env.VERCEL && !(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD);
        if (semAdmin) return res.status(503).json({ erro: 'Configuração pendente', configPendente: ['ADMIN_USER e ADMIN_PASSWORD (usados no primeiro login)'] });
        return res.status(401).json({ erro: 'Sem usuários', primeiroAcesso: true });
      }
      const u = await exigirUsuario(req, res);
      if (!u) return;
      return res.json({ usuario: publico(u) });
    }

    if (req.method === 'POST' && acao === 'login') {
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
      const tentativas = await db.incrWithTtl(`tentativas:${ip}`, 15 * 60);
      if (tentativas > 10) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' });

      const { usuario = '', senha = '' } = corpo(req);
      const login = String(usuario).trim().toLowerCase();
      const todos = Object.values(await db.hgetall('usuarios'));

      if (!todos.length) {
        const ini = credenciaisIniciais();
        if (!ini.usuario || !ini.senha) {
          return res.status(503).json({ erro: 'Primeiro acesso não configurado: defina ADMIN_USER e ADMIN_PASSWORD nas variáveis de ambiente da Vercel.' });
        }
        if (login !== ini.usuario.toLowerCase() || senha !== ini.senha) {
          return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
        }
        const admin = { id: uid(), nome: 'Administrador', usuario: login, papel: 'admin', senhaHash: await hashSenha(senha), versaoSenha: 1, ativo: true, criadoEm: new Date().toISOString() };
        await db.hset('usuarios', { [admin.id]: admin });
        await criarSessao(res, admin);
        return res.json({ usuario: publico(admin), primeiroAcesso: true });
      }

      const u = todos.find((x) => x.usuario === login);
      if (!u || u.ativo === false || !(await confereSenha(senha, u.senhaHash))) {
        return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
      }
      await criarSessao(res, u);
      return res.json({ usuario: publico(u) });
    }

    if (req.method === 'POST' && acao === 'logout') {
      encerrarSessao(res);
      return res.json({ ok: true });
    }

    return res.status(404).json({ erro: 'Rota não encontrada' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: e.message || 'Erro interno' });
  }
}
