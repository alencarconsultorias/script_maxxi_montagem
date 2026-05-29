/**
 * Extrai o texto bruto de um buffer de arquivo PDF.
 * Usa unpdf com dynamic import para compatibilidade com Vercel serverless.
 * @param {Buffer} pdfBuffer Buffer do arquivo PDF enviado.
 * @returns {Promise<string>} O texto bruto extraído do PDF.
 */
async function extractTextFromPDF(pdfBuffer) {
  try {
    const { extractText } = await import('unpdf');
    const uint8Array = new Uint8Array(pdfBuffer);
    const { text } = await extractText(uint8Array, { mergePages: true });
    return text;
  } catch (error) {
    console.error('Erro ao processar PDF com unpdf:', error);
    throw new Error('Falha na leitura do arquivo PDF. Verifique se o arquivo está corrompido.');
  }
}

module.exports = {
  extractTextFromPDF
};
