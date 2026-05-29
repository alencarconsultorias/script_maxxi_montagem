/**
 * Mapeador de Notas Fiscais (OMM Magazine Liliani)
 * Converte o texto bruto extraído do PDF no formato estruturado para a API.
 */

/**
 * Converte data do formato DD/MM/YYYY para YYYY-MM-DD
 * @param {string} dateStr Data no formato DD/MM/YYYY
 * @returns {string} Data no formato YYYY-MM-DD
 */
function formatDateToISO(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

/**
 * Limpa e padroniza valores numéricos do formato brasileiro (ex: 1.210,37 -> 1210.37)
 * @param {string} valueStr 
 * @returns {number}
 */
function parseBrazilianFloat(valueStr) {
  if (!valueStr) return 0;
  const clean = valueStr.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Extrai o nome do montador do cabeçalho geral
 * @param {string} text Texto bruto do PDF
 * @returns {string} Nome/código do montador
 */
function extractMontador(text) {
  const match = text.match(/Montador:\s*([^\n\r]+)/i);
  if (match) {
    let montador = match[1].trim();
    // Remove "Montador:" repetido se houver
    montador = montador.replace(/^Montador:\s*/i, '').trim();
    return montador;
  }
  return 'L-05 REIS NEGOCIOS , MONTAGENS E INTERMEDIACOES';
}

/**
 * Extrai todos os números de telefone de um bloco de texto.
 * Lida com DDD, hifens e espaços em branco. Exclui o número do pedido para evitar falsos positivos.
 * @param {string} text 
 * @param {number|string} excludeNumber Número a ser ignorado (ex: número do pedido)
 * @returns {Array<Object>} Lista de objetos contendo ddd e number
 */
function extractPhonesFromText(text, excludeNumber) {
  const phones = [];
  const excludeStr = excludeNumber ? String(excludeNumber) : '';
  
  // Expressão regular para telefones com ddd opcional e hifens/espaços (ex: 98489-2121 ou 98553 4839)
  const regex = /(?:\(?\s*(\d{2})\s*\)?\s*)?(9\s*\d{4}\s*[-.\s]?\s*\d{4}|\b[2-8]\d{3}\s*[-.\s]?\s*\d{4})\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const ddd = match[1] || '';
    const num = match[2].replace(/\D/g, '');
    
    if (num.length === 8 || num.length === 9) {
      if (excludeStr && num === excludeStr) continue;
      phones.push({
        ddd: ddd || '98', // Default para MA (98)
        number: num
      });
    }
  }
  
  // Também procura números diretos de 10-11 dígitos
  const simpleRegex = /\b(\d{2})(9\d{8}|[2-8]\d{7})\b/g;
  while ((match = simpleRegex.exec(text)) !== null) {
    const ddd = match[1];
    const num = match[2];
    if (excludeStr && num === excludeStr) continue;
    phones.push({
      ddd,
      number: num
    });
  }
  
  // Remover duplicados
  const uniquePhones = [];
  const seen = new Set();
  for (const p of phones) {
    const key = `${p.ddd}${p.number}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePhones.push(p);
    }
  }
  
  return uniquePhones;
}


/**
 * Mapeia o texto bruto do PDF para a estrutura JSON da API
 * @param {string} rawText Texto completo extraído do PDF
 * @returns {Array<Object>} Lista de ordens de montagem mapeadas
 */
function mapTextToJSON(rawText) {
  const rawOrdens = [];
  
  // 1. Extrair o montador
  const montadorGeral = extractMontador(rawText);
  
  // 2. Encontrar todas as ocorrências de início de ordem ("MONTAGEM - DD/MM/YYYY")
  const rowStartRegex = /MONTAGEM\s*-\s*(\d{2}\/\d{2}\/\d{4})/gi;
  const matches = [];
  let match;
  
  while ((match = rowStartRegex.exec(rawText)) !== null) {
    matches.push({
      date: match[1],
      index: match.index
    });
  }
  
  if (matches.length === 0) {
    console.warn("Nenhuma ordem de montagem (MONTAGEM - DD/MM/YYYY) foi encontrada no texto.");
    return [];
  }
  
  // 3. Fatiar o texto entre cada nota e processar individualmente
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const startIndex = currentMatch.index;
    const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : rawText.length;
    
    // Obtém o bloco de texto específico desta nota
    const blockText = rawText.slice(startIndex, endIndex);
    
    try {
      const ordem = parseBlock(blockText, montadorGeral, currentMatch.date, i + 1);
      if (ordem) {
        rawOrdens.push(ordem);
      }
    } catch (err) {
      console.error(`Erro ao processar bloco #${i + 1}:`, err);
    }
  }
  
  // 4. Agrupar ordens por nroOrdemMontagem / nroPedido para unificar itens
  const groupedOrdens = new Map();
  for (const ordem of rawOrdens) {
    const key = ordem.nroOrdemMontagem;
    if (groupedOrdens.has(key)) {
      const existing = groupedOrdens.get(key);
      
      // Adiciona o item ao array existente
      existing.itens.push(...ordem.itens);
      existing.totalItensMontagem = existing.itens.length;
      
      // Concatena as observações se forem produtos diferentes
      if (ordem.itens[0] && existing.itens[0] && ordem.itens[0].descProduto !== existing.itens[0].descProduto) {
        const itemObs = ordem.itens[0].observacaoMontagem;
        if (itemObs && !existing.ordemServico.observacao.includes(ordem.itens[0].descProduto)) {
          const cleanObsExtra = itemObs.replace(/^Turno: [^.]+\./i, '').trim();
          existing.ordemServico.observacao = cleanText(`${existing.ordemServico.observacao} | Item extra: ${cleanObsExtra}`);
          existing.ordemServico.observacaoPedido = existing.ordemServico.observacao;
          existing.itens.forEach(it => {
            it.observacaoMontagem = existing.ordemServico.observacao;
          });
        }
      }
    } else {
      groupedOrdens.set(key, ordem);
    }
  }
  
  return Array.from(groupedOrdens.values());
}

