import { db } from './_lib/db.js';
import { exigirUsuario, hashSenha, confereSenha, corpo, publico, criarSessao } from './_lib/auth.js';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const PAPEIS = ['admin', 'editor', 'leitor'];

export default async function handler(req, res) {
  try {
    // Troca da própria senha: qualquer usuário logado
    if (req.method === 'POST' && req.query?.acao === 'senha') {
      const u = await exigirUsuario(req, res);
      if (!u) return;
      const { atual = '', nova = '' } = corpo(req);
      if (!(await confereSenha(atual, u.senhaHash))) return res.status(400).json({ erro: 'A senha atual está incorreta.' });
      if (String(nova).length < 8) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 8 caracteres.' });
      const atualizado = { ...u, senhaHash: await hashSenha(nova), versaoSenha: (u.versaoSenha || 1) + 1 };
      await db.hset('usuarios', { [u.id]: atualizado });
      await criarSessao(res, atualizado);
      return res.json({ ok: true });
    }

    const admin = await exigirUsuario(req, res, ['admin']);
    if (!admin) return;
    const todos = await db.hgetall('usuarios');

    if (req.method === 'GET') {
      return res.json({ usuarios: Object.values(todos).map(publico) });
    }

    if (req.method === 'POST') {
      const { id, nome = '', usuario = '', senha = '', papel = 'editor', ativo = true } = corpo(req);
      if (!PAPEIS.includes(papel)) return res.status(400).json({ erro: 'Perfil inválido.' });
      const login = String(usuario).trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,40}$/.test(login)) return res.status(400).json({ erro: 'Usuário deve ter de 3 a 40 caracteres (letras, números, ponto, hífen).' });
      const dup = Object.values(todos).find((x) => x.usuario === login && x.id !== id);
      if (dup) return res.status(400).json({ erro: 'Já existe um usuário com esse login.' });

      if (id) {
        const u = todos[id];
        if (!u) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        if (u.id === admin.id && (papel !== 'admin' || ativo === false)) {
          return res.status(400).json({ erro: 'Você não pode remover seu próprio acesso de administrador.' });
        }
        const upd = { ...u, nome: nome || u.nome, usuario: login, papel, ativo: !!ativo };
        if (senha) {
          if (senha.length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
          upd.senhaHash = await hashSenha(senha);
          upd.versaoSenha = (u.versaoSenha || 1) + 1;
        }
        if (upd.ativo === false) upd.versaoSenha = (upd.versaoSenha || 1) + 1;
        await db.hset('usuarios', { [id]: upd });
        return res.json({ usuario: publico(upd) });
      }

      if (String(senha).length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
      const novo = { id: uid(), nome: nome || login, usuario: login, papel, ativo: true, senhaHash: await hashSenha(senha), versaoSenha: 1, criadoEm: new Date().toISOString() };
      await db.hset('usuarios', { [novo.id]: novo });
      return res.json({ usuario: publico(novo) });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (id === admin.id) return res.status(400).json({ erro: 'Você não pode excluir o próprio usuário.' });
      await db.hdel('usuarios', id);
      return res.json({ ok: true });
    }

    return res.status(405).json({ erro: 'Método não permitido' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: e.message || 'Erro interno' });
  }
}
