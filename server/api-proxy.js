const axios = require('axios');

/**
 * Proxy de API genérico e flexível.
 * Evita problemas de CORS no frontend e centraliza chamadas externas.
 * 
 * @param {Object} req Dados da requisição
 * @param {string} req.url URL de destino
 * @param {string} req.method Método HTTP (POST, PUT, GET, DELETE etc.)
 * @param {Object} req.headers Headers adicionais a enviar (API_KEY, SECRET_KEY, etc.)
 * @param {Object} req.data Corpo da requisição (payload JSON)
 */
async function proxyRequest({ url, method = 'POST', headers = {}, data = null }) {
  try {
    const config = {
      url,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 15000 // 15 segundos limite
    };

    if (data && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method)) {
      config.data = data;
    }

    console.log(`[API Proxy] Encaminhando ${config.method} para ${url}`);
    
    const response = await axios(config);
    
    return {
      status: response.status,
      statusText: response.statusText,
      data: response.data
    };
  } catch (error) {
    console.error('[API Proxy] Erro na requisição externa:', error.message);
    
    if (error.response) {
      return {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        error: true
      };
    }
    
    return {
      status: 500,
      statusText: 'Internal Server Error',
      data: { message: error.message },
      error: true
    };
  }
}

module.exports = {
  proxyRequest
};
