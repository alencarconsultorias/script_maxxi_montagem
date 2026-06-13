/**
 * LÓGICA FRONTEND — MAXXI MONTAGEM
 * Processamento Stateless e In-Memory
 */

const TEAM_MAP = {
  107: 'SAO LUIS',
  108: 'TERESINA',
  125: 'ZE DOCA',
  154: 'SAO MATEUS',
  112: 'BALSAS',
  249: 'ARAGUAINA',
};
const TEAM_OPTIONS = Object.entries(TEAM_MAP)
  .map(([id, name]) => `<option value="${id}">${name} (${id})</option>`)
  .join('');

// Estado Geral da Sessão (Efêmero)
let sessionState = {
  orders: [],
  filename: '',
  activeEditorIndex: null, // Índice da ordem expandida para edição
  activeTab: 'client' // Aba ativa no editor ('client' ou 'item')
};

// Seletores do DOM
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileDetails = document.getElementById('file-details');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const btnRemoveFile = document.getElementById('btn-remove-file');
const extractionAlert = document.getElementById('extraction-alert');
const extractedCount = document.getElementById('extracted-count');

// Seções dos Passos
const sectionDefaults = document.getElementById('section-defaults');
const sectionReview = document.getElementById('section-review');
const sectionApi = document.getElementById('section-api');

// Defaults Globais
const defIdEmpresa = document.getElementById('def-id-empresa');
const defClassif = document.getElementById('def-classif');
const defCep = document.getElementById('def-cep');
const defTipoOrdem = document.getElementById('def-tipo-ordem');
const defDataPrevisao = document.getElementById('def-data-previsao');
const defEquipe = document.getElementById('def-equipe');
const btnApplyDefaults = document.getElementById('btn-apply-defaults');

// Populate equipe dropdown from TEAM_MAP
Object.entries(TEAM_MAP).forEach(([id, name]) => {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = `${name} (${id})`;
  defEquipe.appendChild(opt);
});

// Tabela
const ordersTbody = document.getElementById('orders-tbody');
const badgeCounterContainer = document.getElementById('badge-counter-container');
const badgeTotal = document.getElementById('badge-total');
const badgeEstofContainer = document.getElementById('badge-estof-container');
const badgeEstofCount = document.getElementById('badge-estof-count');
const badgeRevisaoContainer = document.getElementById('badge-revisao-container');
const badgeRevisaoCount = document.getElementById('badge-revisao-count');
const badgeDesmontagemContainer = document.getElementById('badge-desmontagem-container');
const badgeDesmontagemCount = document.getElementById('badge-desmontagem-count');

// Envio & Console
const apiUrlInput = document.getElementById('api-url');
const apiMethodSelect = document.getElementById('api-method');
const apiKeyInput = document.getElementById('api-key');
const apiSecretInput = document.getElementById('api-secret');
const btnPublishAll = document.getElementById('btn-publish-all');
const btnDownloadReport = document.getElementById('btn-download-report');

const monitorConsole = document.getElementById('monitor-console');
const consoleProgress = document.getElementById('console-progress');
const progressBarFill = document.getElementById('progress-bar-fill');
const consoleLogs = document.getElementById('console-logs');

// --- EVENTOS DE UPLOAD (STEP 1) ---

// Abrir seletor ao clicar na dropzone
dropzone.addEventListener('click', () => fileInput.click());

// Eventos de arrastar
['dragenter', 'dragover'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  }, false);
});

// Drop de arquivo
dropzone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

// Seleção tradicional
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

// Remover Arquivo
btnRemoveFile.addEventListener('click', (e) => {
  e.stopPropagation();
  resetSession();
});

