import { useState } from 'react';
import { api } from '../lib/util.js';
import { Simbolo } from '../components.jsx';

export default function Login({ aoEntrar, primeiroAcesso, pendente }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const r = await api('auth?acao=login', { metodo: 'POST', corpo: { usuario, senha } });
      aoEntrar(r.usuario);
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <section className="login-lado">
        <div className="marca" style={{ padding: 0 }}>
          <Simbolo className="marca-simbolo" />
          <div>
            <strong>Obras</strong>
            <span>Controle de projetos</span>
          </div>
        </div>
        <div>
          <h1>Cada obra, do orçamento à entrega.</h1>
          <p>Propostas, compras, materiais e o andamento de cada local, para todos os clientes.</p>
        </div>
        <svg className="login-cabos" viewBox="0 0 460 300" aria-hidden="true">
          <g fill="none" strokeLinecap="round" strokeWidth="10">
            <path d="M0 250 C160 250 180 90 460 90" stroke="#0a7f8a" />
            <path d="M0 270 C190 270 220 160 460 160" stroke="#e0a800" />
            <path d="M0 290 C220 290 260 230 460 230" stroke="#3a4751" />
          </g>
        </svg>
        <span className="pequeno-txt" style={{ color: '#6f808a', position: 'relative' }}>Acesso restrito</span>
      </section>
      <section className="login-form">
        <form onSubmit={entrar}>
          <div>
            <h2>Entrar</h2>
            <p className="muted" style={{ margin: 0 }}>
              {primeiroAcesso ? 'Primeiro acesso: use o usuário e a senha definidos em ADMIN_USER e ADMIN_PASSWORD.' : 'Use seu usuário e senha.'}
            </p>
          </div>
          {pendente?.length > 0 && (
            <div className="aviso">
              <strong>O sistema foi publicado, mas falta configurar na Vercel:</strong>
              <ul>
                {pendente.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <span className="pequeno-txt">Depois de configurar, faça um novo deploy (Deployments &gt; Redeploy).</span>
            </div>
          )}
          {erro && <div className="erro-box">{erro}</div>}
          <label className="campo">
            <span>Usuário</span>
            <input autoFocus autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
          </label>
          <label className="campo">
            <span>Senha</span>
            <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          <button className="primario" disabled={enviando} style={{ justifyContent: 'center', padding: '10px' }}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </div>
  );
}
