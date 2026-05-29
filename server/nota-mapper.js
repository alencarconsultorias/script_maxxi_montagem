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
    montador = montador.replace(/^Montador:\s*/i, '').trim();
    return montador;
  }
  return 'L-05 REIS NEGOCIOS , MONTAGENS E INTERMEDIACOES';
}

/**
 * Extrai todos os números de telefone de um bloco de texto.
 * @param {string} text
 * @param {number|string} excludeNumber Número a ser ignorado (ex: número do pedido)
 * @returns {Array<Object>} Lista de objetos contendo ddd e number
 */
function extractPhonesFromText(text, excludeNumber) {
  const phones = [];
  const excludeStr = excludeNumber ? String(excludeNumber) : '';

  const regex = /(?:\(?\s*(\d{2})\s*\)?\s*)?(9\s*\d{4}\s*[-.\s]?\s*\d{4}|\b[2-8]\d{3}\s*[-.\s]?\s*\d{4})\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const ddd = match[1] || '';
    const num = match[2].replace(/\D/g, '');
    if (num.length === 8 || num.length === 9) {
      if (excludeStr && num === excludeStr) continue;
      phones.push({ ddd: ddd || '98', number: num });
    }
  }

  const simpleRegex = /\b(\d{2})(9\d{8}|[2-8]\d{7})\b/g;
  while ((match = simpleRegex.exec(text)) !== null) {
    const ddd = match[1];
    const num = match[2];
    if (excludeStr && num === excludeStr) continue;
    phones.push({ ddd, number: num });
  }

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
 * Extrai partes do endereço (logradouro, bairro, cidade, UF) de um texto linear.
 * @param {string} rawAddr Texto do endereço em linha
 * @returns {{ endereco: string, bairro: string, cidade: string, uf: string }}
 */
function extractAddressParts(rawAddr) {
  const result = { endereco: '', bairro: '', cidade: '', uf: '' };
  if (!rawAddr) return result;

  // Tenta separar "..., CIDADE-UF" no final
  const cityUfComma = rawAddr.match(/,\s*([^,\d]+?)\s*-\s*(MA|AP|PA|CE|PI|TO)\b/i);
  if (cityUfComma) {
    result.cidade = cityUfComma[1].trim().toUpperCase();
    result.uf = cityUfComma[2].trim().toUpperCase();
    const beforeCity = rawAddr.slice(0, rawAddr.indexOf(cityUfComma[0])).trim();
    const lastComma = beforeCity.lastIndexOf(',');
    if (lastComma !== -1) {
      const possibleBairro = beforeCity.slice(lastComma + 1).trim();
      if (possibleBairro.length > 2 && possibleBairro.length < 35) {
        result.bairro = possibleBairro.replace(/[,.-]/g, '').trim().toUpperCase();
      }
      result.endereco = beforeCity.slice(0, lastComma).trim();
    } else {
      result.endereco = beforeCity;
    }
    return result;
  }

  // Tenta "CIDADE-UF" sem vírgula separadora
  const cityUfSimple = rawAddr.match(/\b([A-ZÀ-ÿ\s]{3,}?)\s*-\s*(MA|AP|PA|CE|PI|TO)\b/i);
  if (cityUfSimple) {
    result.cidade = cityUfSimple[1].trim().toUpperCase();
    result.uf = cityUfSimple[2].trim().toUpperCase();
    result.endereco = rawAddr.slice(0, cityUfSimple.index).trim();
  } else {
    result.endereco = rawAddr;
  }

  return result;
}

/**
 * Mapeia o texto bruto do PDF para a estrutura JSON da API
 * @param {string} rawText Texto completo extraído do PDF
 * @returns {Array<Object>} Lista de ordens de montagem mapeadas
 */