// Função principal de recebimento e envio para processamento backend
function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    alert('Erro: Por favor, selecione apenas arquivos do formato PDF.');
    return;
  }

  // Validação do limite de 4.5MB para Vercel Serverless
  if (file.size > 4.5 * 1024 * 1024) {
    alert('Erro: O arquivo excede o limite temporário de 4.5MB para processamento em nuvem.');
    return;
  }

  // Atualiza a tela com o carregamento
  fileName.textContent = file.name;
  fileSize.textContent = `${(file.size / 1024).toFixed(1)} KB`;
  fileDetails.style.display = 'block';
  dropzone.style.display = 'none';
  
  log('info', `Arquivo selecionado: ${file.name}. Iniciando leitura...`);

  const formData = new FormData();
  formData.append('file', file);

  // POST para o backend extrair o PDF
  fetch('/api/upload', {
    method: 'POST',
    body: formData
  })
  .then(res => {
    if (!res.ok) throw new Error('Falha ao processar o arquivo no servidor.');
    return res.json();
  })
  .then(result => {
    if (result.success && result.data.length > 0) {
      sessionState.orders = result.data;
      sessionState.filename = file.name;

      // Exibe sucesso
      extractedCount.textContent = result.count;
      extractionAlert.style.display = 'flex';

      // Habilita as próximas etapas
      enableSection(sectionDefaults);
      enableSection(sectionReview);
      enableSection(sectionApi);
      btnApplyDefaults.disabled = false;
      btnPublishAll.disabled = false;

      // Atualiza tabela
      renderTable();
      log('success', `Sucesso! Extraídas ${result.count} ordens do PDF.`);
    } else {
      throw new Error(result.error || 'Nenhuma ordem identificada no PDF.');
    }
  })
  .catch(err => {
    log('error', `Erro na extração: ${err.message}`);
    alert(`Erro ao ler PDF: ${err.message}`);
    resetSession();
  });
}

// --- CONFIGURAÇÃO DE DEFAULTS (STEP 2) ---

btnApplyDefaults.addEventListener('click', () => {
  const idEmpresa = parseInt(defIdEmpresa.value, 10) || 0;
  const classif = defClassif.value.trim() || 'ML';
  const cep = defCep.value.trim() || '65000000';
  const dataPrevisao = defDataPrevisao.value; // YYYY-MM-DD, vazio = não sobrescreve
  const equipeVal = defEquipe.value;
  const equipeId = equipeVal !== '' ? parseInt(equipeVal, 10) : null;

  sessionState.orders.forEach(ordem => {
    // Atualiza na OS
    ordem.ordemServico.idEmpresa = idEmpresa;
    ordem.ordemServico.codigoInternoClassificacaoCliente = classif;
    ordem.ordemServico.cep = cep;
    // tipoOrdemMontagem é definido automaticamente pelo tipo detectado no PDF (MONTAGEM=124, DESMONTAGEM=125)
    if (dataPrevisao) {
      ordem.ordemServico.dataPrevisaoMontagem = dataPrevisao;
    }
    if (equipeId !== null) {
      ordem.ordemServico.idEquipe = equipeId;
    }

    // Atualiza nos Itens
    ordem.itens.forEach(item => {
      if (dataPrevisao) {
        item.dataPrevisaoMontagem = dataPrevisao;
        item.dataPrevisaoEntrega = dataPrevisao;
      }
    });
  });

  renderTable();
  log('warning', 'Valores Padrão Globais aplicados a todas as notas com sucesso!');
  
  // Efeito rápido de piscar para feedback visual
  btnApplyDefaults.classList.add('btn-success');
  setTimeout(() => btnApplyDefaults.classList.remove('btn-success'), 1000);
});

// --- RENDERIZAÇÃO DA TABELA (STEP 3) ---

