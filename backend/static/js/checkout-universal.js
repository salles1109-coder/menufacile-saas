/* MenuFacile Checkout Universal V3.2 REAL */
(function (window, document) {
  'use strict';

  const config = window.MenuFacileCheckoutConfig || {};

  function traduzir(pt, it, en) {
    return config.idioma === 'it' ? it : (config.idioma === 'en' ? en : pt);
  }

  async function lerJsonSeguro(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (error) {
      return {
        error: traduzir(
          'O servidor retornou uma resposta inválida.',
          'Il server ha restituito una risposta non valida.',
          'The server returned an invalid response.'
        ),
        details: text.slice(0, 500)
      };
    }
  }

  function esperar(ms) {
    return new Promise(resolve => window.setTimeout(resolve, Math.max(0, Number(ms || 0))));
  }

  function erroTransitorio(error) {
    const status = Number(error && (error.status || error.httpStatus) || 0);
    const details = error && error.details;
    const text = String((error && error.message) || '').toLowerCase();
    return [0, 408, 429, 502, 503, 504].includes(status)
      || !!(details && typeof details === 'object' && details.transient_create)
      || text.includes('demorando para responder')
      || text.includes('tente novamente em alguns segundos')
      || text.includes('failed to fetch')
      || text.includes('networkerror');
  }

  async function requisicao(url, options) {
    const opts = Object.assign({}, options || {});
    const method = String(opts.method || 'GET').toUpperCase();
    const maxRetries = opts.__mfNoRetry ? 0 : (method === 'GET' ? 2 : 1);
    delete opts.__mfNoRetry;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetch(url, opts);
        const data = await lerJsonSeguro(response);
        if (!response.ok || data.error) {
          const error = new Error(data.error || traduzir(
            'Não foi possível concluir a operação.',
            'Impossibile completare l’operazione.',
            'Could not complete the operation.'
          ));
          error.status = response.status;
          error.httpStatus = response.status;
          error.details = data.details || null;
          if (attempt < maxRetries && erroTransitorio(error)) {
            lastError = error;
            await esperar(900 * (attempt + 1));
            continue;
          }
          throw error;
        }
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && erroTransitorio(error)) {
          await esperar(900 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error(traduzir('Não foi possível concluir a operação.','Impossibile completare l’operazione.','Could not complete the operation.'));
  }

  async function reconciliarPagamento(tipo, id, token, options) {
    const opts = options || {};
    const tentativas = Math.max(1, Number(opts.tentativas || 3));
    const intervalo = Math.max(400, Number(opts.intervalo || 1200));
    let ultimo = null;
    for (let i = 0; i < tentativas; i += 1) {
      try {
        const data = await consultarStatus(tipo, id, token);
        ultimo = data;
        const status = normalizarStatus(data.gateway_status || data.payment_status || data.status_pagamento || data.status);
        if (['approved','rejected','refunded'].includes(status)) return { status, data };
      } catch (error) {
        if (!erroTransitorio(error)) throw error;
      }
      if (i + 1 < tentativas) await esperar(intervalo * (i + 1));
    }
    return { status: 'pending', data: ultimo || {} };
  }


  async function recuperarPagamentoSilenciosamente(options) {
    const opts = options || {};
    const tipo = String(opts.tipo || 'pedido');
    const id = Number(opts.id || 0);
    const token = String(opts.token || '');
    if (!id) return { status: 'pending', data: {} };
    if (typeof opts.onRecovering === 'function') opts.onRecovering();
    const result = await reconciliarPagamento(tipo, id, token, {
      tentativas: Math.max(2, Number(opts.tentativas || 3)),
      intervalo: Math.max(650, Number(opts.intervalo || 1000))
    });
    if (result.status === 'approved' && typeof opts.onApproved === 'function') opts.onApproved(result.data || {});
    else if (result.status === 'rejected' && typeof opts.onRejected === 'function') opts.onRejected(result.data || {});
    else if (typeof opts.onPending === 'function') opts.onPending(result.data || {});
    return result;
  }

  function mostrarSucessoPadrao(host, options) {
    const target = typeof host === 'string' ? document.querySelector(host) : host;
    if (!target) return false;
    const opts = options || {};
    target.replaceChildren();
    target.style.display = 'block';
    target.classList.remove('error');
    target.classList.add('mf-payment-success-host');

    const card = document.createElement('div');
    card.className = 'mf-payment-success-card';
    const top = document.createElement('div');
    top.className = 'mf-payment-success-copy';
    const icon = document.createElement('span');
    icon.className = 'mf-payment-success-icon';
    icon.textContent = '✓';
    const copy = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = String(opts.titulo || traduzir('Pagamento aprovado','Pagamento approvato','Payment approved'));
    const small = document.createElement('small');
    small.textContent = String(opts.mensagem || traduzir('Pedido confirmado.','Ordine confermato.','Order confirmed.'));
    copy.append(strong, small); top.append(icon, copy);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mf-payment-success-done';
    btn.textContent = String(opts.botao || traduzir('Concluir','Concludi','Done'));
    btn.addEventListener('click', () => {
      if (typeof opts.onConcluir === 'function') opts.onConcluir();
    });
    card.append(top, btn); target.append(card);
    return true;
  }

  function normalizarStatus(status) {
    const value = String(status || '').toLowerCase();
    if (['approved', 'paid', 'pago', 'aprovado'].includes(value)) return 'approved';
    if (['rejected', 'cancelled', 'canceled', 'cancelado', 'recusado', 'erro', 'expirado', 'pagamento_recusado', 'pagamento_cancelado'].includes(value)) return 'rejected';
    if (['refunded', 'reembolsado'].includes(value)) return 'refunded';
    return 'pending';
  }

  function iniciarPolling(options) {
    const opts = options || {};
    const interval = Math.max(2500, Number(opts.interval || 4000));
    const timeout = Math.max(interval, Number(opts.timeout || 10 * 60 * 1000));
    const startedAt = Date.now();
    let stopped = false;
    let timer = null;

    async function tick() {
      if (stopped) return;
      if (Date.now() - startedAt >= timeout) {
        stopped = true;
        if (typeof opts.onTimeout === 'function') opts.onTimeout();
        return;
      }
      try {
        const data = await requisicao(opts.url, { cache: 'no-store' });
        const status = normalizarStatus(data.payment_status || data.status);
        if (typeof opts.onUpdate === 'function') opts.onUpdate(status, data);
        if (status === 'approved' || status === 'rejected' || status === 'refunded') {
          stopped = true;
          if (typeof opts.onFinish === 'function') opts.onFinish(status, data);
          return;
        }
      } catch (error) {
        if (typeof opts.onError === 'function') opts.onError(error);
      }
      timer = window.setTimeout(tick, interval);
    }

    tick();
    return function stop() {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }


  function endpoint(tipo, id, acao) {
    const origem = tipo === 'reserva' ? 'reserva' : (tipo === 'encomenda' ? 'encomenda' : 'pedido');
    const empresaId = Number(config.empresaId || 0);
    if (!empresaId) throw new Error('Empresa inválida para o checkout.');
    if (acao === 'processar') {
      if (origem === 'reserva') return `/api/pagamentos/mercadopago/${empresaId}/reserva/processar`;
      if (origem === 'encomenda') return `/api/pagamentos/mercadopago/${empresaId}/encomenda/processar`;
      return `/api/pagamentos/mercadopago/${empresaId}/processar`;
    }
    if (!id) throw new Error('Identificador da origem não informado.');
    return `/api/pagamentos/mercadopago/${empresaId}/${origem}/${id}/${acao}`;
  }

  function publicToken(payload) {
    return String((payload && (payload.public_token || payload.token)) || config.publicToken || '');
  }

  async function processarPagamento(tipo, payload) {
    const body = Object.assign({}, payload || {});
    const token = publicToken(body);
    if (token && !body.public_token) body.public_token = token;
    if (!body.deviceId && window.MP_DEVICE_SESSION_ID) {
      body.deviceId = String(window.MP_DEVICE_SESSION_ID);
    }
    return requisicao(endpoint(tipo, null, 'processar'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': token },
      body: JSON.stringify(body)
    });
  }

  async function consultarStatus(tipo, id, token) {
    const value = String(token || config.publicToken || '');
    const url = endpoint(tipo, id, 'status') + (value ? `?token=${encodeURIComponent(value)}` : '');
    return requisicao(url, { cache: 'no-store' });
  }

  async function cancelarPagamento(tipo, id, token) {
    const value = String(token || config.publicToken || '');
    return requisicao(endpoint(tipo, id, 'cancelar'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Public-Token': value },
      body: JSON.stringify({ public_token: value })
    });
  }

  let mercadoPagoInstance = null;
  function obterMercadoPago(locale) {
    if (!config.ativo || !config.publicKey || typeof window.MercadoPago === 'undefined') return null;
    if (!mercadoPagoInstance) {
      mercadoPagoInstance = new window.MercadoPago(config.publicKey, { locale: locale || 'pt-BR' });
    }
    return mercadoPagoInstance;
  }

  function copiarTexto(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(String(text || ''));
    }
    const input = document.createElement('textarea');
    input.value = String(text || '');
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    return Promise.resolve();
  }

  window.MenuFacileCheckout = Object.freeze({
    config,
    traduzir,
    lerJsonSeguro,
    requisicao,
    normalizarStatus,
    iniciarPolling,
    copiarTexto,
    endpoint,
    processarPagamento,
    consultarStatus,
    cancelarPagamento,
    obterMercadoPago,
    esperar,
    erroTransitorio,
    reconciliarPagamento,
    recuperarPagamentoSilenciosamente,
    mostrarSucessoPadrao
  });

  // Compatibilidade com versões anteriores dos templates.
  window.mfReadJsonSafe = window.mfReadJsonSafe || lerJsonSeguro;
})(window, document);
