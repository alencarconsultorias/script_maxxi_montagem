/**
 * LÓGICA FRONTEND — MAXXI MONTAGEM
 * Processamento Stateless e In-Memory
 */

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
const defProdCod = document.getElementById('def-prod-cod');
const btnApplyDefaults = document.getElementById('btn-apply-defaults');

// Tabela
const ordersTbody = document.getElementById('orders-tbody');
const badgeCounterContainer = document.getElementById('badge-counter-container');
const badgeTotal = document.getElementById('badge-total');

// Envio & Console
const apiUrlInput = document.getElementById('api-url');
const apiMethodSelect = document.getElementById('api-method');
const apiKeyInput = document.getElementById('api-key');
const apiSecretInput = document.getElementById('api-secret');
const btnPublishAll = document.getElementById('btn-publish-all');
const btnDownloadCsv = document.getElementById('btn-download-csv');

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
  const tipoOrdem = parseInt(defTipoOrdem.value, 10) || 1;
  const prodCod = defProdCod.value.trim() || '2026';

  sessionState.orders.forEach(ordem => {
    // Atualiza na OS
    ordem.ordemServico.idEmpresa = idEmpresa;
    ordem.ordemServico.codigoInternoClassificacaoCliente = classif;
    ordem.ordemServico.cep = cep;
    ordem.ordemServico.tipoOrdemMontagem = tipoOrdem;

    // Atualiza nos Itens
    ordem.itens.forEach(item => {
      item.nroProduto = prodCod;
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
    ordersTbody.innerHTML = `<tr><td colspan="8" class="empty-table">Nenhum PDF carregado ainda. Aguardando arquivo...</td></tr>`;
    badgeCounterContainer.style.display = 'none';
    return;
  }

  badgeTotal.textContent = sessionState.orders.length;
  badgeCounterContainer.style.display = 'block';

  sessionState.orders.forEach((ordem, index) => {
    const isExpanded = sessionState.activeEditorIndex === index;
    const client = ordem.ordemServico;
    const item = ordem.itens[0] || {};
    
    // Status visual de envio
    let statusHtml = `<span class="status-badge pending">Pendente</span>`;
    if (ordem.syncStatus === 'success') {
      statusHtml = `<span class="status-badge success">Enviado</span>`;
    } else if (ordem.syncStatus === 'error') {
      statusHtml = `<span class="status-badge error" title="${ordem.syncError || 'Erro'}">Erro</span>`;
    } else if (ordem.syncStatus === 'sending') {
      statusHtml = `<span class="status-badge warning">Enviando...</span>`;
    }

    // Linha Principal
    const tr = document.createElement('tr');
    tr.className = `main-row ${isExpanded ? 'active' : ''}`;
    tr.dataset.index = index;
    tr.innerHTML = `
      <td><strong>${index + 1}</strong></td>
      <td><code>${client.nroPedido}</code></td>
      <td><strong>${client.nomeCliente}</strong></td>
      <td>${client.nroFilial}</td>
      <td><span title="${item.descProduto}">${truncate(item.descProduto, 22)}</span></td>
      <td>R$ ${item.valorMontagem.toFixed(2)}</td>
      <td>${statusHtml}</td>
      <td><i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" class="row-arrow"></i></td>
    `;

    tr.addEventListener('click', () => toggleRow(index));
    ordersTbody.appendChild(tr);

    // Se expandido, injeta linha do painel editor
    if (isExpanded) {
      const trEditor = document.createElement('tr');
      trEditor.className = 'details-row';
      trEditor.innerHTML = `
        <td colspan="8">
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
              <div class="form-group span-2">
                <label>Observações Consolidadas</label>
                <textarea id="edit-client-obs" rows="2">${client.observacao}</textarea>
              </div>
            </div>

            <!-- ABA ITEM -->
            <div class="editor-pane ${sessionState.activeTab === 'item' ? 'active' : ''}">
              <div class="form-group span-2">
                <label>Descrição do Produto</label>
                <input type="text" id="edit-item-desc" value="${item.descProduto}">
              </div>
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
                <label>Data Prev. Montagem</label>
                <input type="date" id="edit-item-prev" value="${item.dataPrevisaoMontagem}">
              </div>
              <div class="form-group">
                <label>Valor Unitário (Base)</label>
                <input type="number" step="0.01" id="edit-item-val-unit" value="${item.valorUnitario}">
              </div>
              <div class="form-group">
                <label>Valor Montagem (Comissão)</label>
                <input type="number" step="0.01" id="edit-item-val-mont" value="${item.valorMontagem}">
              </div>
              <div class="form-group">
                <label>Quantidade</label>
                <input type="number" id="edit-item-qtd" value="${item.quantidade}">
              </div>
              <div class="form-group">
                <label>ID Empresa</label>
                <input type="number" id="edit-item-empresa" value="${client.idEmpresa}">
              </div>
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
  const item = ordem.itens[0];

  // Coleta dados da Aba Cliente
  client.nomeCliente = document.getElementById('edit-client-nome').value.trim();
  client.cpf = document.getElementById('edit-client-cpf').value.trim().replace(/\D/g, ''); // Apenas números
  client.cep = document.getElementById('edit-client-cep').value.trim().replace(/\D/g, '');
  client.nroTelefone = document.getElementById('edit-client-fone').value.trim();
  client.endereco = document.getElementById('edit-client-end').value.trim();
  client.numero = document.getElementById('edit-client-num').value.trim();
  client.bairro = document.getElementById('edit-client-bairro').value.trim();
  client.cidade = document.getElementById('edit-client-cidade').value.trim();
  client.uf = document.getElementById('edit-client-uf').value.trim().toUpperCase();
  client.observacao = document.getElementById('edit-client-obs').value.trim();
  client.observacaoPedido = client.observacao;

  // Coleta dados da Aba Item
  item.descProduto = document.getElementById('edit-item-desc').value.trim();
  item.nroProduto = document.getElementById('edit-item-cod').value.trim();
  item.nroPedido = parseInt(document.getElementById('edit-item-pedido').value, 10) || 0;
  item.nroFilial = parseInt(document.getElementById('edit-item-filial').value, 10) || 0;
  item.dataPrevisaoMontagem = document.getElementById('edit-item-prev').value;
  item.dataPrevisaoEntrega = item.dataPrevisaoMontagem; // sincroniza previsões
  client.dataPrevisaoMontagem = item.dataPrevisaoMontagem;
  
  item.valorUnitario = parseFloat(document.getElementById('edit-item-val-unit').value) || 0.0;
  item.valorMontagem = parseFloat(document.getElementById('edit-item-val-mont').value) || 0.0;
  item.quantidade = parseInt(document.getElementById('edit-item-qtd').value, 10) || 1;
  
  client.idEmpresa = parseInt(document.getElementById('edit-item-empresa').value, 10) || 0;

  // Sincroniza dados cruzados
  client.nroPedido = item.nroPedido;
  client.nroFilial = item.nroFilial;
  ordem.totalItensMontagem = item.quantidade;

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
          data: ordem
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
  btnDownloadCsv.style.display = 'inline-flex';
});

// Geração de CSV no Browser
btnDownloadCsv.addEventListener('click', () => {
  if (sessionState.orders.length === 0) return;

  log('info', 'Gerando arquivo CSV do relatório...');

  // Cabeçalho Excel brasileiro compatível (separador ponto e vírgula e acentuação UTF-8 com BOM)
  const headers = [
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
  let csvContent = headers.join(';') + '\n';
  rows.forEach(row => {
    csvContent += row.join(';') + '\n';
  });

  // Salva arquivo local via Blob e Link Efêmero
  // \uFEFF insere o byte order mark (BOM) UTF-8 para que o Excel abra acentuações perfeitamente
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  const originalName = sessionState.filename.replace('.pdf', '') || 'relatorio';
  link.setAttribute('href', url);
  link.setAttribute('download', `Relatorio_Montagem_${originalName}_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  log('success', 'Relatório CSV exportado com sucesso para download.');
});

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
  btnDownloadCsv.style.display = 'none';

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
