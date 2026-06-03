# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this system does

Web tool that reads tabular PDF orders from **Magazine Liliani** (sent by client Maxxi Montagem), parses each order's fields (client, address, product, values, phone), and batch-publishes them to the **Control Mob REST API** (`controlmobile.net`). Stateless — nothing is written to disk.

User flow: upload PDF → configure global defaults → review/edit each order → enter API credentials → publish with progress monitor.

## Running locally

```bash
node server/index.js
# Access: http://localhost:3000
```

No build step. No test suite. The app module is exported from `server/index.js` and re-exported from `api/index.js` for Vercel serverless.

## Environment variables (`.env`)

| Variable     | Description                                                  |
|--------------|--------------------------------------------------------------|
| `PORT`       | Local server port (default: 3000)                            |
| `API_KEY`    | Control Mob API key (fallback if not sent by frontend)       |
| `SECRET_KEY` | Control Mob API secret (fallback if not sent by frontend)    |

## Architecture

```
public/          # Vanilla JS/CSS/HTML frontend (no framework, no bundler)
server/
  index.js       # Express 5 server — POST /api/upload and POST /api/publish
  pdf-parser.js  # Wraps unpdf (dynamic import) to extract raw text from PDF buffer
  nota-mapper.js # Heuristic parser: raw text → Control Mob JSON array
  api-proxy.js   # Forwards requests to Control Mob API, merges .env credentials
api/index.js     # Re-exports server app for Vercel serverless
vercel.json      # Routes /api/* → api/index.js
```

**Data flow:**
1. `POST /api/upload` receives a PDF buffer (multer, memory-only), calls `extractTextFromPDF` → `mapTextToJSON`, returns array of order objects.
2. Frontend lets user review/edit orders and enter credentials.
3. `POST /api/publish` proxies each order one-by-one to the Control Mob API.

## nota-mapper.js — the critical parser

This is the most fragile file. Any change to the Liliani PDF layout can break it.

**Parsing strategy in `parseBlock()`:**
- Orders are split by the regex `(DESMONTAGEM|MONTAGEM|REVIS[ÃA]O)\s*-\s*(\d{2}\/\d{2}\/\d{4})` — each match is one order block. DESMONTAGEM must appear before MONTAGEM in the alternation to avoid a partial match.
- Within a block, `unpdf` preserves visual order: product lines → client name → address lines → `BASE: <valor> COMIS: <valor>`.
- **Primary path (pré-BASE):** Finds the first line matching `ADDR_PREFIX_RE` (RUA, AV, TRAVESSA, PASSAGEM, etc.). The line immediately before it is the client name; lines before that form the product description; lines from the address prefix onward form the address.
- **Fallback (pós-COMIS):** Used when client or address was not found in the primary path.
- Orders with the same `nroOrdemMontagem` are merged (items concatenated).

**Fixed/hardcoded values:**
- `nroProduto` is always `"2026"` (internal code).
- Default DDD for phones without area code: `98` (Maranhão).
- Default city/UF: `SAO LUIS / MA`.
- Default `cep`: `"65000000"` — should be overridden via frontend defaults.
- `codigoInternoClassificacaoCliente` is always `"ML"`.

**`valorMontagem` override rules (applied in order, last wins):**
1. Product description matches `/ESTOF/i` → `valorMontagem = 25` (R$25).
2. Product description matches `CJ MESA ALAMO ROSE 4C TEC 80X120 IMBUIA/OFF` exactly → `valorMontagem = 25`.
3. Date type is `REVISÃO` (block opened by `REVISÃO - DD/MM/YYYY`) → `valorMontagem = 20` (R$20). This overrides rules 1 and 2.

**`tipoOrdemMontagem` auto-detection (set per order, not overrideable globally):**
- Block opened by `MONTAGEM - DD/MM/YYYY` → `tipoOrdemMontagem = 124`
- Block opened by `DESMONTAGEM - DD/MM/YYYY` → `tipoOrdemMontagem = 125`
- Block opened by `REVISÃO - DD/MM/YYYY` → `tipoOrdemMontagem = 1`
- The regex `(DESMONTAGEM|MONTAGEM|REVIS[ÃA]O)` — DESMONTAGEM must come first to avoid partial match against MONTAGEM.
- Each item carries `ordemTipo: 'MONTAGEM'|'DESMONTAGEM'|'REVISAO'` for frontend display.
- The frontend global "Tipo Ordem Montagem" field is hidden; per-order type is always auto-detected.

**`ADDR_PREFIX_RE` — address line detection:**
- `CJ` is intentionally **not** in the prefix list. "CJ" appears in product names (e.g., "CJ MESA ALAMO...") and would cause misclassification if treated as "CONJUNTO" address prefix.

**Fields `dataPrevisaoEntrega` and `dataPrevisaoMontagem`** in each item are both set to the order's scheduling date (`formattedDate`). The frontend step 2 exposes a `DataPrevisao` global default that can override these for the entire batch.

**API JSON contract:** see `docs/struct_api_controlmob.json` for the full field schema sent to Control Mob.

## Deploy

Vercel serverless via `api/index.js`. The `unpdf` package uses dynamic `import()` specifically for Vercel compatibility — do not convert to `require()`. File size limit is 4.5 MB (Vercel limit).

## Stack

- Node.js CommonJS (`"type": "commonjs"` in package.json)
- Express 5, multer 2 (memory storage), axios, unpdf, dotenv
