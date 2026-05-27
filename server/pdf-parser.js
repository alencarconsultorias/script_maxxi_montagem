const { PDFParse } = require('pdf-parse');

/**
 * Extrai o texto bruto de um buffer de arquivo PDF.
 * @param {Buffer} pdfBuffer Buffer do arquivo PDF enviado.
 * @returns {Promise<string>} O texto bruto extraído do PDF.
 */
async function extractTextFromPDF(pdfBuffer) {
  let parser;
  try {
    parser = new PDFParse({ data: pdfBuffer });
    const data = await parser.getText();
    return data.text;
  } catch (error) {
    console.error('Erro ao processar PDF com pdf-parse:', error);
    throw new Error('Falha na leitura do arquivo PDF. Verifique se o arquivo está corrompido.');
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}

module.exports = {
  extractTextFromPDF
};

