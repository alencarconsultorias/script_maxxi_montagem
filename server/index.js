const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const { extractTextFromPDF } = require('./pdf-parser');
const { mapTextToJSON } = require('./nota-mapper');
const { proxyRequest } = require('./api-proxy');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Multer para upload do PDF em memória (sem salvar nada em disco)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 4.5 * 1024 * 1024 } // Limite Vercel: 4.5MB
});

/**
 * ROTA: Upload de PDF e extração estruturada
 * Recebe o arquivo e retorna o JSON mapeado
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Formato inválido. Por favor, envie apenas arquivos PDF.' });
    }

    console.log(`[Server] Recebido PDF: ${req.file.originalname} (${req.file.size} bytes)`);

    // 1. Extração do texto em memória
    const rawText = await extractTextFromPDF(req.file.buffer);

    // 2. Mapeamento para a estrutura JSON da API
    const ordensMapeadas = mapTextToJSON(rawText);

    console.log(`[Server] Processamento concluído. ${ordensMapeadas.length} ordens identificadas.`);

    return res.json({
      success: true,
      filename: req.file.originalname,
      count: ordensMapeadas.length,
      data: ordensMapeadas
    });

  } catch (error) {
    console.error('[Server Error] Falha ao processar PDF:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao processar o arquivo PDF.'
    });
  }
});

/**
 * ROTA: Proxy de publicação
 * Recebe chaves e payload do frontend e repassa para a API destino
 */
app.post('/api/publish', async (req, res) => {
  const { url, method, headers, data } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Parâmetro url é obrigatório.' });
  }

  try {
    // Mescla chaves de segurança do backend se configuradas no .env
    const finalHeaders = {
      ...headers
    };

    // Caso o cliente queira ocultar a KEY do frontend, puxamos do .env local como fallback
    if (process.env.API_KEY && !finalHeaders['API_KEY']) {
      finalHeaders['API_KEY'] = process.env.API_KEY;
    }
    if (process.env.SECRET_KEY && !finalHeaders['SECRET_KEY']) {
      finalHeaders['SECRET_KEY'] = process.env.SECRET_KEY;
    }

    const result = await proxyRequest({
      url,
      method: method || 'POST',
      headers: finalHeaders,
      data
    });

    return res.status(result.status).json(result);
  } catch (error) {
    console.error('[Server Error] Proxy falhou:', error);
    return res.status(500).json({
      error: true,
      message: 'Falha ao conectar com o servidor de proxy local.'
    });
  }
});

// Inicia o servidor local apenas se executado diretamente
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 SERVIDOR MAXXI MONTAGEM INICIADO COM SUCESSO!`);
    console.log(`   Acesse no navegador: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
