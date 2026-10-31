'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SW = require('../quote.js');

test('preload splits into stocks and crypto and sorts by display symbol', () => {
  const { stocks, crypto } = SW.sections(SW.PRELOAD);
  assert.deepEqual(stocks.map((item) => SW.sortKey(item.symbol)), [
    'AAPL', 'AMD', 'APH', 'AVGO', 'CAPR', 'COMP', 'DJI', 'IXIC',
    'NVDA', 'SPCX', 'TMDX', 'V', 'VRT', 'VZ'
  ]);
  assert.deepEqual(crypto.map((item) => SW.sortKey(item.symbol)), ['BTC', 'ETH']);
  assert.equal(stocks.length + crypto.length, 16);
  assert.ok(stocks.length <= SW.MAX_STOCKS);
});

test('indexes and crypto sort without the caret or -USD', () => {
  assert.equal(SW.sortKey('^DJI'), 'DJI');
  assert.equal(SW.sortKey('^IXIC'), 'IXIC');
  assert.equal(SW.sortKey('BTC-USD'), 'BTC');
  assert.equal(SW.sortKey('ETH-USD'), 'ETH');
  assert.equal(SW.sortKey('aapl'), 'AAPL');
});

test('friendly names resolve to canonical symbols', () => {
  assert.deepEqual(SW.resolveInput('dow'), {
    ok: true, symbol: '^DJI', label: 'Dow', crypto: false, locked: true
  });
  assert.equal(SW.resolveInput('Nasdaq Composite').symbol, '^IXIC');
  assert.equal(SW.resolveInput('bitcoin').crypto, true);
  assert.equal(SW.resolveInput('ETH').symbol, 'ETH-USD');
  assert.equal(SW.resolveInput('aapl').symbol, 'AAPL');
  assert.equal(SW.resolveInput('aapl').crypto, false);
  assert.equal(SW.resolveInput('sol-usd').crypto, true);
  assert.equal(SW.resolveInput('sol-usd').locked, false);
  assert.equal(SW.resolveInput('  ').ok, false);
  assert.equal(SW.resolveInput('hello!').ok, false);
});

test('stocks cannot use the five reserved crypto spots', () => {
  const stocks = [];
  for (let i = 0; i < 25; i++) stocks.push({ symbol: 'S' + i, crypto: false });
  assert.equal(SW.addDecision(stocks, { symbol: 'NEW', crypto: false }).reason, 'stocks-full');
  assert.equal(SW.addDecision(stocks, { symbol: 'SOL-USD', crypto: true }).ok, true);
  const full = stocks.concat([
    { symbol: 'BTC-USD', crypto: true },
    { symbol: 'ETH-USD', crypto: true },
    { symbol: 'SOL-USD', crypto: true },
    { symbol: 'DOGE-USD', crypto: true },
    { symbol: 'XRP-USD', crypto: true }
  ]);
  assert.equal(full.length, 30);
  assert.equal(SW.addDecision(full, { symbol: 'ADA-USD', crypto: true }).reason, 'full');
  assert.equal(SW.addDecision(stocks, { symbol: 'S0', crypto: false }).reason, 'duplicate');
  const roomy = stocks.slice(0, 20);
  assert.equal(SW.addDecision(roomy, { symbol: 'ZZ', crypto: false }).ok, true);
});

test('crypto stays in its own section even when the symbol sorts earlier', () => {
  const split = SW.sections([
    { symbol: 'BTC-USD', crypto: true },
    { symbol: 'AAPL', crypto: false },
    { symbol: '^DJI', label: 'Dow', crypto: false },
    { symbol: 'ETH-USD', crypto: true }
  ]);
  assert.deepEqual(split.stocks.map((item) => item.symbol), ['AAPL', '^DJI']);
  assert.deepEqual(split.crypto.map((item) => item.symbol), ['BTC-USD', 'ETH-USD']);
});

test('dollar change uses the previous session close, not today', () => {
  const block = {
    meta: {
      symbol: 'AMD',
      instrumentType: 'EQUITY',
      regularMarketPrice: 504.8,
      regularMarketTime: Date.parse('2026-10-30T20:00:00Z') / 1000,
      exchangeTimezoneName: 'America/New_York'
    },
    timestamp: [
      Date.parse('2026-10-29T13:30:00Z') / 1000,
      Date.parse('2026-10-30T13:30:00Z') / 1000
    ],
    indicators: { quote: [{ close: [566.42, null] }] }
  };
  const parsed = SW.parseQuoteBlock(block);
  assert.equal(parsed.prevClose, 566.42);
  assert.ok(Math.abs(parsed.change - (504.8 - 566.42)) < 0.001);
  assert.equal(parsed.index, false);

  const index = {
    meta: {
      symbol: '^DJI',
      instrumentType: 'INDEX',
      regularMarketPrice: 51770.31,
      regularMarketTime: Date.parse('2026-10-30T20:47:00Z') / 1000,
      exchangeTimezoneName: 'America/New_York'
    },
    timestamp: [
      Date.parse('2026-10-29T13:30:00Z') / 1000,
      Date.parse('2026-10-30T13:30:00Z') / 1000
    ],
    indicators: { quote: [{ close: [52342.56, 51770.31] }] }
  };
  const dow = SW.parseQuoteBlock(index);
  assert.equal(dow.prevClose, 52342.56);
  assert.ok(Math.abs(dow.change - (51770.31 - 52342.56)) < 0.001);
  assert.equal(dow.index, true);
});

