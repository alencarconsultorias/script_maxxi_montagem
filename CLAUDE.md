# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this system does

Web tool that reads tabular PDF orders from **Magazine Liliani** (sent by client Maxxi Montagem), parses each order's fields (client, address, product, values, phone), and batch-publishes them to the **Control Mob REST API** (`controlmobile.net`). Stateless — nothing is written to disk.

User flow: upload PDF → configure global defaults → review/edit each order → enter API credentials → publish with progress monitor → download ZIP report.

## Running locally

```bash
node server/index.js
# Access: http://localhost:3000
```

No build step. No test suite. The app module is exported from `server/index.js` and re-exported from `api/index.js` for Vercel serverless.

## Version

Current version: **1.8.0** — tracked in `package.json`, `package-lock.json`, and the footer of `public/index.html`.

> **Note:** bump version in all three files simultaneously whenever releasing.

## Environment variables (`.env`)

| Variable     | Description                                                  |
|--------------|--------------------------------------------------------------|
| `PORT`       | Local server port (default: 3000)                            |
| `API_KEY`    | Control Mob API key (fallback if not sent by frontend)       |
| `SECRET_KEY` | Control Mob API secret (fallback if not sent by frontend)    |

## Architecture

```
public/          # Vanilla JS/CSS/HTML frontend (no framework, no bundler)
  app.js         # All frontend logic: session state, editor, publish flow, ZIP report
  index.css      # Styles
  index.html     # Shell — loads app.js, JSZip (CDN), Lucide icons (CDN)
server/
  index.js       # Express 5 server — POST /api/upload and POST /api/publish
  pdf-parser.js  # Wraps unpdf (dynamic import) to extract raw text from PDF buffer
  nota-mapper.js # Heuristic parser: raw text → Control Mob JSON array
  api-proxy.js   # Forwards requests to Control Mob API, merges .env credentials
api/index.js     # Re-exports server app for Vercel serverless
vercel.json      # Routes /api/* → api/index.js
docs/
  neighborhoods.txt       # Primary bairro list loaded at module init by nota-mapper.js
  struct_api_controlmob.json  # Full field schema sent to Control Mob API
```

**Data flow:**
1. `POST /api/upload` receives a PDF buffer (multer, memory-only), calls `extractTextFromPDF` → `mapTextToJSON`, returns array of order objects.
2. Frontend lets user review/edit orders and enter credentials.
3. `POST /api/publish` proxies each order one-by-one to the Control Mob API.
4. After publish, a ZIP report (CSV + JSON) is auto-generated in the browser and downloaded.

## Frontend — `public/app.js`

All frontend logic is in a single `app.js` file. No framework, no bundler.

**Session state (`sessionState`):** holds `orders`, `filename`, `activeEditorIndex`, and `activeTab`. Reset on every new PDF upload.

**Step flow (UI sections):**
1. Upload PDF → server parses and returns `orders` array.
2. Global defaults (DataPrevisao override, CEP, Equipe) — applied to all orders at once. There is **no** global nroProduto override — it is generated per item at parse time. Global Equipe (`def-equipe`) overrides `idEquipe` for all orders if set.
3. Review/edit each order — **modal popup** editor with two tabs:
   - **Client tab:** nome, endereço, bairro, cidade, UF, CEP, telefone, equipe, observação.
   - **Item tab:** descProduto, valorMontagem, valorUnitario, datas de previsão.
4. API credentials (API_KEY / SECRET_KEY).
5. Publish + progress log.

**Order summary badges:** shown above the review table — total, ESTOF count, REVISÃO count, DESMONTAGEM count.

**Equipe column and editor dropdown:** The review table has an "Equipe" column showing the team name resolved from `idEquipe` via `TEAM_MAP` (defined at the top of `app.js`). The client tab exposes a `<select>` dropdown to manually override `idEquipe` per order. `TEAM_MAP` in `app.js` is the inverse of `CITY_TEAM_MAP` in `nota-mapper.js` — keep both in sync if adding new cities/teams.

**`estofOverride` / `revisaoOverride` flags:** set by the parser on each item. The frontend uses them to style table rows and label the `valorMontagem` field (e.g., "R$25 — ESTOF", "R$20 — REVISÃO"). These flags travel with the order object but are not sent to the API.

