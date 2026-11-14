# NexoQR - Gerador de QR Codes Dinâmicos

MVP com **frontend React + Vite** e **backend Vercel Serverless Functions + PostgreSQL (Supabase)**.

## Funcionalidades

- Criar QR Codes dinâmicos (URL de destino alterável a qualquer momento)
- Dashboard com listagem de todos os QRs
- Editar URL de destino, título e descrição
- Excluir QR Codes
- Rastreamento de scans (contador + logs com IP, user-agent, referer)
- Estatísticas por QR Code (scans recentes + contagem diária)
- Gerar PNG do QR Code (endpoint próprio, sem dependência externa)
- Copiar link do QR / Baixar imagem PNG
- Interface responsiva, tema claro/escuro

## Estrutura

```
nexoqr/
├── api/                        # Vercel Serverless Functions
│   ├── _db.js                  # Pool compartilhado + helper de schema
│   ├── qr/
│   │   ├── index.js            # GET (listar), POST (criar)
│   │   └── [id]/
│   │       ├── index.js        # GET, PUT, DELETE
│   │       ├── stats/index.js  # GET estatísticas + logs
│   │       └── image/index.js  # GET PNG do QR Code
│   ├── r/
│   │   └── [slug]/index.js     # Redirect público + registro de scan
│   └── health/index.js         # Health check
├── backend/                    # Servidor Express para desenvolvimento local
│   ├── server.js
│   ├── package.json
│   └── schema.sql              # Schema para Supabase
├── frontend/                   # React + Vite
│   ├── src/{main.jsx,App.jsx,index.css}
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── package.json                # Dependências das Functions (raiz)
├── vercel.json                 # Configuração do Vercel
├── .env.example
└── README.md
```

## Rodar localmente

### 1. Configurar o banco

No **SQL Editor** do Supabase, execute o conteúdo de `backend/schema.sql`.
(As tabelas também são criadas automaticamente pela API ao rodar, mas o script deixa o banco pronto antes do primeiro uso.)

### 2. Backend

```bash
cd backend
cp ../.env.example .env
# edite .env com sua DATABASE_URL
npm install
npm run dev
# API em http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
# App em http://localhost:5173
```

O Vite faz proxy automático de `/api` e `/r` para `localhost:3001`.

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/qr` | Criar QR Code |
| GET | `/api/qr` | Listar todos |
| GET | `/api/qr/:id` | Buscar um |
| PUT | `/api/qr/:id` | Atualizar |
| DELETE | `/api/qr/:id` | Excluir |
| GET | `/api/qr/:id/stats` | Estatísticas + logs de scan |
| GET | `/api/qr/:id/image?size=512` | PNG do QR Code |
| GET | `/r/:slug` | Redirect público (incrementa scan) |
| GET | `/api/health` | Health check |

## Deploy no Vercel

### 1. Subir para o GitHub

```bash
cd C:\Projetos\nexoqr
git init
git add .
git commit -m "NexoQR MVP - PostgreSQL + Vercel"
git remote add origin https://github.com/atlasteck/NexoQr.git
git push -u origin main
```

### 2. Importar no Vercel

1. [vercel.com](https://vercel.com) → **Add New Project** → importe `atlasteck/NexoQr`
2. **Root Directory**: deixe a raiz (`.`) — o `vercel.json` cuida do frontend
3. **Framework Preset**: *Other*
4. **Build Command**: `cd frontend && npm run build`
5. **Output Directory**: `frontend/dist`

### 3. Variável de ambiente

Em **Settings → Environment Variables**, adicione:

```
DATABASE_URL = postgresql://postgres.lpmockegzhfmqqorfeiu:SENHA_URL_ENCODED@aws-1-us-west-2.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1
```

A string de conexão usa o **Connection Pooling** (host `aws-1-us-west-2.pooler.supabase.com`, porta 5432,
`pgbouncer=true`, `connection_limit=1`). Caracteres especiais da senha precisam ser URL-encoded
(`%` → `%25`, `*` → `%2A`).

### 4. Deploy

Clique em **Deploy**. O Vercel compila o frontend e publica as Functions da pasta `api/`.

## Observações importantes

- **Conexões**: as Functions compartilham um único pool (`max: 1`) via `api/_db.js`. Isso evita
  estourar o limite de conexões do Supabase em ambiente serverless.
- **Base URL**: o link do QR Code é montado com os headers `x-forwarded-host`/`x-forwarded-proto`,
  então funciona tanto em preview quanto em produção e em domínio customizado.
- **Senha no `.env`**: o arquivo `backend/.env` está no `.gitignore` e nunca deve ser commitado.

## Tecnologias

React 18, Vite, Vercel Serverless Functions (Node.js), PostgreSQL/Supabase, `pg`, `qrcode`, `nanoid`, Lucide React.

## Licença

MIT
