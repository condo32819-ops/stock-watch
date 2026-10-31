'use strict';

(function () {
  var SW = StockWatch;
  var LIST_KEY = 'stock-watch-v1';
  var QUOTE_KEY = 'stock-watch-quotes-v1';

  var items = [];
  var quotes = {};
  var haveQuotes = false;
  var refreshing = false;
  var refreshAgain = false;
  var adding = false;
  var lastUpdated = null;
  var bannerText = '';

  var asofEl = document.getElementById('asof');
  var marketEl = document.getElementById('market');
  var bannerEl = document.getElementById('banner');
  var pullEl = document.getElementById('pull');
  var refreshBtn = document.getElementById('refresh');
  var indexesEl = document.getElementById('indexes');
  var stocksEl = document.getElementById('stocks');
  var cryptoEl = document.getElementById('crypto');
  var slotsEl = document.getElementById('slots');
  var formMsg = document.getElementById('form-msg');
  var slotInputs = [];
  var capacityEl = document.getElementById('capacity');

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function freshList() {
    return SW.PRELOAD.map(function (item) { return Object.assign({}, item); });
  }

  function loadItems() {
    var items;
    var saved = false;
    try {
      var raw = localStorage.getItem(LIST_KEY);
      if (raw == null) {
        items = freshList();
      } else {
        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.items)) items = freshList();
        else {
          saved = true;
          items = data.items.map(SW.normalizeItem).filter(Boolean);
        }
      }
    } catch (err) {
      items = freshList();
    }
    try {
      if (localStorage.getItem('stock-watch-spx') !== '1') {
        var hasSpx = items.some(function (item) { return item.symbol === '^GSPC'; });
        if (!hasSpx) items.push({ symbol: '^GSPC', label: 'S&P', crypto: false });
        localStorage.setItem('stock-watch-spx', '1');
        if (saved) localStorage.setItem(LIST_KEY, JSON.stringify({ items: items }));
      }
    } catch (err) {}
    return items;
  }

  function saveItems() {
    localStorage.setItem(LIST_KEY, JSON.stringify({ items: items }));
  }

  function loadQuotes() {
    try {
      var raw = localStorage.getItem(QUOTE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || !data.quotes) return;
      quotes = data.quotes;
      haveQuotes = Object.keys(quotes).length > 0;
      if (data.updatedAt) lastUpdated = new Date(data.updatedAt);
    } catch (err) {
      quotes = {};
    }
  }

  function saveQuotes() {
    var stored = {};
    Object.keys(quotes).forEach(function (symbol) {
      var quote = quotes[symbol];
      if (quote && isFinite(quote.price)) stored[symbol] = quote;
    });
    localStorage.setItem(QUOTE_KEY, JSON.stringify({
      updatedAt: lastUpdated ? lastUpdated.getTime() : null,
      quotes: stored
    }));
  }

  function renderMarket() {
    var open = SW.marketStatus(new Date()).open;
    marketEl.textContent = open ? 'Market open' : 'Market closed';
    marketEl.className = open ? 'market open' : 'market';
  }

  function renderStatus() {
    asofEl.textContent = lastUpdated ? SW.formatAsOf(lastUpdated) : 'As of \u2014';
    if (bannerText) {
      bannerEl.hidden = false;
      bannerEl.textContent = bannerText;
    } else {
      bannerEl.hidden = true;
      bannerEl.textContent = '';
    }
    renderMarket();
    showSlots();
    var split = SW.sections(items);
    capacityEl.textContent = split.indexes.length + ' indexes · ' +
      split.stocks.length + ' stocks · ' + split.crypto.length + ' crypto · 30 max';
  }

  function placeholder() {
    return refreshing && !haveQuotes ? '\u2026' : '\u2014';
  }

  function renderRow(item) {
    var quote = quotes[item.symbol];
    var index = quote ? quote.index : item.symbol.charAt(0) === '^';
    var price = quote && isFinite(quote.price) ? SW.formatPrice(quote.price, index) : placeholder();
    var change = quote && quote.change != null ? SW.formatChange(quote.change, index) : placeholder();
    var dir = quote && quote.change != null ? SW.direction(quote.change) : 'none';
    var shown = SW.sortKey(item.symbol);

    var row = el('article', 'row');
    var name = el('div', 'name');
    name.appendChild(el('div', 'sym', shown));
    if (item.label && item.label !== shown) name.appendChild(el('div', 'label', item.label));

    var figures = el('div', 'figures ' + dir);
    figures.appendChild(el('div', 'price', price));
    figures.appendChild(el('div', 'change', change));

    var remove = el('button', 'remove', '\u00d7');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove ' + shown);
    remove.addEventListener('click', function () {
      items = items.filter(function (entry) { return entry.symbol !== item.symbol; });
      delete quotes[item.symbol];
      saveItems();
      saveQuotes();
      renderLists();
      renderStatus();
    });

    row.appendChild(name);
    row.appendChild(figures);
    row.appendChild(remove);
    return row;
  }

  function renderList(container, rows, emptyText) {
    container.replaceChildren();
    if (!rows.length) {
      container.appendChild(el('p', 'empty', emptyText));
      return;
    }
    rows.forEach(function (item) { container.appendChild(renderRow(item)); });
  }

  function renderLists() {
    var split = SW.sections(items);
    renderList(indexesEl, split.indexes, 'No indexes yet.');
    renderList(stocksEl, split.stocks, 'No stocks yet.');
    renderList(cryptoEl, split.crypto, 'No crypto yet.');
  }

  function setRefreshing(on) {
    refreshBtn.disabled = on;
    refreshBtn.textContent = on ? 'Refreshing\u2026' : 'Refresh';
  }

  async function fetchJson(yahoo) {
    var urls = SW.proxyUrls(yahoo);
    urls.splice(1, 0, SW.proxyUrls(yahoo)[0]);
    var lastError = null;
    for (var i = 0; i < urls.length; i++) {
      try {
        var res = await fetch(urls[i], {
          cache: 'no-store',
          signal: AbortSignal.timeout(15000)
        });
        if (res.status === 429) {
          await new Promise(function (resolve) { setTimeout(resolve, 700); });
          throw new Error('HTTP 429');
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();
        if (!data || typeof data !== 'object') throw new Error('Bad response');
        return data;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Request failed');
  }

  async function fetchSpark(symbols, range, interval) {
    if (!symbols.length) return {};
    var data = await fetchJson(SW.yahooSpark(symbols, range, interval));
    if (!data.spark) throw new Error('Unexpected quote response');
    var map = SW.indexSpark(data);
    if (!Object.keys(map).length) throw new Error('No quotes');
    return map;
  }

  async function probeKind(symbol) {
    try {
      var data = await fetchJson(SW.yahooChart(symbol));
      return SW.instrumentKind(data);
    } catch (err) {
      return 'unknown';
    }
  }

  async function resolveForAdd(raw) {
    var resolved = SW.resolveInput(raw);
    if (!resolved.ok || resolved.locked) return resolved;
    var kind = await probeKind(resolved.symbol);
    if (kind === 'crypto') return Object.assign({}, resolved, { crypto: true });
    if (kind === 'other') return Object.assign({}, resolved, { crypto: false });
    if (resolved.symbol.slice(-4) !== '-USD' && /^[A-Z]{2,10}$/.test(resolved.symbol)) {
      var alt = resolved.symbol + '-USD';
      if ((await probeKind(alt)) === 'crypto') {
        return {
          ok: true,
          symbol: alt,
          label: SW.labelFor(alt),
          crypto: true,
          locked: false
        };
      }
    }
    return resolved;
  }

  async function refresh() {
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    setRefreshing(true);
    var symbols = items.map(function (item) { return item.symbol; });
    var cryptoSymbols = items.filter(function (item) { return item.crypto; }).map(function (item) {
      return item.symbol;
    });
    try {
      var daily = symbols.length ? await fetchSpark(symbols, '15d', '1d') : {};
      var hourly = {};
      if (cryptoSymbols.length) {
        try {
          hourly = await fetchSpark(cryptoSymbols, '2d', '1h');
        } catch (err) {
          hourly = {};
        }
      }
      var next = {};
      var changed = false;
      items.forEach(function (item) {
        var quote = SW.quoteFor(item, daily[item.symbol], hourly[item.symbol]);
        next[item.symbol] = quote;
        if (quote && quote.crypto && !item.crypto) {
          item.crypto = true;
          if (!item.label) item.label = SW.labelFor(item.symbol);
          changed = true;
        }
      });
      quotes = next;
      haveQuotes = true;
      lastUpdated = new Date();
      bannerText = '';
      if (changed) saveItems();
      saveQuotes();
    } catch (err) {
      bannerText = haveQuotes
        ? 'Couldn\u2019t refresh. Showing the last prices.'
        : 'Couldn\u2019t refresh.';
    } finally {
      refreshing = false;
      setRefreshing(false);
      renderLists();
      renderStatus();
      if (refreshAgain) {
        refreshAgain = false;
        refresh();
      }
    }
  }

  function showSlots() {
    var n = SW.openSlots(items.length);
    var heading = document.getElementById('add-h');
    var note = document.querySelector('#add-slots .hint');
    if (heading) heading.hidden = n === 0;
    if (note) note.hidden = n === 0;
    slotInputs.forEach(function (field, i) {
      var hide = i >= n;
      field.hidden = hide;
      if (hide) field.value = '';
    });
  }

  async function submitSlot(field) {
    var raw = field.value;
    if (adding || !raw.trim()) return;
    var quick = SW.resolveInput(raw);
    formMsg.classList.remove('bad');
    if (!quick.ok) {
      formMsg.textContent = SW.messageFor(quick.reason);
      formMsg.classList.add('bad');
      return;
    }
    var early = SW.addDecision(items, quick);
    if (!early.ok && (quick.locked || early.reason === 'duplicate' || early.reason === 'full')) {
      formMsg.textContent = SW.messageFor(early.reason, quick.symbol);
      formMsg.classList.add('bad');
      return;
    }
    adding = true;
    field.disabled = true;
    if (!quick.locked) formMsg.textContent = 'Checking\u2026';
    try {
      var resolved = await resolveForAdd(raw);
      if (!resolved.ok) {
        formMsg.textContent = SW.messageFor(resolved.reason);
        formMsg.classList.add('bad');
        return;
      }
      var decision = SW.addDecision(items, resolved);
      if (!decision.ok) {
        formMsg.textContent = SW.messageFor(decision.reason, resolved.symbol);
        formMsg.classList.add('bad');
        return;
      }
      items.push({
        symbol: resolved.symbol,
        label: resolved.label,
        crypto: resolved.crypto
      });
      saveItems();
      field.value = '';
      formMsg.textContent = '';
      renderLists();
      renderStatus();
      refresh();
    } finally {
      adding = false;
      field.disabled = false;
      showSlots();
    }
  }

  function buildSlots() {
    slotsEl.replaceChildren();
    for (var i = 0; i < SW.OPEN_SLOTS; i++) {
      var field = el('input', 'slot');
      field.type = 'text';
      field.maxLength = 24;
      field.placeholder = 'Symbol';
      field.enterKeyHint = 'done';
      field.autocapitalize = 'characters';
      field.autocorrect = 'off';
      field.spellcheck = false;
      field.autocomplete = 'off';
      field.setAttribute('aria-label', 'Blank line ' + (i + 1) + ' for a symbol');
      field.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitSlot(event.currentTarget);
        }
      });
      field.addEventListener('change', function (event) {
        submitSlot(event.currentTarget);
      });
      slotsEl.appendChild(field);
      slotInputs.push(field);
    }
  }

  buildSlots();

  refreshBtn.addEventListener('click', function () { refresh(); });

  var pullStart = 0;
  var pullDy = 0;
  var pulling = false;
  document.addEventListener('touchstart', function (event) {
    if (window.scrollY > 8) return;
    pullStart = event.touches[0].clientY;
    pullDy = 0;
    pulling = true;
  }, { passive: true });
  document.addEventListener('touchmove', function (event) {
    if (!pulling) return;
    pullDy = event.touches[0].clientY - pullStart;
    if (pullDy < 24) {
      pullEl.hidden = true;
      return;
    }
    pullEl.hidden = false;
    pullEl.textContent = pullDy > 72 ? 'Release to refresh' : 'Pull to refresh';
  }, { passive: true });
  document.addEventListener('touchend', function () {
    if (!pulling) return;
    var should = pullDy > 72;
    pulling = false;
    pullDy = 0;
    pullEl.hidden = true;
    if (should) refresh();
  });

  document.addEventListener('visibilitychange', function () {
    renderMarket();
    if (document.visibilityState === 'visible') {
      var stale = !lastUpdated || (Date.now() - lastUpdated.getTime() > 30000);
      if (stale) refresh();
    }
  });

  setInterval(function () {
    renderMarket();
    if (document.visibilityState === 'visible') refresh();
  }, 60000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }

  items = loadItems();
  loadQuotes();
  renderLists();
  renderStatus();
  refresh();
})();
