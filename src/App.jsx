import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './lib/util.js';
import { Icone, Simbolo } from './components.jsx';
import Login from './pages/Login.jsx';
import Painel from './pages/Painel.jsx';
import Orcamentos from './pages/Orcamentos.jsx';
import OrcamentoDetalhe from './pages/OrcamentoDetalhe.jsx';
import Importar from './pages/Importar.jsx';
import ImportarSap from './pages/ImportarSap.jsx';
import Locais from './pages/Locais.jsx';
import Consolidado from './pages/Consolidado.jsx';
import Pendencias from './pages/Pendencias.jsx';
import Clientes from './pages/Clientes.jsx';
import Config from './pages/Config.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const VAZIO = { clientes: [], orcamentos: [], locais: [], estoque: [] };

const NAV = [
  ['painel', 'Painel', 'painel'],
  ['pendencias', 'Pendências', 'pendencias'],
  ['orcamentos', 'Orçamentos', 'orcamentos'],
  ['importar', 'Importar proposta', 'importar'],
  ['importar-sap', 'Importar SAP', 'importar-sap'],
  ['locais', 'Locais e obras', 'locais'],
  ['consolidado', 'Consolidado', 'consolidado'],
  ['clientes', 'Clientes', 'clientes'],
];

function useRota() {
  const ler = () => (window.location.hash.replace(/^#\/?/, '') || 'painel').split('/');
  const [rota, setRota] = useState(ler);
  useEffect(() => {
    const f = () => setRota(ler());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return rota;
}
export const navegar = (caminho) => (window.location.hash = '/' + caminho);

export default function App() {
  const [usuario, setUsuario] = useState(undefined); // undefined = verificando
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);
  const [pendente, setPendente] = useState(null);
  const [dados, setDados] = useState(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [clienteId, setClienteId] = useState(() => localStorage.getItem('go_cliente') || '');
  const [menuAberto, setMenuAberto] = useState(false);
  const rota = useRota();

  const toast = useCallback((texto, erro = false) => {
    setToastMsg({ texto, erro });
    setTimeout(() => setToastMsg(null), erro ? 5000 : 2600);
  }, []);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados({ ...VAZIO, ...(await api('dados')) });
    } catch (e) {
      if (e.status === 401) setUsuario(null);
      else toast(e.message, true);
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    api('auth?acao=me')
      .then((r) => setUsuario(r.usuario))
      .catch((e) => {
        setPrimeiroAcesso(!!e.dados?.primeiroAcesso);
        setPendente(e.dados?.configPendente || null);
        setUsuario(null);
      });
  }, []);
  useEffect(() => {
    if (usuario) recarregar();
  }, [usuario, recarregar]);
  useEffect(() => {
    localStorage.setItem('go_cliente', clienteId);
  }, [clienteId]);
  useEffect(() => setMenuAberto(false), [rota.join('/')]);

  const salvar = useCallback(
    async (col, itens) => {
      const lista = Array.isArray(itens) ? itens : [itens];
      try {
        const r = await api(`dados?col=${col}`, { metodo: 'PUT', corpo: { itens: lista } });
        setDados((d) => {
          const mapa = new Map(d[col].map((x) => [x.id, x]));
          r.itens.forEach((x) => mapa.set(x.id, x));
          return { ...d, [col]: [...mapa.values()] };
        });
        return r.itens;
      } catch (e) {
        if (e.status === 401) setUsuario(null);
        toast(e.message, true);
        throw e;
      }
    },
    [toast],
  );

  const excluir = useCallback(
    async (col, id) => {
      try {
        await api(`dados?col=${col}&id=${encodeURIComponent(id)}`, { metodo: 'DELETE' });
        setDados((d) => ({ ...d, [col]: d[col].filter((x) => x.id !== id) }));
      } catch (e) {
        toast(e.message, true);
        throw e;
      }
    },
    [toast],
  );

  const sair = async () => {
    await api('auth?acao=logout', { metodo: 'POST' }).catch(() => {});
    setUsuario(null);
    setDados(VAZIO);
  };

  const ctx = useMemo(
    () => ({
      dados,
      recarregar,
      salvar,
      excluir,
      usuario,
      setUsuario,
      podeEditar: usuario && usuario.papel !== 'leitor',
      clienteId,
      setClienteId,
      toast,
      carregando,
      nomeCliente: (id) => dados.clientes.find((c) => c.id === id)?.nome || '—',
    }),
    [dados, recarregar, salvar, excluir, usuario, clienteId, toast, carregando],
  );

  if (usuario === undefined) return <div className="vazio">Carregando…</div>;
  if (!usuario)
    return (
      <Login
        primeiroAcesso={primeiroAcesso}
        pendente={pendente}
        aoEntrar={(u) => {
          setUsuario(u);
          navegar('painel');
        }}
      />
    );

  const [pagina, param] = rota;
  let conteudo;
  if (pagina === 'orcamentos' && param) conteudo = <OrcamentoDetalhe id={param} />;
  else if (pagina === 'pendencias') conteudo = <Pendencias />;
  else if (pagina === 'orcamentos') conteudo = <Orcamentos />;
  else if (pagina === 'importar') conteudo = <Importar />;
  else if (pagina === 'importar-sap') conteudo = <ImportarSap />;
  else if (pagina === 'locais') conteudo = <Locais abrirId={param} />;
  else if (pagina === 'consolidado') conteudo = <Consolidado />;
  else if (pagina === 'clientes') conteudo = <Clientes />;
  else if (pagina === 'config') conteudo = <Config />;
  else conteudo = <Painel />;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <nav className={`rail ${menuAberto ? 'aberto' : ''}`} aria-label="Menu principal">
          <div className="marca">
            <Simbolo className="marca-simbolo" />
            <div>
              <strong>Obras</strong>
              <span>Controle de projetos</span>
            </div>
          </div>
          {NAV.map(([id, rotulo, icone]) => (
            <a key={id} href={`#/${id}`} className={`nav ${pagina === id || (!pagina && id === 'painel') ? 'ativo' : ''}`}>
              <Icone nome={icone} /> {rotulo}
            </a>
          ))}
          <div className="sep" />
          <a href="#/config" className={`nav ${pagina === 'config' ? 'ativo' : ''}`}>
            <Icone nome="config" /> Configurações
          </a>
          <div className="rodape">
            <div style={{ marginBottom: 8 }}>
              {usuario.nome !== 'Administrador' && (
                <>
                  {usuario.nome}
                  <br />
                </>
              )}
              <span className="pequeno-txt">{usuario.papel === 'admin' ? 'Administrador' : usuario.papel === 'editor' ? 'Editor' : 'Somente leitura'}</span>
            </div>
            <button className="pequeno" onClick={sair}>
              <Icone nome="sair" tam={15} /> Sair
            </button>
          </div>
        </nav>
        <main className="conteudo">
          <button className="menu-movel" onClick={() => setMenuAberto((v) => !v)} aria-label="Abrir menu">
            <Icone nome="menu" /> Menu
          </button>
          {conteudo}
        </main>
      </div>
      {toastMsg && <div className={`toast ${toastMsg.erro ? 'erro' : ''}`}>{toastMsg.texto}</div>}
    </Ctx.Provider>
  );
}

// Seletor de cliente usado no topo das páginas
export function FiltroCliente() {
  const { dados, clienteId, setClienteId } = useApp();
  return (
    <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} aria-label="Filtrar por cliente" style={{ width: 'auto', minWidth: 180 }}>
      <option value="">Todos os clientes</option>
      {dados.clientes
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
    </select>
  );
}
