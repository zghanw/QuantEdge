// Shared watchlist storage — Dashboard state and the World Map "Track ETF"
// action both go through here so a ticker added on the map appears on the
// dashboard after navigation.
const KEY = 'quantily.tickers';
const LEGACY_KEY = 'quantedge.tickers'; // pre-rebrand watchlists

export function loadTickers(): string[] {
    try {
        return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '[]');
    } catch {
        return [];
    }
}

export function saveTickers(tickers: string[]) {
    localStorage.setItem(KEY, JSON.stringify(tickers));
}

export function addTicker(ticker: string): string[] {
    const tickers = [...new Set([...loadTickers(), ticker.toUpperCase()])];
    saveTickers(tickers);
    return tickers;
}
