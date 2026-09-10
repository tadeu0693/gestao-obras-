import { db, COLECOES, lerTudo } from './_lib/db.js';
import { exigirUsuario, corpo, PODE_EDITAR } from './_lib/auth.js';

const validaId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{4,64}$/.test(id);

export default async function handler(req, res) {
  try {
    const col = req.query?.col;
    const acao = req.query?.acao;

    if (req.method === 'GET') {
      const u = await exigirUsuario(req, res);
      if (!u) return;
      return res.json(await lerTudo());
    }

    if (req.method === 'POST' && acao === 'importar') {
      const u = await exigirUsuario(req, res, ['admin']);
      if (!u) return;
      const { backup = {}, modo = 'mesclar' } = corpo(req);
      const resumo = {};
      for (const c of COLECOES) {
        const lista = Array.isArray(backup[c]) ? backup[c].filter((x) => x && validaId(x.id)) : [];
        if (modo === 'substituir') await db.del(c);
        // grava em lotes para não estourar o limite de requisição
        for (let i = 0; i < lista.length; i += 25) {
          const lote = {};
          lista.slice(i, i + 25).forEach((x) => (lote[x.id] = x));
          await db.hset(c, lote);
        }
        resumo[c] = lista.length;
      }
      return res.json({ ok: true, resumo });
    }

    if (!COLECOES.includes(col)) return res.status(400).json({ erro: 'Coleção inválida.' });

    if (req.method === 'PUT') {
      const u = await exigirUsuario(req, res, PODE_EDITAR);
      if (!u) return;
      const { itens } = corpo(req);
      if (!Array.isArray(itens) || !itens.length) return res.status(400).json({ erro: 'Nada para salvar.' });
      const agora = new Date().toISOString();
      const lote = {};
      for (const item of itens) {
        if (!validaId(item?.id)) return res.status(400).json({ erro: 'Registro sem identificador válido.' });
        lote[item.id] = { ...item, criadoEm: item.criadoEm || agora, atualizadoEm: agora, atualizadoPor: u.nome };
      }
      const tamanho = JSON.stringify(lote).length;
      if (tamanho > 900_000) return res.status(413).json({ erro: 'Registro grande demais para salvar de uma vez.' });
      await db.hset(col, lote);
      return res.json({ itens: Object.values(lote) });
    }

    if (req.method === 'DELETE') {
      const u = await exigirUsuario(req, res, PODE_EDITAR);
      if (!u) return;
      const id = req.query?.id;
      if (!validaId(id)) return res.status(400).json({ erro: 'Identificador inválido.' });
      await db.hdel(col, id);
      return res.json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: e.message || 'Erro interno' });
  }
}
