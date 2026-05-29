# Script Maxxi Montagem

Sistema web desenvolvido pela **Alencar Consultorias** para a **Maxxi Montagem**, que automatiza a importação de ordens de serviço geradas pelo sistema Liliani (Magazine Liliani) para a API Control Mob (controlmobile.net).

## O que faz

Lê PDFs tabulares de ordens de montagem enviado pelo cliente Maxxi Montagem como o arquivo *./docs/pdf_example.pdf*; extrai e estrutura os dados de cada ordem (cliente, endereço, produto, valores, telefone) e os publica em lote na API REST do Control Mob respeitando a estrutura do arquivo *./docs/struct_api_control_mob.md*. Todo o processamento é **stateless** — nenhum arquivo é salvo em disco.

## Fluxo principal

1. Upload do PDF (arrastar ou selecionar) — limite 4.5MB
2. Configurar defaults globais (ID empresa, CEP padrão, tipo de ordem, etc.)
3. Revisar e editar individualmente cada ordem extraída
4. Informar credenciais da API e publicar em lote com monitor de progresso

## Estrutura do projeto

```
public/          # Frontend estático (HTML/CSS/JS vanilla)
server/
  index.js       # Servidor Express — rotas /api/upload e /api/publish
  pdf-parser.js  # Extração de texto do PDF via unpdf
  nota-mapper.js # Parser e mapeador de texto bruto → JSON da API OMM
  api-proxy.js   # Proxy para a API externa (oculta credenciais do frontend)
api/             # Serverless functions para deploy na Vercel
vercel.json      # Configuração de deploy
```

## Stack

- **Runtime**: Node.js (CommonJS)
- **Server**: Express 5
- **PDF parsing**: unpdf (via dynamic import para compatibilidade com Vercel)
- **Upload**: multer (memória — sem escrita em disco)
- **HTTP proxy**: axios
- **Deploy**: Vercel (serverless)

## Variáveis de ambiente (`.env`)

| Variável     | Descrição                                          |
|--------------|----------------------------------------------------|
| `PORT`       | Porta do servidor local (padrão: 3000)             |
| `API_KEY`    | Chave da API OMM (fallback se não enviada pelo frontend) |
| `SECRET_KEY` | Secret da API OMM (idem)                           |

## Rodar localmente

```bash
node server/index.js
# Acesse: http://localhost:3000
```

## Notas importantes

- O `nota-mapper.js` é o coração do sistema: faz parsing heurístico do texto extraído do PDF para identificar produto, cliente, endereço e valores. Qualquer mudança no layout do PDF da Liliani pode quebrar o parsing.
- O DDD padrão para telefones sem código de área é `98` (Maranhão).
- O campo `nroProduto` está fixo em `"2026"` como código interno padrão.
- Ordens com o mesmo `nroOrdemMontagem` são agrupadas automaticamente (itens mesclados).