**ZIP report (JSZip — loaded from CDN):** Generated entirely in the browser after batch publish. The ZIP contains:
- `Relatorio_Montagem_<filename>.csv` — one row per order with key fields.
- `Dados_Publicados_API_<filename>.json` — full `sessionState.orders` array.
- Downloaded automatically as `Relatorio_Completo_<filename>_<YYYY-MM-DD>.zip`.

## pdf-parser.js

`extractTextFromPDF(buffer)` uses `unpdf` with `{ mergePages: true }` — all PDF pages are flattened into a single string before parsing. This is intentional; the parser assumes a linear text stream.

## nota-mapper.js — the critical parser

This is the most fragile file. Any change to the Liliani PDF layout can break it.

**Parsing strategy in `parseBlock()`:**
- Orders are split by the regex `(DESMONTAGEM|MONTAGEM|REVIS[ÃA]O)\s*-\s*(\d{2}\/\d{2}\/\d{4})` — each match is one order block. DESMONTAGEM must appear before MONTAGEM in the alternation to avoid a partial match.
- Within a block, `unpdf` preserves visual order: product lines → client name → address lines → `BASE: <valor> COMIS: <valor>`.
- **Primary path (pré-BASE):** Finds the first line matching `ADDR_PREFIX_RE` (RUA, AV, TRAVESSA, PASSAGEM, etc.). The line immediately before it is the client name; lines before that form the product description; lines from the address prefix onward form the address.
- **Fallback (pós-COMIS):** Used when client or address was not found in the primary path.
- Orders with the same `nroPedido` are merged (items concatenated). Grouping was previously by `nroOrdemMontagem` but switched because that field is now always `0`. When merging, `nroProduto` collision is checked across all items in the group — duplicate values are regenerated randomly until unique. A second deduplication pass runs after all grouping is complete to catch any remaining collisions across the final order list. When merging orders with different products, the extra item's observação is appended to the main order's `observacao` as ` | Item extra: <text>`.

**`extractMontador(text)`:** Reads the `Montador:` header from the raw PDF text. Default fallback if not found: `'L-05 REIS NEGOCIOS , MONTAGENS E INTERMEDIACOES'`. The result populates no field in the current API payload (field `codigoInternoMontador` is always `""`).

**Fixed/hardcoded values:**
- `nroProduto` — random 6-digit number (100000–999999) generated at parse time per item. **Not overrideable** via global defaults; the frontend `def-prod-cod` field was removed.
- `nroOrdemMontagem` — same value as `nroPedido`. Applies to the item, the order root, and `ordemServico.nroOrdemMontagem`.
- `codigoInternoMontador` is always `""`.
- `dataAgendamento` is always `""`.
- `idEmpresa` is always `0`.
- `nroVendedor` is always `0`.
- Default DDD for phones without area code: `98` (Maranhão).
- Default city/UF: `SAO LUIS / MA`.
- Default `cep`: `"65000000"` — should be overridden via frontend defaults.
- `codigoInternoClassificacaoCliente` is always `"ML"`.
- `nroTelefone` fallback when no phone found in block: `"999999999"`.

**`valorMontagem` override rules (applied in order, last wins):**
0. Default (no rule matches) → `valorMontagem = 0`. The COMIS field from the PDF is **not** used.
1. Product description matches `/ESTOF/i` → `valorMontagem = 25` (R$25). Sets `estofOverride = true`.
2. Product description matches `CJ MESA ALAMO ROSE 4C TEC 80X120 IMBUIA/OFF` exactly → `valorMontagem = 25`.
3. Date type is `REVISÃO` (block opened by `REVISÃO - DD/MM/YYYY`) → `valorMontagem = 20` (R$20). Sets `revisaoOverride = true`. This overrides rules 1 and 2.

**`tipoOrdemMontagem` auto-detection (set per order, not overrideable globally):**
- Block opened by `MONTAGEM - DD/MM/YYYY` → `tipoOrdemMontagem = 124`
- Block opened by `DESMONTAGEM - DD/MM/YYYY` → `tipoOrdemMontagem = 125`
- Block opened by `REVISÃO - DD/MM/YYYY` → `tipoOrdemMontagem = 1`
- The regex `(DESMONTAGEM|MONTAGEM|REVIS[ÃA]O)` — DESMONTAGEM must come first to avoid partial match against MONTAGEM.
- Each item carries `ordemTipo: 'MONTAGEM'|'DESMONTAGEM'|'REVISAO'` for frontend display.
- The frontend global "Tipo Ordem Montagem" field is hidden; per-order type is always auto-detected.

