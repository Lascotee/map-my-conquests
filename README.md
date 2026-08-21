# 🗺️ Territórios — Map My Conquests

Plataforma completa de inteligência e gestão territorial com mapas interativos, contornos oficiais do IBGE, rastreamento de comércios (leads) e disparo comercial via WhatsApp.

---

## ✨ Novidades & Destaques Visuais
- **Fundo com Componente `<Radar />` (React Bits + WebGL)**: Animação fluida e interativa ao movimento do cursor do mouse, com estilo dark-mode cibernético de alta fidelidade.
- **Integração Google Maps**: Suporte direto e flexível a qualquer chave de API do Google Maps (`VITE_GOOGLE_MAPS_API_KEY` ou `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`).
- **Autenticação Supabase**: Login por e-mail/senha e Google OAuth com Row Level Security (RLS) protegendo todos os dados.
- **Pronto para Deploy na Vercel**: Estrutura de arquivos configurada na raiz do projeto com zero fricção.

---

## 🚀 Como Rodar Localmente

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Crie ou edite o arquivo `.env` na raiz do projeto:
```env
# Supabase
VITE_SUPABASE_URL="https://seu-projeto.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sua_chave_publica_aqui"
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sua_chave_publica_aqui"

# Google Maps (Navegador e Servidor)
VITE_GOOGLE_MAPS_API_KEY="AIzaSy..."
GOOGLE_MAPS_API_KEY="AIzaSy..."
```

### 3. Iniciar o servidor de desenvolvimento
```bash
npm run dev
```
Acesse no seu navegador: **`http://localhost:3000`**

---

## ☁️ Como Fazer Deploy na Vercel

O projeto já está 100% configurado para a Vercel com `vercel.json` e scripts prontos:

1. Suba o código para o seu repositório no **GitHub / GitLab / Bitbucket**.
2. Acesse [vercel.com/new](https://vercel.com/new) e importe o repositório.
3. Nas configurações do projeto na Vercel (**Environment Variables**), adicione:
   - `VITE_SUPABASE_URL`: sua URL do Supabase
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: sua chave pública do Supabase
   - `SUPABASE_URL`: sua URL do Supabase
   - `SUPABASE_PUBLISHABLE_KEY`: sua chave pública do Supabase
   - `VITE_GOOGLE_MAPS_API_KEY`: sua chave do Google Maps (com APIs Maps JavaScript, Geocoding e Places habilitadas)
   - `GOOGLE_MAPS_API_KEY`: sua chave do Google Maps
4. Clique em **Deploy**. O projeto será compilado e publicado automaticamente!

---

## 🗄️ Configuração do Banco de Dados (Supabase)

Caso queira configurar ou validar o seu projeto no Supabase do zero:
1. Abra o painel do seu projeto no **[Supabase](https://supabase.com)**.
2. Vá em **SQL Editor**.
3. Copie todo o conteúdo do arquivo [`supabase/full_schema.sql`](supabase/full_schema.sql) e clique em **Run**.
4. Isso criará automaticamente todas as tabelas (`territories`, `leads`, `territory_folders`, `category_presets`, etc.) com todas as regras de segurança RLS ativas!

---

## 🛠️ Scripts Disponíveis

- `npm run dev`: Inicia o servidor local de desenvolvimento.
- `npm run build`: Compila a aplicação para produção.
- `npm run typecheck`: Executa a verificação estática do TypeScript.
- `npm run preview`: Visualiza o build de produção localmente.
