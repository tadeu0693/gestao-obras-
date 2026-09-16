import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { Campo, Icone } from '../components.jsx';
import { api, baixarJSON, data, hojeISO, moeda0, uid } from '../lib/util.js';

export default function Config() {
  const { usuario } = useApp();
  return (
    <>
      <div className="topo">
        <div>
          <h1>Configurações</h1>
        </div>
      </div>
      <div className="duas-col" style={{ marginBottom: 20 }}>
        <MinhaSenha />
        <Backup />
      </div>
      {usuario.papel === 'admin' && <Usuarios />}
      <TabelaMO />
    </>
  );
}

function TabelaMO() {
  const { dados, salvar, excluir, podeEditar, toast } = useApp();
  const [novo, setNovo] = useState({ tecnicos: 2, auxiliares: 0, valorHora: '' });
  const tabela = [...(dados.tabelaMO || [])].sort((a, b) => b.tecnicos + b.auxiliares - (a.tecnicos + a.auxiliares) || b.tecnicos - a.tecnicos);

  const adicionar = async () => {
    const t = Number(novo.tecnicos) || 0;
    const a = Number(novo.auxiliares) || 0;
    const v = Number(String(novo.valorHora).replace(',', '.'));
    if (t + a < 1) return toast('Informe pelo menos 1 pessoa na equipe.', true);
    if (!v) return toast('Informe o valor da hora.', true);
    if (tabela.some((r) => r.tecnicos === t && r.auxiliares === a)) return toast('Já existe uma regra para essa composição — edite ou remova ela primeiro.', true);
    await salvar('tabelaMO', { id: uid(), tecnicos: t, auxiliares: a, valorHora: v });
    setNovo({ tecnicos: 2, auxiliares: 0, valorHora: '' });
  };

  const remover = async (r) => {
    await excluir('tabelaMO', r.id);
    toast('Regra removida.');
  };

  return (
    <section className="bloco">
      <div className="bloco-cab">
        <div>
          <h2>Valor da hora por equipe (M.O)</h2>
          <p>Quanto cobrar por hora conforme quem está alocado junto na mesma PO. Especialista e Supervisor contam como técnico.</p>
        </div>
      </div>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">Técnicos</th>
              <th className="num">Auxiliares</th>
              <th className="num">Valor da hora (equipe)</th>
              {podeEditar && <th />}
            </tr>
          </thead>
          <tbody>
            {tabela.map((r) => (
              <tr key={r.id}>
                <td className="num">{r.tecnicos}</td>
                <td className="num">{r.auxiliares}</td>
                <td className="num">{moeda0(r.valorHora)}</td>
                {podeEditar && (
                  <td className="num">
                    <button className="fantasma" aria-label="Remover" onClick={() => remover(r)}>
                      <Icone nome="lixo" tam={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tabela.length === 0 && <p className="muted pequeno-txt">Nenhuma composição cadastrada ainda.</p>}
      {podeEditar && (
        <div className="filtros" style={{ marginTop: 14 }}>
          <label className="campo" style={{ maxWidth: 110 }}>
            <span>Técnicos</span>
            <input type="number" min="0" value={novo.tecnicos} onChange={(e) => setNovo({ ...novo, tecnicos: e.target.value })} />
          </label>
          <label className="campo" style={{ maxWidth: 110 }}>
            <span>Auxiliares</span>
            <input type="number" min="0" value={novo.auxiliares} onChange={(e) => setNovo({ ...novo, auxiliares: e.target.value })} />
          </label>
          <label className="campo" style={{ maxWidth: 150 }}>
            <span>Valor/hora (R$)</span>
            <input value={novo.valorHora} placeholder="ex: 135" onChange={(e) => setNovo({ ...novo, valorHora: e.target.value })} />
          </label>
          <button className="primario" onClick={adicionar} style={{ alignSelf: 'flex-end' }}>
            <Icone nome="mais" tam={16} /> Adicionar regra
          </button>
        </div>
      )}
    </section>
  );
}

function MinhaSenha() {
  const { toast } = useApp();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [conf, setConf] = useState('');
  const [erro, setErro] = useState('');
  const trocar = async () => {
    setErro('');
    if (nova !== conf) return setErro('A confirmação não confere com a nova senha.');
    try {
      await api('usuarios?acao=senha', { metodo: 'POST', corpo: { atual, nova } });
      setAtual('');
      setNova('');
      setConf('');
      toast('Senha alterada');
    } catch (e) {
      setErro(e.message);
    }
  };
  return (
    <section className="bloco">
      <h2 style={{ marginBottom: 12 }}>Minha senha</h2>
      {erro && <div className="erro-box">{erro}</div>}
      <div className="grade">
        <Campo rotulo="Senha atual">
          <input type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
        </Campo>
        <Campo rotulo="Nova senha" dica="mín. 8">
          <input type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
        </Campo>
        <Campo rotulo="Confirmar nova senha">
          <input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} />
        </Campo>
      </div>
      <button className="primario" style={{ marginTop: 14 }} onClick={trocar} disabled={!atual || !nova}>
        Alterar senha
      </button>
    </section>
  );
}

function Backup() {
  const { dados, usuario, recarregar, toast } = useApp();
  const [modo, setModo] = useState('mesclar');
  const [enviando, setEnviando] = useState(false);
  const ref = useRef();
  const importar = async (file) => {
    try {
      const backup = JSON.parse(await file.text());
      const n = ['clientes', 'orcamentos', 'locais', 'estoque'].map((c) => `${(backup[c] || []).length} ${c}`).join(', ');
      const aviso = modo === 'substituir' ? '\n\nATENÇÃO: todos os dados atuais serão apagados e trocados por este arquivo.' : '';
      if (!confirm(`Importar ${n}?${aviso}`)) return;
      setEnviando(true);
      const r = await api('dados?acao=importar', { metodo: 'POST', corpo: { backup, modo } });
      await recarregar();
      toast(`Importado: ${Object.entries(r.resumo).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    } catch (e) {
      toast(e.message || 'Arquivo inválido', true);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <section className="bloco">
      <h2 style={{ marginBottom: 6 }}>Backup</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Baixe uma cópia de todos os dados ou carregue um arquivo de backup, como o de dados iniciais da CPFL.
      </p>
      <button onClick={() => baixarJSON(`backup-obras-${hojeISO()}.json`, { versao: 1, geradoEm: new Date().toISOString(), ...dados })}>
        <Icone nome="baixar" /> Baixar backup (.json)
      </button>
      {usuario.papel === 'admin' && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--linha)' }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
            <label className="check">
              <input type="radio" checked={modo === 'mesclar'} onChange={() => setModo('mesclar')} /> Mesclar com os dados atuais
            </label>
            <label className="check">
              <input type="radio" checked={modo === 'substituir'} onChange={() => setModo('substituir')} /> Substituir tudo
            </label>
          </div>
          <button onClick={() => ref.current.click()} disabled={enviando}>
            <Icone nome="importar" /> {enviando ? 'Importando…' : 'Carregar backup'}
          </button>
          <input
            ref={ref}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              if (e.target.files[0]) importar(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </section>
  );
}

function Usuarios() {
  const { usuario: eu, toast } = useApp();
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(null);
  const carregar = () => api('usuarios').then((r) => setLista(r.usuarios)).catch((e) => toast(e.message, true));
  useEffect(() => {
    carregar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gravar = async () => {
    try {
      await api('usuarios', { metodo: 'POST', corpo: form });
      toast(form.id ? 'Usuário atualizado' : 'Usuário criado');
      setForm(null);
      carregar();
    } catch (e) {
      toast(e.message, true);
    }
  };

  return (
    <section className="bloco">
      <div className="bloco-cab">
        <div>
          <h2>Usuários</h2>
          <p>Editor pode alterar dados; somente leitura só visualiza; dashboard só acessa a tela de Dashboard; administrador também gerencia usuários e backups.</p>
        </div>
        <button className="primario" onClick={() => setForm({ nome: '', usuario: '', senha: '', papel: 'editor', ativo: true })}>
          <Icone nome="mais" /> Novo usuário
        </button>
      </div>
      {form && (
        <div className="bloco" style={{ background: 'var(--nevoa)' }}>
          <div className="grade">
            <Campo rotulo="Nome">
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Usuário (login)">
              <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value.toLowerCase() })} />
            </Campo>
            <Campo rotulo={form.id ? 'Nova senha' : 'Senha'} dica={form.id ? 'deixe em branco para manter' : 'mín. 8'}>
              <input type="password" autoComplete="new-password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
            </Campo>
            <Campo rotulo="Perfil">
              <select value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>
                <option value="admin">Administrador</option>
                <option value="editor">Editor</option>
                <option value="leitor">Somente leitura</option>
                <option value="dashboard">Dashboard (só visualização)</option>
              </select>
            </Campo>
            {form.id && (
              <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}>
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Acesso ativo
              </label>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="primario" onClick={gravar}>
              {form.id ? 'Salvar usuário' : 'Criar usuário'}
            </button>
            <button onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Usuário</th>
            <th>Perfil</th>
            <th>Situação</th>
            <th>Criado em</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista.map((u) => (
            <tr key={u.id}>
              <td>{u.nome}</td>
              <td>{u.usuario}</td>
              <td>{u.papel === 'admin' ? 'Administrador' : u.papel === 'editor' ? 'Editor' : u.papel === 'dashboard' ? 'Dashboard' : 'Somente leitura'}</td>
              <td>{u.ativo ? 'Ativo' : <span className="muted">Desativado</span>}</td>
              <td>{data(u.criadoEm)}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="pequeno" onClick={() => setForm({ ...u, senha: '' })}>
                  Editar
                </button>{' '}
                {u.id !== eu.id && (
                  <button
                    className="pequeno perigo"
                    onClick={async () => {
                      if (!confirm(`Excluir o usuário ${u.usuario}?`)) return;
                      await api(`usuarios?id=${u.id}`, { metodo: 'DELETE' }).catch((e) => toast(e.message, true));
                      carregar();
                    }}
                  >
                    Excluir
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