function renderTable() {
  ordersTbody.innerHTML = '';
  
  if (sessionState.orders.length === 0) {
    ordersTbody.innerHTML = `<tr><td colspan="10" class="empty-table">Nenhum PDF carregado ainda. Aguardando arquivo...</td></tr>`;
    badgeCounterContainer.style.display = 'none';
    return;
  }

  badgeTotal.textContent = sessionState.orders.length;
  badgeCounterContainer.style.display = 'block';

  const estofCount = sessionState.orders.filter(o => o.itens.some(it => it.estofOverride)).length;
  badgeEstofCount.textContent = estofCount;
  badgeEstofContainer.style.display = estofCount > 0 ? 'block' : 'none';

  const revisaoCount = sessionState.orders.filter(o => o.itens.some(it => it.revisaoOverride)).length;
  badgeRevisaoCount.textContent = revisaoCount;
  badgeRevisaoContainer.style.display = revisaoCount > 0 ? 'block' : 'none';

  const desmontagemCount = sessionState.orders.filter(o => o.itens.some(it => it.ordemTipo === 'DESMONTAGEM')).length;
  badgeDesmontagemCount.textContent = desmontagemCount;
  badgeDesmontagemContainer.style.display = desmontagemCount > 0 ? 'block' : 'none';

  sessionState.orders.forEach((ordem, index) => {
    const isExpanded = sessionState.activeEditorIndex === index;
    const client = ordem.ordemServico;
    const item = ordem.itens[0] || {};
    const allProdsTitle = ordem.itens.map(it => it.descProduto).join(' | ').replace(/"/g, '&quot;');
    const itemCountBadge = ordem.itens.length > 1 ? `<span class="badge-items-count">+${ordem.itens.length - 1}</span>` : '';

    // Status visual de envio
    let statusHtml = `<span class="status-badge pending">Pendente</span>`;
    if (ordem.syncStatus === 'success') {
      statusHtml = `<span class="status-badge success">Enviado</span>`;
    } else if (ordem.syncStatus === 'error') {
      statusHtml = `<span class="status-badge error" title="${ordem.syncError || 'Erro'}">Erro</span>`;
    } else if (ordem.syncStatus === 'sending') {
      statusHtml = `<span class="status-badge warning">Enviando...</span>`;
    }

    // Tipo da ordem detectado no PDF
    const ordemTipoVal = item.ordemTipo || 'MONTAGEM';
    const tipoTagHtml = ordemTipoVal === 'DESMONTAGEM'
      ? `<span class="tipo-tag tipo-desmontagem">DESMONTAGEM</span>`
      : ordemTipoVal === 'REVISAO'
        ? `<span class="tipo-tag tipo-revisao">REVISÃO</span>`
        : `<span class="tipo-tag tipo-montagem">MONTAGEM</span>`;

    // Linha Principal
    const rowTypeClass = item.estofOverride
      ? 'row-estof'
      : item.revisaoOverride
        ? 'row-revisao'
        : ordemTipoVal === 'DESMONTAGEM'
          ? 'row-desmontagem'
          : '';
    const tr = document.createElement('tr');
    tr.className = `main-row ${isExpanded ? 'active' : ''} ${rowTypeClass}`.trim();
    tr.dataset.index = index;
    tr.innerHTML = `
      <td><strong>${index + 1}</strong></td>
      <td><code>${client.nroPedido}</code></td>
      <td>${tipoTagHtml}</td>
      <td><strong>${client.nomeCliente}</strong></td>
      <td>${client.nroFilial}</td>
      <td><span title="${allProdsTitle}">${truncate(item.descProduto, 22)} ${itemCountBadge}</span></td>
      <td>${item.estofOverride
        ? `<span class="valor-estof-tag">R$ ${item.valorMontagem.toFixed(2)} <span class="estof-label">ESTOF</span></span>`
        : item.revisaoOverride
          ? `<span class="valor-revisao-tag">R$ ${item.valorMontagem.toFixed(2)} <span class="revisao-label">REVISÃO</span></span>`
          : `R$ ${item.valorMontagem.toFixed(2)}`
      }</td>
      <td>${client.idEquipe != null ? `<span title="ID ${client.idEquipe}">${TEAM_MAP[client.idEquipe] ?? client.idEquipe}</span>` : '<span class="muted">—</span>'}</td>
      <td>${statusHtml}</td>
      <td><i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" class="row-arrow"></i></td>
    `;

    tr.addEventListener('click', () => toggleRow(index));
    ordersTbody.appendChild(tr);

    // Se expandido, injeta linha do painel editor
    if (isExpanded) {
      const trEditor = document.createElement('tr');
      trEditor.className = 'details-row';
      const itemCardsHtml = ordem.itens.map((itm, itemIdx) => `
        <div class="item-card${ordem.itens.length > 1 ? ' multi' : ''}">
          ${ordem.itens.length > 1 ? `<div class="item-card-header">Produto ${itemIdx + 1} de ${ordem.itens.length}</div>` : ''}
          <div class="form-group span-2">
            <label>Descrição do Produto</label>
            <input type="text" id="edit-item-desc-${itemIdx}" value="${itm.descProduto.replace(/"/g, '&quot;')}">
          </div>
          <div class="form-group">
            <label>Valor Montagem (Comissão)${itm.estofOverride ? ' <span class="estof-label">R$25 — ESTOF</span>' : itm.revisaoOverride ? ' <span class="revisao-label">R$20 — REVISÃO</span>' : ''}</label>
            <input type="number" step="0.01" id="edit-item-val-mont-${itemIdx}" value="${itm.valorMontagem}" ${itm.estofOverride ? 'class="input-estof-override"' : itm.revisaoOverride ? 'class="input-revisao-override"' : ''}>
          </div>
          <div class="form-group">
            <label>Valor Unitário (Base)</label>
            <input type="number" step="0.01" id="edit-item-val-unit-${itemIdx}" value="${itm.valorUnitario}">
          </div>
          <div class="form-group">
            <label>Quantidade</label>
            <input type="number" id="edit-item-qtd-${itemIdx}" value="${itm.quantidade}">
          </div>
          <div class="form-group">
            <label>Data Prev. Montagem</label>
            <input type="date" id="edit-item-prev-${itemIdx}" value="${itm.dataPrevisaoMontagem}">
          </div>
        </div>
      `).join('');
      trEditor.innerHTML = `
        <td colspan="10">
          <div class="editor-wrapper">
            <div class="editor-tabs">
              <button class="tab-btn ${sessionState.activeTab === 'client' ? 'active' : ''}" onclick="switchTab('client')">
                <i data-lucide="user"></i> Dados do Cliente (OS)
              </button>
              <button class="tab-btn ${sessionState.activeTab === 'item' ? 'active' : ''}" onclick="switchTab('item')">
                <i data-lucide="package"></i> Detalhes do Item/Montagem
              </button>
            </div>
            
            <!-- ABA CLIENTE -->
            <div class="editor-pane ${sessionState.activeTab === 'client' ? 'active' : ''}">
              <div class="form-group">
                <label>Nome do Cliente</label>
                <input type="text" id="edit-client-nome" value="${client.nomeCliente}">
              </div>
              <div class="form-group">
                <label>CPF (Essencial)</label>
                <input type="text" id="edit-client-cpf" value="${client.cpf || ''}" placeholder="Apenas números">
              </div>
              <div class="form-group">
                <label>CEP (Essencial)</label>
                <input type="text" id="edit-client-cep" value="${client.cep}" maxlength="8">
              </div>
              <div class="form-group">
                <label>Telefone</label>
                <input type="text" id="edit-client-fone" value="${client.nroTelefone}">
              </div>
              <div class="form-group span-2">
                <label>Endereço Completo</label>
                <input type="text" id="edit-client-end" value="${client.endereco}">
              </div>
              <div class="form-group">
                <label>Número</label>
                <input type="text" id="edit-client-num" value="${client.numero}">
              </div>
              <div class="form-group">
                <label>Bairro</label>
                <input type="text" id="edit-client-bairro" value="${client.bairro}">
              </div>
              <div class="form-group">
                <label>Cidade</label>
                <input type="text" id="edit-client-cidade" value="${client.cidade}">
              </div>
              <div class="form-group">
                <label>UF</label>
                <input type="text" id="edit-client-uf" value="${client.uf}" maxlength="2">
              </div>
              <div class="form-group">
                <label>Equipe</label>
                <select id="edit-client-equipe">
                  <option value="">-- Não definido --</option>
                  ${TEAM_OPTIONS.replace(`value="${client.idEquipe}"`, `value="${client.idEquipe}" selected`)}
                </select>
              </div>
              <div class="form-group span-2">
                <label>Observações Consolidadas</label>
                <textarea id="edit-client-obs" rows="2">${client.observacao}</textarea>
              </div>
            </div>

            <!-- ABA ITEM -->
            <div class="editor-pane ${sessionState.activeTab === 'item' ? 'active' : ''}">
              <div class="form-group">
                <label>Código Produto (Essencial)</label>
                <input type="text" id="edit-item-cod" value="${item.nroProduto}">
              </div>
              <div class="form-group">
                <label>Nº Pedido</label>
                <input type="number" id="edit-item-pedido" value="${item.nroPedido}">
              </div>
              <div class="form-group">
                <label>Filial (Lj)</label>
                <input type="number" id="edit-item-filial" value="${item.nroFilial}">
              </div>
              <div class="form-group">
                <label>ID Empresa</label>
                <input type="number" id="edit-item-empresa" value="${client.idEmpresa}">
              </div>
              ${itemCardsHtml}
            </div>

            <div class="form-actions-inline">
              <button class="btn btn-secondary" onclick="toggleRow(null)">Cancelar</button>
              <button class="btn btn-primary" onclick="saveActiveOrder(${index})">
                <i data-lucide="check"></i> Confirmar Edições
              </button>
            </div>
          </div>
        </td>
      `;
      ordersTbody.appendChild(trEditor);
    }
  });

  // Atualizar os ícones do Lucide
  lucide.createIcons();
}

// Expande / Contrai linha
function toggleRow(index) {
  if (sessionState.activeEditorIndex === index) {
    sessionState.activeEditorIndex = null;
  } else {
    sessionState.activeEditorIndex = index;
    sessionState.activeTab = 'client'; // volta para aba padrão
  }
  renderTable();
}

// Troca de aba no editor
window.switchTab = function(tabName) {
  sessionState.activeTab = tabName;
  renderTable();
};

// Salva alterações da nota em edição de volta para a memória
window.saveActiveOrder = function(index) {
  const ordem = sessionState.orders[index];
  const client = ordem.ordemServico;

  // Coleta dados da Aba Cliente
  client.nomeCliente = document.getElementById('edit-client-nome').value.trim();
  client.cpf = document.getElementById('edit-client-cpf').value.trim().replace(/\D/g, '');
  client.cep = document.getElementById('edit-client-cep').value.trim().replace(/\D/g, '');
  client.nroTelefone = document.getElementById('edit-client-fone').value.trim();
  client.endereco = document.getElementById('edit-client-end').value.trim();
  client.numero = document.getElementById('edit-client-num').value.trim();
  client.bairro = document.getElementById('edit-client-bairro').value.trim();
  client.cidade = document.getElementById('edit-client-cidade').value.trim();
  client.uf = document.getElementById('edit-client-uf').value.trim().toUpperCase();
  client.observacao = document.getElementById('edit-client-obs').value.trim();
  client.observacaoPedido = client.observacao;
  const equipeVal = document.getElementById('edit-client-equipe').value;
  client.idEquipe = equipeVal !== '' ? parseInt(equipeVal, 10) : null;

  // Coleta dados da Aba Item — campos compartilhados
  const nroProduto = document.getElementById('edit-item-cod').value.trim();
  const nroPedido = parseInt(document.getElementById('edit-item-pedido').value, 10) || 0;
  const nroFilial = parseInt(document.getElementById('edit-item-filial').value, 10) || 0;
  const idEmpresa = parseInt(document.getElementById('edit-item-empresa').value, 10) || 0;

  // Coleta dados por item
  ordem.itens.forEach((itm, itemIdx) => {
    itm.descProduto = document.getElementById(`edit-item-desc-${itemIdx}`).value.trim();
    itm.valorMontagem = parseFloat(document.getElementById(`edit-item-val-mont-${itemIdx}`).value) || 0.0;
    itm.valorUnitario = parseFloat(document.getElementById(`edit-item-val-unit-${itemIdx}`).value) || 0.0;
    itm.quantidade = parseInt(document.getElementById(`edit-item-qtd-${itemIdx}`).value, 10) || 1;
    itm.dataPrevisaoMontagem = document.getElementById(`edit-item-prev-${itemIdx}`).value;
    itm.dataPrevisaoEntrega = itm.dataPrevisaoMontagem;
    itm.nroProduto = nroProduto;
    itm.nroPedido = nroPedido;
    itm.nroFilial = nroFilial;
  });

  // Sincroniza dados cruzados
  client.idEmpresa = idEmpresa;
  client.nroPedido = nroPedido;
  client.nroFilial = nroFilial;
  client.dataPrevisaoMontagem = ordem.itens[0].dataPrevisaoMontagem;
  ordem.totalItensMontagem = ordem.itens.reduce((sum, itm) => sum + itm.quantidade, 0);

  // Fecha editor e re-renderiza
  sessionState.activeEditorIndex = null;
  renderTable();
  log('success', `Alterações na Ordem de ${client.nomeCliente} salvas em memória.`);
};

// --- ENVIO API & DOWNLOAD CSV (STEP 4) ---

btnPublishAll.addEventListener('click', async () => {
  const url = apiUrlInput.value.trim();
  const method = apiMethodSelect.value;
  const key = apiKeyInput.value.trim();
  const secret = apiSecretInput.value.trim();

  if (!url) {
    alert('Erro: A URL de destino da API é obrigatória.');
    return;
  }

  // Prepara o Monitor de logs
  monitorConsole.style.display = 'block';
  consoleLogs.innerHTML = '';
  log('info', `Iniciando publicação em lote de ${sessionState.orders.length} ordens...`);
  
  const headers = {};
  if (key) headers['API_KEY'] = key;
  if (secret) headers['SECRET_KEY'] = secret;

  let successCount = 0;
  let errorCount = 0;
  const total = sessionState.orders.length;

  btnPublishAll.disabled = true;

  for (let i = 0; i < total; i++) {
    const ordem = sessionState.orders[i];
    ordem.syncStatus = 'sending';
    renderTable();

    log('info', `[${i + 1}/${total}] Enviando ordem do cliente: ${ordem.ordemServico.nomeCliente}...`);

    try {
      // Chamada via proxy para evitar CORS e ocultar headers de chaves
      const response = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method,
          headers,
          data: [ordem]
        })
      });

      const resJson = await response.json();

      if (response.ok && !resJson.error) {
        ordem.syncStatus = 'success';
        ordem.syncError = '';
        successCount++;
        log('success', `[${i + 1}/${total}] Sucesso! Pedido ${ordem.ordemServico.nroPedido} cadastrado.`);
      } else {
        ordem.syncStatus = 'error';
        const errMsg = resJson.data && resJson.data.message ? resJson.data.message : (resJson.statusText || 'Erro de validação');
        ordem.syncError = errMsg;
        errorCount++;
        log('error', `[${i + 1}/${total}] Falha no envio: ${errMsg}`);
      }
    } catch (err) {
      ordem.syncStatus = 'error';
      ordem.syncError = err.message;
      errorCount++;
      log('error', `[${i + 1}/${total}] Conexão falhou: ${err.message}`);
    }

    // Atualiza Barra de Progresso
    const pct = ((i + 1) / total) * 100;
    progressBarFill.style.width = `${pct}%`;
    consoleProgress.textContent = `${i + 1}/${total}`;
    renderTable();
  }

  log('success', `Processamento de lote finalizado! Sucessos: ${successCount} | Erros: ${errorCount}`);
  btnPublishAll.disabled = false;
  btnDownloadReport.style.display = 'inline-flex';

  // Download automático após publicação
  generateAndDownloadReport();
});

