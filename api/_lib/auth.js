import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const COOKIE = 'go_sess';
const DIAS = 7;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) {
    if (process.env.VERCEL) throw new Error('Defina JWT_SECRET nas variáveis de ambiente da Vercel.');
    return new TextEncoder().encode('dev-secret-somente-local');
  }
  return new TextEncoder().encode(s);
}

export const hashSenha = (senha) => bcrypt.hash(senha, 10);
export const confereSenha = (senha, hash) => bcrypt.compare(senha, hash);

export async function criarSessao(res, user) {
  const token = await new SignJWT({ sub: user.id, nome: user.nome, usuario: user.usuario, papel: user.papel, v: user.versaoSenha || 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DIAS}d`)
    .sign(secret());
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${DIAS * 86400}${secure}`);
}

export function encerrarSessao(res) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}

function lerCookie(req, nome) {
  const raw = req.headers.cookie || '';
  const par = raw.split(/;\s*/).find((c) => c.startsWith(nome + '='));
  return par ? decodeURIComponent(par.slice(nome.length + 1)) : null;
}

// Retorna o usuário logado ou responde 401 e retorna null.
export async function exigirUsuario(req, res, papeis) {
  try {
    const token = lerCookie(req, COOKIE);
    if (!token) throw new Error('sem sessão');
    const { payload } = await jwtVerify(token, secret());
    const user = await db.hget('usuarios', payload.sub);
    if (!user || user.ativo === false || (user.versaoSenha || 1) !== payload.v) throw new Error('sessão inválida');
    if (papeis && !papeis.includes(user.papel)) {
      res.status(403).json({ erro: 'Seu perfil não tem permissão para esta ação.' });
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ erro: 'Faça login para continuar.' });
    return null;
  }
}

export function corpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return {};
  }
}

export const publico = (u) => ({ id: u.id, nome: u.nome, usuario: u.usuario, papel: u.papel, ativo: u.ativo !== false, criadoEm: u.criadoEm });

export const PODE_EDITAR = ['admin', 'editor'];