/**
 * Processa um bloco de texto individual correspondente a uma única ordem
 */
function parseBlock(blockText, montadorGeral, dataAgendamentoOriginal, index) {
  // 1. Regex precisa do cabeçalho da linha: data, filial, pedido
  // Exemplo: MONTAGEM -\n28/04/2026 7 31701811
  const headerRegex = /MONTAGEM\s*-\s*(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(\d+)/i;
  const headerMatch = blockText.match(headerRegex);
  
  let dateStr = dataAgendamentoOriginal;
  let nroFilial = 0;
  let nroPedido = 0;
  
  if (headerMatch) {
    dateStr = headerMatch[1];
    nroFilial = parseInt(headerMatch[2], 10);
    nroPedido = parseInt(headerMatch[3], 10);
  } else {
    // Fallback caso o header falhe
    const numbers = blockText.match(/\b\d{5,10}\b/g);
    if (numbers && numbers.length > 0) {
      nroPedido = parseInt(numbers[0], 10);
    }
    const ljMatch = blockText.match(/\bLj\s*(\d+)\b/i) || blockText.match(/\b(\d{1,2})\b/);
    if (ljMatch) {
      nroFilial = parseInt(ljMatch[1], 10);
    }
  }
  
  const formattedDate = formatDateToISO(dateStr);
  const dataAgendamentoISO = formattedDate ? `${formattedDate}T00:00:00` : '';
  const nroOrdemMontagem = nroPedido || parseInt(dateStr.replace(/\//g, ''), 10) + index;
  
  // 2. Turno: Captura do rodapé/fim do bloco (: : Turno)
  const turnoMatch = blockText.match(/:\s*:\s*([\w\u00C0-\u00FF]+)/i);
  const turno = turnoMatch ? turnoMatch[1].trim() : 'Manha';
  
  // 3. Extrair Produto, Valor Unitário (BASE) e Valor Montagem (COMIS)
  const productRegex = /BASE:\s*([\d,.]+)\s*COMIS:\s*([\d,.]+)/i;
  const productMatch = blockText.match(productRegex);
  
  let descProduto = 'PRODUTO NÃO IDENTIFICADO';
  let valorUnitario = 1.0;
  let valorMontagem = 0.0;
  let textAfterProduct = blockText;
  
  if (productMatch) {
    valorUnitario = parseBrazilianFloat(productMatch[1]);
    valorMontagem = parseBrazilianFloat(productMatch[2]);
    
    // Encontra o fim do cabeçalho
    let headerEndIndex = 0;
    if (headerMatch) {
      headerEndIndex = blockText.indexOf(headerMatch[0]) + headerMatch[0].length;
    } else {
      const firstNewline = blockText.indexOf('\n');
      headerEndIndex = firstNewline !== -1 ? firstNewline + 1 : 0;
    }
    
    // O produto fica entre o final do cabeçalho e a linha BASE
    const baseIndex = blockText.search(/BASE:/i);
    if (baseIndex > headerEndIndex) {
      descProduto = cleanText(blockText.slice(headerEndIndex, baseIndex));
    }
    
    // Tudo após a linha COMIS é referente ao cliente e entrega
    const productMatchIndex = blockText.indexOf(productMatch[0]);
    textAfterProduct = blockText.slice(productMatchIndex + productMatch[0].length);
  }
  
  // 4. Telefones: Coletar todos os números válidos do bloco (excluindo o número do pedido)
  const uniquePhones = extractPhonesFromText(blockText, nroPedido);
  let nroDDD = '98';
  let nroTelefone = '';
  let nroTelefoneExtra = '';
  
  if (uniquePhones.length > 0) {
    nroDDD = uniquePhones[0].ddd;
    nroTelefone = uniquePhones[0].number;
    if (uniquePhones.length > 1) {
      nroTelefoneExtra = uniquePhones[1].number;
    }
  }
  
  // 5. Separar dados do cliente do endereço de entrega
  // Identifica a primeira linha após os produtos que inicia com um prefixo de endereço (RUA, R, AV, etc.)
  const addressStartRegex = /[\r\n]+\s*(RUA|R|AV|AVENIDA|ES|ESTRADA|TV|TRAVESSA)\b/i;
  const addressMatch = textAfterProduct.match(addressStartRegex);
  
  let clientPart = textAfterProduct;
  let addressPart = '';
  
  if (addressMatch) {
    clientPart = textAfterProduct.slice(0, addressMatch.index);
    addressPart = textAfterProduct.slice(addressMatch.index);
  }
  
  // Extrai nome do cliente
  const clientLines = clientPart.split(/[\r\n]+/)
    .map(l => l.trim())
    .filter(l => {
      const cleanLine = l.replace(/\D/g, '');
      if (cleanLine.length >= 8) return false; // descarta linhas de telefone puro
      if (/^\(?\d{2}\)?$/.test(l.trim())) return false; // descarta DDDs soltos ex: (98)
      return l.length > 0;
    });
  
  const nomeCliente = clientLines.join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*\(\d{2}\)\s*$/, '') // Remove DDD do fim do nome
    .trim() || 'CLIENTE NÃO IDENTIFICADO';
    
  // Extrai endereço, bairro, cidade, uf e referência da parte de endereço
  let cleanAddressAndCity = '';
  let referencia = '';
  
  const cityUfRegex = /([A-ZÀ-Ú\s]+)-(MA|AP|PA|CE|PI|TO)/i;
  const cityMatch = addressPart.match(cityUfRegex);
  
  if (cityMatch) {
    const splitIndex = cityMatch.index + cityMatch[0].length;
    cleanAddressAndCity = addressPart.slice(0, splitIndex).replace(/[\r\n]+/g, ' ').replace(/\s\s+/g, ' ').trim();
    referencia = addressPart.slice(splitIndex).trim();
  } else {
    cleanAddressAndCity = addressPart.replace(/[\r\n]+/g, ' ').replace(/\s\s+/g, ' ').trim();
  }
  
  let bairro = 'CENTRO';
  let cidade = 'SAO LUIS';
  let uf = 'MA';
  let endereco = cleanAddressAndCity.replace(/,\s*$/, ''); // Remove vírgula final
  
  const cityMatchDetailed = cleanAddressAndCity.match(/,\s*([^,]+)-(MA|AP|PA|CE|PI|TO)$/i);
  if (cityMatchDetailed) {
    cidade = cityMatchDetailed[1].trim().toUpperCase();
    uf = cityMatchDetailed[2].trim().toUpperCase();
    endereco = cleanAddressAndCity.slice(0, cityMatchDetailed.index).trim();
    
    // Tenta extrair o Bairro
    const lastCommaIndex = endereco.lastIndexOf(',');
    if (lastCommaIndex !== -1) {
      const possibleBairro = endereco.slice(lastCommaIndex + 1).trim();
      if (possibleBairro.length > 2 && possibleBairro.length < 30) {
        bairro = possibleBairro.replace(/[,.-]/g, '').trim().toUpperCase();
      }
    } else {
      const parts = endereco.split(/\s+/);
      if (parts.length > 1) {
        bairro = parts[parts.length - 1].replace(/[,.-]/g, '').trim().toUpperCase();
      }
    }
  }
  
  // Limpar resíduos do nome do cliente que possam estar no início do endereço
  if (endereco.toUpperCase().startsWith(nomeCliente.toUpperCase())) {
    endereco = endereco.slice(nomeCliente.length).trim();
  }
  endereco = endereco.replace(/^[,.\s]+/, '').trim();
  
  // Fallback inteligente para bairros conhecidos se ficou inválido
  if (!bairro || bairro.toUpperCase().startsWith('R ') || bairro.length > 30) {
    const defaultBairros = ['TURU', 'RECANTO', 'COHAB', 'ANJO DA GUARDA', 'CIDADE OPERARIA', 'PACO', 'MIRITIUA', 'LUMIAR', 'CENTRO', 'IPEM', 'VINHAIS'];
    const textUpper = endereco.toUpperCase();
    const foundBairro = defaultBairros.find(b => textUpper.includes(b));
    bairro = foundBairro || 'CENTRO';
  }
  
  // Extrair número da residência (Nº)
  let numero = 'S/N';
  const numeroMatch = endereco.match(/(?:Nº|NUMERO|N[0º])\s*(\d+|[A-Z0-9\s-]+)/i);
  if (numeroMatch) {
    numero = numeroMatch[1].trim();
  }
  if (endereco.toUpperCase().includes('S/N') || endereco.toUpperCase().includes('SEM NUMERO')) {
    if (numero === '0' || numero === 'S/N') {
      numero = 'S/N';
    }
  }
  
  // 6. Limpeza profunda do bloco de referência/observações
  // Remove assinaturas, cabeçalhos do PDF e paginação
  let cleanReferencia = cleanText(referencia)
    .replace(/:\s*:\s*[\w\u00C0-\u00FF]+/gi, '') // Remove turno
    .replace(/Data e visto do coordenador responsável.*/gi, '') // Remove assinatura do coordenador
    .replace(/Magazine Liliani.*/gi, '') // Remove cabeçalhos de novas páginas
    .replace(/Ordem de Montagem de Mercadorias.*/gi, '')
    .replace(/Liliani Integrated System.*/gi, '')
    .replace(/-- \d+ of \d+ --/gi, '') // Remove marcação de página ex: -- 3 of 5 --
    .replace(/Pag\. de\s*\d+\s*\d+/gi, '')
    .trim();
  
  let observacaoConsolidada = `Turno: ${turno}.`;
  if (cleanReferencia) {
    observacaoConsolidada += ` ${cleanReferencia}`;
  }
  if (uniquePhones.length > 0) {
    const phoneList = uniquePhones.map(p => `(${p.ddd}) ${p.number}`).join(' / ');
    observacaoConsolidada += ` Tel: ${phoneList}`;
  }
  observacaoConsolidada = cleanText(observacaoConsolidada);
  
  return {
    codigoInternoMontador: "",
    dataAgendamento: "",
    itens: [
      {
        dataPrevisaoEntrega: formattedDate,
        dataPrevisaoMontagem: formattedDate,
        descProduto: descProduto,
        nroFilial: nroFilial,
        nroOrdemMontagem: nroOrdemMontagem,
        nroPedido: nroPedido,
        nroProduto: "2026", // Default inteligente da aplicação
        observacaoMontagem: observacaoConsolidada,
        qtdHorasMontagem: 0,
        quantidade: 1,
        valorMontagem: valorMontagem,
        valorUnitario: valorUnitario
      }
    ],
    nroOrdemMontagem: nroOrdemMontagem,
    ordemServico: {
      bairro: bairro || "CENTRO",
      cep: "65000000",
      cidade: cidade.toUpperCase() || "SAO LUIS",
      codigoInternoClassificacaoCliente: "ML",
      codigoInternoCliente: "",
      complemento: "",
      cpf: "",
      dataPrevisaoMontagem: formattedDate,
      endereco: endereco || "ENDEREÇO NÃO IDENTIFICADO",
      idEmpresa: 0,
      nomeCliente: nomeCliente,
      nroDDD: nroDDD,
      nroFilial: nroFilial,
      nroOrdemMontagem: nroOrdemMontagem,
      nroPedido: nroPedido,
      nroTelefone: nroTelefone || "999999999",
      nroTelefoneExtra: nroTelefoneExtra,
      nroVendedor: 0,
      numero: numero,
      observacao: observacaoConsolidada,
      observacaoPedido: observacaoConsolidada,
      siglaFilial: "",
      tipoOrdemMontagem: 1,
      uf: uf
    },
    totalItensMontagem: 1
  };
}

/**
 * Auxiliar para limpar espaços duplos, quebras de linha e tabulações excessivas
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s\s+/g, ' ')
    .trim();
}

module.exports = {
  mapTextToJSON
};