function mapTextToJSON(rawText) {
  const rawOrdens = [];

  const montadorGeral = extractMontador(rawText);

  const rowStartRegex = /MONTAGEM\s*-\s*(\d{2}\/\d{2}\/\d{4})/gi;
  const matches = [];
  let match;

  while ((match = rowStartRegex.exec(rawText)) !== null) {
    matches.push({ date: match[1], index: match.index });
  }

  if (matches.length === 0) {
    console.warn("Nenhuma ordem de montagem (MONTAGEM - DD/MM/YYYY) foi encontrada no texto.");
    return [];
  }

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const startIndex = currentMatch.index;
    const endIndex = (i + 1 < matches.length) ? matches[i + 1].index : rawText.length;
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

  // Agrupar por nroOrdemMontagem
  const groupedOrdens = new Map();
  for (const ordem of rawOrdens) {
    const key = ordem.nroOrdemMontagem;
    if (groupedOrdens.has(key)) {
      const existing = groupedOrdens.get(key);
      existing.itens.push(...ordem.itens);
      existing.totalItensMontagem = existing.itens.length;

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
 * Processa um bloco de texto individual correspondente a uma única ordem.
 *
 * O unpdf extrai o texto do PDF mantendo a ordem visual: produto → cliente → endereço → BASE/COMIS.
 * A estratégia principal busca cliente e endereço na área pré-BASE; o fallback usa a área pós-COMIS.
 */
function parseBlock(blockText, montadorGeral, dataAgendamentoOriginal, index) {
  // 1. Cabeçalho: data, filial, pedido
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
  const nroOrdemMontagem = nroPedido || parseInt(dateStr.replace(/\//g, ''), 10) + index;

  // 2. Turno
  const turnoMatch = blockText.match(/:\s*:\s*([\wÀ-ÿ]+)/i);
  const turno = turnoMatch ? turnoMatch[1].trim() : 'Manha';

  // 3. Valores BASE e COMIS
  const productRegex = /BASE:\s*([\d,.]+)\s*COMIS:\s*([\d,.]+)/i;
  const productMatch = blockText.match(productRegex);

  let valorUnitario = 1.0;
  let valorMontagem = 0.0;
  if (productMatch) {
    valorUnitario = parseBrazilianFloat(productMatch[1]);
    valorMontagem = parseBrazilianFloat(productMatch[2]);
  }

  // 4. Índices chave
  let headerEndIndex = 0;
  if (headerMatch) {
    headerEndIndex = blockText.indexOf(headerMatch[0]) + headerMatch[0].length;
  } else {
    const firstNewline = blockText.indexOf('\n');
    headerEndIndex = firstNewline !== -1 ? firstNewline + 1 : 0;
  }
  const baseIndex = blockText.search(/BASE:/i);

  // 5. Telefones (varrendo o bloco inteiro)
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

  // 6. Extração de produto, cliente e endereço
  // Prefixos de logradouros brasileiros (lista expandida — inclui PASSAGEM, comum em São Luís/MA)
  const ADDR_PREFIX_RE = /^(RUA|R\.|AV|AVENIDA|TRAVESSA|TV|ESTRADA|ES|PASSAGEM|PAS|QUADRA|QD|CONJUNTO|CONJ|CJ|SETOR|SET|LOTEAMENTO|LOT|CONDOMINIO|COND|BLOCO|BL|SITIO|ALAMEDA|AL|PRACA|PC|RODOVIA|ROD|LARGO|LG|VILA|VL)\b/i;

  let descProduto = 'PRODUTO NÃO IDENTIFICADO';
  let nomeCliente = 'CLIENTE NÃO IDENTIFICADO';
  let bairro = 'CENTRO';
  let cidade = 'SAO LUIS';
  let uf = 'MA';
  let endereco = '';
  let referencia = '';

  // === Estratégia principal: área pré-BASE ===
  // O unpdf coloca os dados na ordem: produto → cliente → endereço → BASE/COMIS
  if (baseIndex > headerEndIndex) {
    const preBASELines = blockText.slice(headerEndIndex, baseIndex)
      .split(/[\r\n]+/)
      .map(l => l.trim())
      .filter(l => l.length > 1 && !/^\d{1,2}$/.test(l));

    console.log(`[parseBlock #${index}] pré-BASE lines:`, preBASELines);

    const addrLineIdx = preBASELines.findIndex(l => ADDR_PREFIX_RE.test(l));

    if (addrLineIdx > 0) {
      // Linha imediatamente antes do endereço é o nome do cliente
      const candidateClient = preBASELines[addrLineIdx - 1];

      // Valida: se parece produto (abreviação "G.", dígitos, ou palavras demais), não é cliente
      // Nomes brasileiros completos podem ter até 7-8 palavras; threshold em 8 para cobrir esses casos
      const looksLikeProduct = /^[A-ZÀ-ÿ]\./i.test(candidateClient) ||
                               /\d/.test(candidateClient) ||
                               candidateClient.split(/\s+/).length > 8;

      if (!looksLikeProduct) {
        nomeCliente = candidateClient;
        const productLines = preBASELines.slice(0, addrLineIdx - 1);
        descProduto = cleanText(productLines.join(' ')) || 'PRODUTO NÃO IDENTIFICADO';
        console.log(`[parseBlock #${index}] cliente identificado: "${nomeCliente}"`);
      } else {
        // Candidato parece produto; cliente não identificado nesta passagem
        descProduto = cleanText(preBASELines.slice(0, addrLineIdx).join(' '));
        console.log(`[parseBlock #${index}] candidato descartado como produto: "${candidateClient}"`);
      }

      // Endereço: linhas do logradouro em diante
      const rawAddr = preBASELines.slice(addrLineIdx).join(' ').replace(/\s\s+/g, ' ').trim();
      const addrParsed = extractAddressParts(rawAddr);
      endereco = addrParsed.endereco;
      if (addrParsed.bairro) bairro = addrParsed.bairro;
      if (addrParsed.cidade) cidade = addrParsed.cidade;
      if (addrParsed.uf) uf = addrParsed.uf;

    } else if (addrLineIdx === 0) {
      // Endereço começa na primeira linha (sem cliente no pré-BASE)
      const rawAddr = preBASELines.join(' ').replace(/\s\s+/g, ' ').trim();
      const addrParsed = extractAddressParts(rawAddr);
      endereco = addrParsed.endereco;
      if (addrParsed.bairro) bairro = addrParsed.bairro;
      if (addrParsed.cidade) cidade = addrParsed.cidade;
      if (addrParsed.uf) uf = addrParsed.uf;

    } else {
      // Sem prefixo de endereço reconhecido: todas as linhas formam o produto
      console.log(`[parseBlock #${index}] addrLineIdx=-1: nenhum prefixo de endereço encontrado nas linhas pré-BASE`);
      descProduto = cleanText(blockText.slice(headerEndIndex, baseIndex));
    }
  } else if (baseIndex === -1) {
    // Sem BASE/COMIS no bloco
    descProduto = cleanText(blockText.slice(headerEndIndex));
  }

  // === Fallback pós-COMIS: se cliente ou endereço ainda não identificados ===
  if (nomeCliente === 'CLIENTE NÃO IDENTIFICADO' || !endereco) {
    let textAfterProduct = blockText;
    if (productMatch) {
      const productMatchIndex = blockText.indexOf(productMatch[0]);
      textAfterProduct = blockText.slice(productMatchIndex + productMatch[0].length);
    }

    // Suporta texto com \n (unpdf multiline) e texto plano/espaçado (unpdf flat)
    const addressStartRegex = /[\s\r\n]+\s*(RUA|R|AV|AVENIDA|ES|ESTRADA|TV|TRAVESSA|PASSAGEM|PAS|QUADRA|QD|CONJ|COND|SETOR|LOT|ALAMEDA|PRACA)\b/i;
    const addressMatch = textAfterProduct.match(addressStartRegex);

    let clientPart = textAfterProduct;
    let addressPart = '';
    if (addressMatch) {
      clientPart = textAfterProduct.slice(0, addressMatch.index);
      addressPart = textAfterProduct.slice(addressMatch.index);
    }

    if (nomeCliente === 'CLIENTE NÃO IDENTIFICADO') {
      // Remove telefones antes de dividir — necessário quando o texto é plano (sem \n)
      const clientPartClean = clientPart
        .replace(/\(?\d{2}\)?\s*\d{8,9}/g, '')
        .replace(/\s\s+/g, ' ')
        .trim();
      const fallbackClientLines = clientPartClean.split(/[\r\n]+/)
        .map(l => l.trim())
        .filter(l => {
          const digits = l.replace(/\D/g, '');
          if (digits.length >= 8) return false;
          if (/^\(?\d{2}\)?$/.test(l.trim())) return false;
          return l.length > 0;
        });
      const fallbackNome = fallbackClientLines.join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*\(\d{2}\)\s*$/, '')
        .trim();
      if (fallbackNome) nomeCliente = fallbackNome;
    }

    if (!endereco && addressPart) {
      const cityUfRegex = /([A-ZÀ-ÿ\s]+)-(MA|AP|PA|CE|PI|TO)/i;
      const cityMatch = addressPart.match(cityUfRegex);
      let cleanAddressAndCity = '';
      if (cityMatch) {
        const splitIndex = cityMatch.index + cityMatch[0].length;
        cleanAddressAndCity = addressPart.slice(0, splitIndex).replace(/[\r\n]+/g, ' ').replace(/\s\s+/g, ' ').trim();
        referencia = addressPart.slice(splitIndex).trim();
      } else {
        cleanAddressAndCity = addressPart.replace(/[\r\n]+/g, ' ').replace(/\s\s+/g, ' ').trim();
      }

      const cityMatchDetailed = cleanAddressAndCity.match(/,\s*([^,]+)-(MA|AP|PA|CE|PI|TO)$/i);
      if (cityMatchDetailed) {
        cidade = cityMatchDetailed[1].trim().toUpperCase();
        uf = cityMatchDetailed[2].trim().toUpperCase();
        endereco = cleanAddressAndCity.slice(0, cityMatchDetailed.index).trim();
        const lastCommaIndex = endereco.lastIndexOf(',');
        if (lastCommaIndex !== -1) {
          const possibleBairro = endereco.slice(lastCommaIndex + 1).trim();
          if (possibleBairro.length > 2 && possibleBairro.length < 30) {
            bairro = possibleBairro.replace(/[,.-]/g, '').trim().toUpperCase();
          }
          endereco = endereco.slice(0, lastCommaIndex).trim();
        }
      } else {
        endereco = cleanAddressAndCity.replace(/,\s*$/, '');
      }
    }
  }

  // Limpezas finais do endereço
  if (endereco.toUpperCase().startsWith(nomeCliente.toUpperCase())) {
    endereco = endereco.slice(nomeCliente.length).trim();
  }
  endereco = endereco.replace(/^[,.\s]+/, '').trim();

  // Fallback inteligente para bairros conhecidos
  if (!bairro || bairro.toUpperCase().startsWith('R ') || bairro.length > 30) {
    const defaultBairros = ['TURU', 'RECANTO', 'COHAB', 'ANJO DA GUARDA', 'CIDADE OPERARIA', 'PACO', 'MIRITIUA', 'LUMIAR', 'CENTRO', 'IPEM', 'VINHAIS'];
    const textUpper = endereco.toUpperCase();
    const foundBairro = defaultBairros.find(b => textUpper.includes(b));
    bairro = foundBairro || 'CENTRO';
  }

  // Número da residência
  let numero = 'S/N';
  const numeroMatch = endereco.match(/(?:Nº|NUMERO|N[0º])\s*(\d+|[A-Z0-9\s-]+)/i);
  if (numeroMatch) {
    numero = numeroMatch[1].trim();
  }
  if (endereco.toUpperCase().includes('S/N') || endereco.toUpperCase().includes('SEM NUMERO')) {
    numero = 'S/N';
  }

  // 7. Observações consolidadas
  let cleanReferencia = cleanText(referencia)
    .replace(/:\s*:\s*[\wÀ-ÿ]+/gi, '')
    .replace(/Data e visto do coordenador responsável.*/gi, '')
    .replace(/Magazine Liliani.*/gi, '')
    .replace(/Ordem de Montagem de Mercadorias.*/gi, '')
    .replace(/Liliani Integrated System.*/gi, '')
    .replace(/-- \d+ of \d+ --/gi, '')
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
        nroProduto: "2026",
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
