# Controle de Obras

Sistema pessoal para controlar projetos por cliente: propostas/orçamentos por PO, compras lançadas, locais e obras, levantamento de materiais, estoque recebido e painel de orçado × gasto. Tem área de login com perfis.

Stack: React (Vite) + funções serverless da Vercel (`/api`) + Upstash Redis.

## Rodar no computador

```bash
npm install
npm run dev
```

Abra http://localhost:5173 e entre com `admin` / `admin123`. Localmente, sem Upstash configurado, os dados ficam em `.data/db.json`.

## Publicar na Vercel

1. Suba a pasta para um repositório no GitHub e importe o projeto na Vercel. O framework é detectado como Vite.
2. Em **Storage**, conecte um banco **Upstash Redis**. Isso cria as variáveis `KV_REST_API_URL`/`KV_REST_API_TOKEN`, e as duas formas de nome são aceitas. Você também pode usar o mesmo Redis da Central de Alocação, porque as chaves deste projeto usam o prefixo `go:`.
3. Em **Settings > Environment Variables**, crie:
   - `JWT_SECRET`: um texto aleatório longo (`openssl rand -base64 32`).
   - `ADMIN_USER` e `ADMIN_PASSWORD`: servem só para o primeiro login. Ao entrar pela primeira vez, o usuário administrador é criado com essa senha.
4. Faça o deploy, entre e troque a senha em **Configurações**. Depois disso, as variáveis `ADMIN_*` podem ser removidas.

## Carregar os dados da CPFL

Em **Configurações > Backup**, clique em **Carregar backup** e escolha `dados-iniciais-cpfl.json`. Esse arquivo foi gerado a partir de `Projetos_Gerais_SP.xlsx` e contém 5 OPs com itens, 48 locais, postes, levantamento técnico e estoque.

Para gerar de novo a partir de uma versão atualizada da planilha:

```bash
node scripts/seed-from-planilha.mjs Projetos_Gerais_SP.xlsx dados-iniciais-cpfl.json
```

Esse arquivo tem dados de clientes. Não coloque no GitHub (a pasta `dados/` e os `.json` de backup devem ficar fora do repositório).

## Importar propostas

Em **Importar proposta**, arraste um ou vários `.xlsx`/`.xlsm`. O leitor procura a aba **Plan. Custo**, lê o cabeçalho e os itens, e busca as seguintes informações:

- Tipo de projeto, nome, cliente, comercial, elaborado por, datas, UF de origem e destino.
- Os itens da tabela, com grupo, código, descrição, unidade, marca, modelo, quantidade, custo e ROB.
- A OP e a revisão, tiradas do nome do arquivo (`..._Rev3_..._OP7905_...`).

Se a aba Plan. Custo não existir, ele usa qualquer aba com colunas de descrição e quantidade, inclusive o formato das abas "OP xxxx" da planilha de controle. Tudo aparece para revisão antes de salvar. Se o cliente não existir, ele é criado. Se o orçamento já existir (mesmo cliente, PO e nome), você escolhe entre atualizar o existente, mantendo as compras já lançadas, ou salvar como um novo.

Para suportar um layout de proposta diferente, ajuste `src/lib/parseProposta.js`. O mapeamento de colunas está em `mapColumns` e os rótulos do cabeçalho em `LABELS`. Para testar com arquivos reais:

```bash
node scripts/test-parser.mjs pasta/com/propostas
```

## Perfis de usuário

- **Administrador**: tudo, mais usuários e importação de backup.
- **Editor**: cria e altera orçamentos, locais e estoque.
- **Somente leitura**: só visualiza.

## Estrutura

```
api/            funções da Vercel (auth, usuarios, dados)
api/_lib/       banco (Upstash ou arquivo local) e sessão (JWT em cookie httpOnly)
src/pages/      telas
src/lib/        leitor de propostas, cálculos e formatação
scripts/        conversão da planilha CPFL e teste do leitor
dev-server.js   servidor local que imita a Vercel
```

## Observação sobre a biblioteca xlsx

O pacote `xlsx` do npm está na versão 0.18.5, que tem alertas de segurança conhecidos ao abrir arquivos maliciosos. Para uso pessoal, com suas próprias planilhas, o risco é baixo. Se quiser a versão atual, instale pela CDN oficial da SheetJS:

```bash
npm i https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz
```