**`ADDR_PREFIX_RE` — address line detection:**
- Full prefix list: `RUA, R., AV, AVENIDA, TRAVESSA, TV, ESTRADA, ES, PASSAGEM, PAS, QUADRA, QD, CONJUNTO, CONJ, SETOR, SET, LOTEAMENTO, LOT, CONDOMINIO, COND, BLOCO, BL, SITIO, ALAMEDA, AL, PRACA, PC, RODOVIA, ROD, LARGO, LG, VILA, VL`.
- `CJ` is intentionally **not** in the prefix list. "CJ" appears in product names (e.g., "CJ MESA ALAMO...") and would cause misclassification if treated as "CONJUNTO" address prefix.

**`extractAddressParts` — UF recognition:**
- Only these UF codes are recognized in address parsing: `MA, AP, PA, CE, PI, TO`. Adding a city from another state requires extending this list.

**`numero` extraction:**
- Extracted from the endereço using `Nº|NUMERO|N[0º]` regex. Defaults to `'S/N'` when not found or when the address contains `'S/N'` or `'SEM NUMERO'`.

**`bairro` fallback:**
- At module initialization, `nota-mapper.js` loads the full bairro list from `docs/neighborhoods.txt` into `KNOWN_BAIRROS` (sorted longest-first to avoid partial matches). If the file is not found, falls back to the hardcoded minimum list: `TURU, RECANTO, COHAB, ANJO DA GUARDA, CIDADE OPERARIA, PACO, MIRITIUA, LUMIAR, CENTRO, IPEM, VINHAIS`.
- If no bairro is parsed from the address (or the parsed value starts with `'R '` or exceeds 30 chars), a two-pass keyword scan is run: first against `endereco + referencia`; if not found, against the full `blockText`. Falls back to `''` (empty string) if none match.

**`observacaoConsolidada` structure:**
Built as: `Turno: <turno>. <referencia_limpa> Tel: (<ddd>) <numero> / ...`
- `turno` is parsed from `:: <word>` pattern in the block; defaults to `'Manha'`.
- `referencia` is text after the city/UF found in the fallback path.
- Phones are appended as a `/`-separated list.
- Noise patterns removed from `referencia`: `Data e visto do coordenador...`, `Magazine Liliani...`, `Ordem de Montagem...`, `Liliani Integrated System...`, pagination markers.
- The same string is written to both `observacao` and `observacaoPedido` on the `ordemServico`.

**Fields `dataPrevisaoEntrega` and `dataPrevisaoMontagem`** in each item are both set to the order's scheduling date (`formattedDate`). The frontend step 2 exposes a `DataPrevisao` global default that can override these for the entire batch.

**`idEquipe` auto-assignment (city → team ID):**
- Set on `ordemServico.idEquipe` automatically based on the parsed `cidade` field using `CITY_TEAM_MAP`.
- If the city is not in the map, `idEquipe` is `null` (Control Mob will ignore or reject the field).
- Current mappings:

| City | idEquipe |
|------|----------|
| SAO LUIS | 107 |
| TERESINA | 108 |
| ZE DOCA | 125 |
| SAO MATEUS | 154 |
| BALSAS | 112 |
| ARAGUAINA | 249 |

- To add a new city/team, update `CITY_TEAM_MAP` in `nota-mapper.js` (line ~156). The key must be the normalized uppercase city name as it appears after address parsing.

**API JSON contract:** see `docs/struct_api_controlmob.json` for the full field schema sent to Control Mob. See also `docs/example_REVISAO.pdf` and `docs/example_STOF.pdf` for sample PDFs used for testing edge cases.

## api-proxy.js

`proxyRequest()` forwards requests to Control Mob with a **15-second timeout**. On HTTP errors it returns the upstream `status`, `statusText`, and `data` — never throws to the caller.

## Deploy

Vercel serverless via `api/index.js`. The `unpdf` package uses dynamic `import()` specifically for Vercel compatibility — do not convert to `require()`. File size limit is 4.5 MB (Vercel limit).

## Stack

- Node.js CommonJS (`"type": "commonjs"` in package.json)
- Express 5, multer 2 (memory storage), axios, unpdf, dotenv
- Frontend: vanilla JS/HTML/CSS — JSZip 3.10.1 and Lucide icons loaded from CDN (no npm)