// Geração de Relatório ZIP (CSV + JSON) no Browser
function generateAndDownloadReport() {
  if (sessionState.orders.length === 0) return;

  log('info', 'Preparando pacote ZIP com CSV e JSON do relatório...');

  // Cabeçalho Excel brasileiro compatível (separador ponto e vírgula e acentuação UTF-8 com BOM)
  const csvHeaders = [
    'Sequencia',
    'Pedido',
    'Cliente',
    'CPF',
    'Bairro',
    'Cidade',
    'UF',
    'Produto',
    'Valor Montagem',
    'Status API',
    'Retorno API',
    'Data de Envio'
  ];

  const rows = sessionState.orders.map((ordem, idx) => {
    const item = ordem.itens[0] || {};
    const client = ordem.ordemServico;
    return [
      idx + 1,
      client.nroPedido,
      client.nomeCliente,
      client.cpf || 'NÃO PREENCHIDO',
      client.bairro,
      client.cidade,
      client.uf,
      item.descProduto,
      item.valorMontagem.toFixed(2),
      ordem.syncStatus === 'success' ? 'SUCESSO' : 'ERRO',
      ordem.syncError ? ordem.syncError.replace(/;/g, ' ') : '200 OK',
      new Date().toLocaleString('pt-BR')
    ];
  });

  // Concatena com separador ; (Excel do Brasil exige ponto e vírgula)
  let csvContent = csvHeaders.join(';') + '\n';
  rows.forEach(row => {
    csvContent += row.join(';') + '\n';
  });

  // Adiciona BOM UTF-8 (\uFEFF) para garantir leitura de caracteres especiais no Excel
  const csvBlobContent = '\uFEFF' + csvContent;

  // JSON completo do que foi publicado na API
  const jsonContent = JSON.stringify(sessionState.orders, null, 2);

  // Inicializa o JSZip para compactar os dois arquivos
  const zip = new JSZip();
  const originalName = sessionState.filename.replace('.pdf', '') || 'relatorio';

  zip.file(`Relatorio_Montagem_${originalName}.csv`, csvBlobContent);
  zip.file(`Dados_Publicados_API_${originalName}.json`, jsonContent);

  // Gera o arquivo ZIP de forma assíncrona
  zip.generateAsync({ type: 'blob' })
    .then((content) => {
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      
      link.setAttribute('href', url);
      link.setAttribute('download', `Relatorio_Completo_${originalName}_${new Date().toISOString().slice(0, 10)}.zip`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      log('success', 'Relatório completo (.ZIP contendo CSV e JSON) exportado com sucesso!');
    })
    .catch((err) => {
      log('error', `Erro ao gerar arquivo ZIP: ${err.message}`);
      alert(`Erro ao compactar arquivos: ${err.message}`);
    });
}

btnDownloadReport.addEventListener('click', generateAndDownloadReport);

// --- AUXILIARES E POLIMENTO ---

// Habilita uma seção visual do Wizard
function enableSection(section) {
  section.classList.remove('disabled-step');
}

// Reseta toda a sessão stateless em memória
function resetSession() {
  sessionState = {
    orders: [],
    filename: '',
    activeEditorIndex: null,
    activeTab: 'client'
  };

  fileInput.value = '';
  fileDetails.style.display = 'none';
  dropzone.style.display = 'flex';
  extractionAlert.style.display = 'none';
  monitorConsole.style.display = 'none';
  btnDownloadReport.style.display = 'none';

  // Desabilita passos à frente
  sectionDefaults.classList.add('disabled-step');
  sectionReview.classList.add('disabled-step');
  sectionApi.classList.add('disabled-step');
  btnApplyDefaults.disabled = true;
  btnPublishAll.disabled = true;

  progressBarFill.style.width = '0%';
  consoleProgress.textContent = '0/0';

  renderTable();
  log('info', 'Sessão limpa. Pronto para um novo PDF.');
}

// Log na tela e no console
function log(type, msg) {
  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  
  const prefix = `[${new Date().toLocaleTimeString('pt-BR')}]`;
  item.innerHTML = `<strong>${prefix}</strong> ${msg}`;
  
  consoleLogs.appendChild(item);
  consoleLogs.scrollTop = consoleLogs.scrollHeight;
  console.log(`${prefix} [${type.toUpperCase()}] ${msg}`);
}

// Encurta strings longas
function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '...' : str;
}
