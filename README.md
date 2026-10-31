# Stock Watch

A phone-first watchlist. Each name shows the latest price and how many dollars (or index points) it has moved since the previous close. No percentages, no account, and no API key.

Live site: https://condo32819-ops.github.io/stock-watch/

Dow, Nasdaq, and the S&P 500 are at the top, in that order. Stocks follow, A to Z. Crypto is in its own list underneath, also A to Z. Bitcoin and Ether start in that list. The phone keeps the list. Stocks stop at 25 names so at least five spots stay open for crypto, inside a 30-name cap.

You can type a ticker, or Dow, Nasdaq, S&P, Bitcoin, or Ether.

## Add it to an iPhone home screen

1. Open the live site in Safari.
2. Tap the Share button (the square with an arrow).
3. Tap **Add to Home Screen**.
4. Tap **Add**.

It also works as a normal Safari tab. Pull down from the top, or tap Refresh. Prices update about once a minute while the page is open.

## Prices

Quotes come from Yahoo Finance’s public chart feed, requested in the browser through the free [cors.dev](https://cors.dev/) proxy (allorigins is only a backup). That is what lets a static GitHub Pages site read the feed. A key is not required. Nothing is stored on a server.

The change for a stock or index is the current price minus the previous trading day’s close. Index moves are shown as points, without a dollar sign. Crypto uses the price about 24 hours earlier. If a symbol fails, that row shows —.

## Develop

Plain HTML, CSS, and JavaScript. There is no build step.

```bash
python3 -m http.server 8765
node --test test/quote.test.js
```
