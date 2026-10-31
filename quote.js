'use strict';

// Quote math, list rules, and Yahoo request URLs. No DOM.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StockWatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var MAX_SYMBOLS = 30;
  var CRYPTO_RESERVED = 5;
  var MAX_STOCKS = MAX_SYMBOLS - CRYPTO_RESERVED;

  var ALIASES = {
    'DOW': alias('^DJI', 'Dow', false),
    'DJIA': alias('^DJI', 'Dow', false),
    'DJI': alias('^DJI', 'Dow', false),
    '^DJI': alias('^DJI', 'Dow', false),
    'DOW JONES': alias('^DJI', 'Dow', false),
    'NASDAQ': alias('^IXIC', 'Nasdaq', false),
    'NASDAQ COMPOSITE': alias('^IXIC', 'Nasdaq', false),
    'IXIC': alias('^IXIC', 'Nasdaq', false),
    '^IXIC': alias('^IXIC', 'Nasdaq', false),
    'BITCOIN': alias('BTC-USD', 'Bitcoin', true),
    'BTC': alias('BTC-USD', 'Bitcoin', true),
    'BTCUSD': alias('BTC-USD', 'Bitcoin', true),
    'BTC-USD': alias('BTC-USD', 'Bitcoin', true),
    'ETHER': alias('ETH-USD', 'Ether', true),
    'ETHEREUM': alias('ETH-USD', 'Ether', true),
    'ETH': alias('ETH-USD', 'Ether', true),
    'ETHUSD': alias('ETH-USD', 'Ether', true),
    'ETH-USD': alias('ETH-USD', 'Ether', true)
  };

  var LABELS = {
    '^DJI': 'Dow',
    '^IXIC': 'Nasdaq',
    'BTC-USD': 'Bitcoin',
    'ETH-USD': 'Ether'
  };

  // NYSE full closures and 1:00 p.m. ET early closes, 2026–2028.
  var HOLIDAYS = {
    '2026-01-01': 1, '2026-01-19': 1, '2026-02-16': 1, '2026-04-03': 1,
    '2026-05-25': 1, '2026-06-19': 1, '2026-07-03': 1, '2026-09-07': 1,
    '2026-11-26': 1, '2026-12-25': 1,
    '2027-01-01': 1, '2027-01-18': 1, '2027-02-15': 1, '2027-03-26': 1,
    '2027-05-31': 1, '2027-06-18': 1, '2027-07-05': 1, '2027-09-06': 1,
    '2027-11-25': 1, '2027-12-24': 1,
    '2028-01-17': 1, '2028-02-21': 1, '2028-04-14': 1, '2028-05-29': 1,
    '2028-06-19': 1, '2028-07-04': 1, '2028-09-04': 1, '2028-11-23': 1,
    '2028-12-25': 1
  };

  var EARLY_CLOSES = {
    '2026-11-27': 1,
    '2026-12-24': 1,
    '2027-11-26': 1,
    '2028-07-03': 1,
    '2028-11-24': 1
  };

  var PRELOAD = [
    { symbol: 'AMD' },
    { symbol: 'NVDA' },
    { symbol: 'TMDX' },
    { symbol: 'V' },
    { symbol: 'SPCX' },
    { symbol: 'VRT' },
    { symbol: 'COMP' },
    { symbol: 'AAPL' },
    { symbol: 'APH' },
    { symbol: 'CAPR' },
    { symbol: 'VZ' },
    { symbol: 'AVGO' },
    { symbol: '^DJI', label: 'Dow' },
    { symbol: '^IXIC', label: 'Nasdaq' },
    { symbol: 'BTC-USD', label: 'Bitcoin', crypto: true },
    { symbol: 'ETH-USD', label: 'Ether', crypto: true }
  ];

  function alias(symbol, label, crypto) {
    return { symbol: symbol, label: label, crypto: crypto };
  }

  function sortKey(symbol) {
    var s = String(symbol || '').trim().toUpperCase();
    if (s.charAt(0) === '^') s = s.slice(1);
    if (s.slice(-4) === '-USD') s = s.slice(0, -4);
    return s;
  }

  function resolveInput(raw) {
    var text = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!text) return { ok: false, reason: 'empty' };
    var key = text.toUpperCase();
    var known = ALIASES[key];
    if (known) {
      return {
        ok: true,
        symbol: known.symbol,
        label: known.label,
        crypto: known.crypto,
        locked: true
      };
    }
    var symbol = key.replace(/\s+/g, '');
    if (!/^(?:\^[A-Z][A-Z0-9.]{0,9}|[A-Z][A-Z0-9.\-]{0,14})$/.test(symbol)) {
      return { ok: false, reason: 'invalid' };
    }
    return {
      ok: true,
      symbol: symbol,
      label: LABELS[symbol] || null,
      crypto: symbol.slice(-4) === '-USD',
      locked: false
    };
  }

  function labelFor(symbol) {
    return LABELS[symbol] || null;
  }

  function normalizeItem(item) {
    if (!item || typeof item.symbol !== 'string') return null;
    var resolved = resolveInput(item.symbol);
    if (!resolved.ok) return null;
    return {
      symbol: resolved.symbol,
      label: item.label || resolved.label || null,
      crypto: item.crypto === true || resolved.crypto === true
    };
  }

  function bySymbol(a, b) {
    return sortKey(a.symbol).localeCompare(sortKey(b.symbol), 'en', { sensitivity: 'base' });
  }

  function sections(items) {
    var stocks = [];
    var crypto = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].crypto) crypto.push(items[i]);
      else stocks.push(items[i]);
    }
    stocks.sort(bySymbol);
    crypto.sort(bySymbol);
    return { stocks: stocks, crypto: crypto };
  }

  function addDecision(items, entry) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].symbol === entry.symbol) return { ok: false, reason: 'duplicate' };
    }
    if (items.length >= MAX_SYMBOLS) return { ok: false, reason: 'full' };
    var stocks = 0;
    for (var j = 0; j < items.length; j++) if (!items[j].crypto) stocks++;
    if (!entry.crypto && stocks >= MAX_STOCKS) return { ok: false, reason: 'stocks-full' };
    return { ok: true };
  }

  function messageFor(reason, symbol) {
    if (reason === 'duplicate') return sortKey(symbol) + ' is already on the list.';
    if (reason === 'stocks-full') return 'Stocks are full at 25. Those spots stay open for crypto.';
    if (reason === 'full') return 'The list is full at 30.';
    if (reason === 'invalid') return 'Type a ticker, or Dow, Nasdaq, Bitcoin, or Ether.';
    return '';
  }

  function ymdInZone(unixSeconds, timeZone) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    var parts = {};
    var list = fmt.formatToParts(new Date(unixSeconds * 1000));
    for (var i = 0; i < list.length; i++) parts[list[i].type] = list[i].value;
    return parts.year + '-' + parts.month + '-' + parts.day;
  }

  function easternParts(date) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23'
    });
    var parts = {};
    var list = fmt.formatToParts(date);
    for (var i = 0; i < list.length; i++) parts[list[i].type] = list[i].value;
    var hour = Number(parts.hour);
    if (hour === 24) hour = 0;
    return {
      ymd: parts.year + '-' + parts.month + '-' + parts.day,
      minutes: hour * 60 + Number(parts.minute),
      weekday: parts.weekday
    };
  }

  function marketStatus(date) {
    var p = easternParts(date);
    if (p.weekday === 'Sat' || p.weekday === 'Sun' || HOLIDAYS[p.ymd]) {
      return { open: false };
    }
    var openMin = 9 * 60 + 30;
    var closeMin = EARLY_CLOSES[p.ymd] ? 13 * 60 : 16 * 60;
    return { open: p.minutes >= openMin && p.minutes < closeMin };
  }

  function formatAsOf(date) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return 'As of ' + fmt.format(date) + ' ET';
  }

  function previousSessionClose(timestamps, closes, sessionUnix, timeZone) {
    if (!sessionUnix || !timestamps || !closes) return null;
    var sessionDay = ymdInZone(sessionUnix, timeZone);
    var prev = null;
    for (var i = 0; i < timestamps.length; i++) {
      var close = closes[i];
      if (close == null || !isFinite(close)) continue;
      if (ymdInZone(timestamps[i], timeZone) < sessionDay) prev = close;
    }
    return prev;
  }

  function changeOver24h(block) {
    var meta = block && block.meta;
    if (!meta || !isFinite(meta.regularMarketPrice) || !meta.regularMarketTime) return null;
    var quote = block.indicators && block.indicators.quote && block.indicators.quote[0];
    var closes = quote && quote.close;
    var timestamps = block.timestamp;
    if (!closes || !timestamps) return null;
    var target = meta.regularMarketTime - 86400;
    var best = null;
    for (var i = 0; i < timestamps.length; i++) {
      if (closes[i] == null || !isFinite(closes[i])) continue;
      var dist = Math.abs(timestamps[i] - target);
      if (!best || dist < best.dist) best = { dist: dist, price: closes[i] };
    }
    if (!best || best.dist > 90 * 60) return null;
    return meta.regularMarketPrice - best.price;
  }

  function parseQuoteBlock(block) {
    if (!block || !block.meta || !isFinite(block.meta.regularMarketPrice)) return null;
    var meta = block.meta;
    var quote = block.indicators && block.indicators.quote && block.indicators.quote[0];
    var closes = (quote && quote.close) || [];
    var prev = previousSessionClose(block.timestamp || [], closes, meta.regularMarketTime, meta.exchangeTimezoneName);
    var price = meta.regularMarketPrice;
    return {
      price: price,
      prevClose: prev,
      change: prev == null ? null : price - prev,
      index: meta.instrumentType === 'INDEX' || String(meta.symbol || '').charAt(0) === '^',
      crypto: meta.instrumentType === 'CRYPTOCURRENCY',
      time: meta.regularMarketTime
    };
  }

  function quoteFor(item, dailyBlock, hourlyBlock) {
    var block = dailyBlock || hourlyBlock;
    var base = parseQuoteBlock(block);
    if (!base) return null;
    var crypto = !!(item && item.crypto) || base.crypto;
    if (crypto) {
      var hourly = hourlyBlock ? parseQuoteBlock(hourlyBlock) : null;
      var price = hourly && hourly.price != null ? hourly.price : base.price;
      var change = hourlyBlock ? changeOver24h(hourlyBlock) : null;
      if (change == null) change = base.change;
      return {
        price: price,
        change: change,
        index: false,
        crypto: true,
        time: hourly && hourly.time ? hourly.time : base.time
      };
    }
    return {
      price: base.price,
      change: base.change,
      index: base.index || !!(item && String(item.symbol).charAt(0) === '^'),
      crypto: false,
      time: base.time
    };
  }

  function blockFromItem(item) {
    if (!item) return null;
    if (item.response && item.response[0] && item.response[0].meta) return item.response[0];
    if (item.meta) return item;
    return null;
  }

  function indexSpark(data) {
    var map = {};
    var rows = data && data.spark && data.spark.result;
    if (!rows || !rows.length) return map;
    for (var i = 0; i < rows.length; i++) {
      var block = blockFromItem(rows[i]);
      if (rows[i].symbol && block) map[rows[i].symbol] = block;
    }
    return map;
  }

  function instrumentKind(data) {
    var result = data && data.chart && data.chart.result && data.chart.result[0];
    var type = result && result.meta && result.meta.instrumentType;
    if (type === 'CRYPTOCURRENCY') return 'crypto';
    if (type) return 'other';
    return 'unknown';
  }

  function formatAbs(n, digits) {
    return Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatPrice(value, index) {
    if (value == null || !isFinite(value)) return '\u2014';
    var digits = Math.abs(value) >= 1 ? 2 : 4;
    var num = formatAbs(value, digits);
    return index ? num : '$' + num;
  }

  function formatChange(value, index) {
    if (value == null || !isFinite(value)) return '\u2014';
    var rounded = Number(value.toFixed(2));
    if (rounded === 0) return index ? formatAbs(0, 2) : '$0.00';
    var sign = rounded > 0 ? '+' : '\u2212';
    var num = formatAbs(rounded, 2);
    return index ? sign + num : sign + '$' + num;
  }

  function direction(value) {
    if (value == null || !isFinite(value)) return 'none';
    var rounded = Number(value.toFixed(2));
    if (rounded > 0) return 'up';
    if (rounded < 0) return 'down';
    return 'flat';
  }

  function yahooSpark(symbols, range, interval) {
    var list = symbols.map(function (s) { return encodeURIComponent(s); }).join(',');
    return 'https://query1.finance.yahoo.com/v7/finance/spark?symbols=' + list +
      '&range=' + range + '&interval=' + interval;
  }

  function yahooChart(symbol) {
    return 'https://query1.finance.yahoo.com/v8/finance/chart/' +
      encodeURIComponent(symbol) + '?interval=1d&range=5d';
  }

  function proxyUrls(yahoo, now) {
    var cb = (now == null ? Date.now() : now).toString(36);
    // cors.dev answers browser fetch. allorigins is only a backup; some browsers never finish it.
    return [
      'https://proxy.cors.dev/' + yahoo,
      'https://api.allorigins.win/raw?disableCache=true&cb=' + cb + '&url=' + encodeURIComponent(yahoo)
    ];
  }

  return {
    MAX_SYMBOLS: MAX_SYMBOLS,
    CRYPTO_RESERVED: CRYPTO_RESERVED,
    MAX_STOCKS: MAX_STOCKS,
    PRELOAD: PRELOAD,
    sortKey: sortKey,
    resolveInput: resolveInput,
    labelFor: labelFor,
    normalizeItem: normalizeItem,
    sections: sections,
    addDecision: addDecision,
    messageFor: messageFor,
    marketStatus: marketStatus,
    formatAsOf: formatAsOf,
    previousSessionClose: previousSessionClose,
    changeOver24h: changeOver24h,
    parseQuoteBlock: parseQuoteBlock,
    quoteFor: quoteFor,
    indexSpark: indexSpark,
    instrumentKind: instrumentKind,
    formatPrice: formatPrice,
    formatChange: formatChange,
    direction: direction,
    yahooSpark: yahooSpark,
    yahooChart: yahooChart,
    proxyUrls: proxyUrls
  };
});