test('crypto change prefers the price 24 hours ago', () => {
  const now = 1_700_000_000;
  const daily = {
    meta: {
      symbol: 'BTC-USD',
      instrumentType: 'CRYPTOCURRENCY',
      regularMarketPrice: 110,
      regularMarketTime: now,
      exchangeTimezoneName: 'UTC'
    },
    timestamp: [now - 172800, now],
    indicators: { quote: [{ close: [80, 110] }] }
  };
  const hourly = {
    meta: {
      symbol: 'BTC-USD',
      instrumentType: 'CRYPTOCURRENCY',
      regularMarketPrice: 112,
      regularMarketTime: now,
      exchangeTimezoneName: 'UTC'
    },
    timestamp: [now - 86400, now - 3600],
    indicators: { quote: [{ close: [100, 111] }] }
  };
  const quote = SW.quoteFor({ symbol: 'BTC-USD', crypto: true }, daily, hourly);
  assert.equal(quote.price, 112);
  assert.equal(quote.change, 12);
  assert.equal(quote.crypto, true);
  assert.equal(quote.index, false);

  const fallback = SW.quoteFor({ symbol: 'BTC-USD', crypto: true }, daily, null);
  assert.equal(fallback.price, 110);
  assert.equal(fallback.change, 30);
});

test('24 hour change ignores a bar that is too far away', () => {
  const now = 1_700_000_000;
  const change = SW.changeOver24h({
    meta: { regularMarketPrice: 10, regularMarketTime: now },
    timestamp: [now - 86400 * 3],
    indicators: { quote: [{ close: [4] }] }
  });
  assert.equal(change, null);
});

test('prices never use a percent sign', () => {
  const samples = [
    SW.formatPrice(504.8, false),
    SW.formatPrice(51770.31, true),
    SW.formatPrice(0.1842, false),
    SW.formatChange(-61.62, false),
    SW.formatChange(-572.25, true),
    SW.formatChange(3.5, false),
    SW.formatChange(0, true),
    SW.formatChange(null, false),
    SW.messageFor('stocks-full'),
    SW.messageFor('duplicate', 'BTC-USD'),
    SW.formatAsOf(new Date('2026-10-30T20:00:00Z'))
  ];
  samples.forEach((text) => {
    assert.equal(text.includes('%'), false, text);
    assert.equal(/percent/i.test(text), false, text);
  });
  assert.equal(SW.formatPrice(504.8, false), '$504.80');
  assert.equal(SW.formatPrice(51770.31, true), '51,770.31');
  assert.equal(SW.formatChange(-61.62, false), '\u2212$61.62');
  assert.equal(SW.formatChange(-572.25, true), '\u2212572.25');
  assert.equal(SW.formatChange(3.5, false), '+$3.50');
  assert.equal(SW.formatChange(-0.25, false), '\u2212$0.25');
  assert.equal(SW.formatPrice(0.1842, false), '$0.1842');
  assert.equal(SW.direction(-0.004), 'flat');
  assert.equal(SW.direction(-61.62), 'down');
  assert.equal(SW.direction(3.5), 'up');
  assert.equal(SW.direction(0), 'flat');
});

test('market hours follow Eastern time, weekends, holidays, and early closes', () => {
  assert.equal(SW.marketStatus(new Date('2026-10-30T19:00:00Z')).open, true);
  assert.equal(SW.marketStatus(new Date('2026-10-30T20:00:00Z')).open, false);
  assert.equal(SW.marketStatus(new Date('2026-10-30T13:30:00Z')).open, true);
  assert.equal(SW.marketStatus(new Date('2026-10-30T13:29:00Z')).open, false);
  assert.equal(SW.marketStatus(new Date('2026-10-31T16:00:00Z')).open, false);
  assert.equal(SW.marketStatus(new Date('2026-11-26T15:00:00Z')).open, false);
  assert.equal(SW.marketStatus(new Date('2026-11-27T17:30:00Z')).open, true);
  assert.equal(SW.marketStatus(new Date('2026-11-27T18:00:00Z')).open, false);
});

test('yahoo urls encode indexes and the cors proxy keeps the query', () => {
  const yahoo = SW.yahooSpark(['AAPL', '^DJI', 'BTC-USD'], '15d', '1d');
  assert.match(yahoo, /symbols=AAPL,%5EDJI,BTC-USD/);
  assert.match(yahoo, /interval=1d/);
  const urls = SW.proxyUrls(yahoo, 36);
  assert.match(urls[0], /^https:\/\/proxy\.cors\.dev\/https:\/\/query1\.finance\.yahoo\.com\//);
  assert.match(urls[1], /^https:\/\/api\.allorigins\.win\/raw\?disableCache=true&cb=/);
  assert.match(urls[1], /url=/);
  assert.match(SW.yahooChart('^IXIC'), /chart\/%5EIXIC/);
});

test('a bad symbol does not have to be present for the others to parse', () => {
  const map = SW.indexSpark({
    spark: {
      result: [
        {
          symbol: 'AAPL',
          response: [{
            meta: {
              symbol: 'AAPL',
              instrumentType: 'EQUITY',
              regularMarketPrice: 10,
              regularMarketTime: 1_700_000_000,
              exchangeTimezoneName: 'America/New_York'
            },
            timestamp: [],
            indicators: { quote: [{ close: [] }] }
          }]
        }
      ]
    }
  });
  assert.equal(map.AAPL.meta.regularMarketPrice, 10);
  assert.equal(map.NOTREAL, undefined);
  assert.equal(SW.instrumentKind({
    chart: { result: [{ meta: { instrumentType: 'CRYPTOCURRENCY' } }] }
  }), 'crypto');
  assert.equal(SW.instrumentKind({ chart: { result: null, error: { code: 'Not Found' } } }), 'unknown');
});
