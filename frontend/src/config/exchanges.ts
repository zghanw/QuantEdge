// Hand-curated from public sources (Wikipedia "List of stock exchanges" +
// official exchange sites, checked 2026-07). Facts only — not derived from any
// AGPL codebase. Regular sessions; holidays modeled for US markets only.
// `etf` is a US-listed proxy ETF so the existing Polygon pipeline can track it.

export type Region = 'APAC' | 'EMEA' | 'AMER';

export interface Exchange {
    id: string;
    name: string;
    shortName: string;
    city: string;
    country: string;
    lat: number;
    lng: number;
    tier: 'mega' | 'major' | 'regional';
    region: Region;
    tz: string;              // IANA timezone
    open: string;            // "HH:MM" local
    close: string;
    lunch?: [string, string];
    days?: number[];         // JS getDay() values; default Mon-Fri
    holidays?: string[];     // local "YYYY-MM-DD" full closures
    earlyCloses?: Record<string, string>;  // local date -> early "HH:MM" close
    labelOrient?: 'top' | 'bottom' | 'right';  // globe label position vs marker
    etf?: string;
    etfName?: string;
}

// NYSE/NASDAQ full-day closures, from the published NYSE holiday calendar.
// ponytail: hand-keyed 2026-27; extend yearly — broader coverage would come
// from QuantConnect Lean's market-hours dataset (Apache-2.0).
const US_MARKET_HOLIDAYS = [
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
    '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
];
const US_EARLY_CLOSES: Record<string, string> = {
    '2026-11-27': '13:00',  // day after Thanksgiving
    '2026-12-24': '13:00',  // Christmas Eve
    '2027-11-26': '13:00',
};

export const EXCHANGES: Exchange[] = [
    // Americas
    { id: 'nyse', name: 'New York Stock Exchange', shortName: 'NYSE', city: 'New York', country: 'United States', lat: 40.71, lng: -74.01, tier: 'mega', region: 'AMER', tz: 'America/New_York', open: '09:30', close: '16:00', holidays: US_MARKET_HOLIDAYS, earlyCloses: US_EARLY_CLOSES, labelOrient: 'bottom', etf: 'SPY', etfName: 'S&P 500' },
    { id: 'nasdaq', name: 'Nasdaq', shortName: 'NASDAQ', city: 'New York', country: 'United States', lat: 40.76, lng: -73.98, tier: 'mega', region: 'AMER', tz: 'America/New_York', open: '09:30', close: '16:00', holidays: US_MARKET_HOLIDAYS, earlyCloses: US_EARLY_CLOSES, labelOrient: 'top', etf: 'QQQ', etfName: 'Nasdaq-100' },
    { id: 'tsx', name: 'Toronto Stock Exchange', shortName: 'TSX', city: 'Toronto', country: 'Canada', lat: 43.65, lng: -79.38, tier: 'major', region: 'AMER', tz: 'America/Toronto', open: '09:30', close: '16:00', etf: 'EWC', etfName: 'MSCI Canada' },
    { id: 'bmv', name: 'Bolsa Mexicana de Valores', shortName: 'BMV', city: 'Mexico City', country: 'Mexico', lat: 19.43, lng: -99.13, tier: 'regional', region: 'AMER', tz: 'America/Mexico_City', open: '08:30', close: '15:00', etf: 'EWW', etfName: 'MSCI Mexico' },
    { id: 'b3', name: 'B3 (Brasil Bolsa Balcão)', shortName: 'B3', city: 'São Paulo', country: 'Brazil', lat: -23.55, lng: -46.63, tier: 'major', region: 'AMER', tz: 'America/Sao_Paulo', open: '10:00', close: '17:00', etf: 'EWZ', etfName: 'MSCI Brazil' },
    // Europe / Middle East / Africa
    { id: 'lse', name: 'London Stock Exchange', shortName: 'LSE', city: 'London', country: 'United Kingdom', lat: 51.51, lng: -0.09, tier: 'mega', region: 'EMEA', tz: 'Europe/London', open: '08:00', close: '16:30', labelOrient: 'bottom', etf: 'EWU', etfName: 'MSCI United Kingdom' },
    { id: 'euronext', name: 'Euronext', shortName: 'Euronext', city: 'Amsterdam', country: 'Netherlands', lat: 52.37, lng: 4.9, tier: 'mega', region: 'EMEA', tz: 'Europe/Amsterdam', open: '09:00', close: '17:30', labelOrient: 'top', etf: 'EZU', etfName: 'MSCI Eurozone' },
    { id: 'xetra', name: 'Deutsche Börse (Xetra)', shortName: 'Xetra', city: 'Frankfurt', country: 'Germany', lat: 50.11, lng: 8.68, tier: 'major', region: 'EMEA', tz: 'Europe/Berlin', open: '09:00', close: '17:30', etf: 'EWG', etfName: 'MSCI Germany' },
    { id: 'six', name: 'SIX Swiss Exchange', shortName: 'SIX', city: 'Zurich', country: 'Switzerland', lat: 47.37, lng: 8.54, tier: 'major', region: 'EMEA', tz: 'Europe/Zurich', open: '09:00', close: '17:30', etf: 'EWL', etfName: 'MSCI Switzerland' },
    { id: 'jse', name: 'Johannesburg Stock Exchange', shortName: 'JSE', city: 'Johannesburg', country: 'South Africa', lat: -26.2, lng: 28.05, tier: 'regional', region: 'EMEA', tz: 'Africa/Johannesburg', open: '09:00', close: '17:00', etf: 'EZA', etfName: 'MSCI South Africa' },
    { id: 'tase', name: 'Tel Aviv Stock Exchange', shortName: 'TASE', city: 'Tel Aviv', country: 'Israel', lat: 32.07, lng: 34.79, tier: 'regional', region: 'EMEA', tz: 'Asia/Jerusalem', open: '10:00', close: '17:15', days: [0, 1, 2, 3, 4], etf: 'EIS', etfName: 'MSCI Israel' },
    { id: 'tadawul', name: 'Saudi Exchange (Tadawul)', shortName: 'Tadawul', city: 'Riyadh', country: 'Saudi Arabia', lat: 24.71, lng: 46.68, tier: 'major', region: 'EMEA', tz: 'Asia/Riyadh', open: '10:00', close: '15:00', days: [0, 1, 2, 3, 4], etf: 'KSA', etfName: 'MSCI Saudi Arabia' },
    { id: 'dfm', name: 'Dubai Financial Market', shortName: 'DFM', city: 'Dubai', country: 'UAE', lat: 25.2, lng: 55.27, tier: 'regional', region: 'EMEA', tz: 'Asia/Dubai', open: '10:00', close: '15:00', etf: 'UAE', etfName: 'MSCI UAE' },
    // Asia-Pacific
    { id: 'nse', name: 'National Stock Exchange of India', shortName: 'NSE', city: 'Mumbai', country: 'India', lat: 19.06, lng: 72.86, tier: 'mega', region: 'APAC', tz: 'Asia/Kolkata', open: '09:15', close: '15:30', etf: 'INDA', etfName: 'MSCI India' },
    { id: 'sgx', name: 'Singapore Exchange', shortName: 'SGX', city: 'Singapore', country: 'Singapore', lat: 1.28, lng: 103.85, tier: 'major', region: 'APAC', tz: 'Asia/Singapore', open: '09:00', close: '17:00', etf: 'EWS', etfName: 'MSCI Singapore' },
    { id: 'set', name: 'Stock Exchange of Thailand', shortName: 'SET', city: 'Bangkok', country: 'Thailand', lat: 13.72, lng: 100.53, tier: 'regional', region: 'APAC', tz: 'Asia/Bangkok', open: '10:00', close: '16:30', lunch: ['12:30', '14:30'], etf: 'THD', etfName: 'MSCI Thailand' },
    { id: 'idx', name: 'Indonesia Stock Exchange', shortName: 'IDX', city: 'Jakarta', country: 'Indonesia', lat: -6.22, lng: 106.83, tier: 'regional', region: 'APAC', tz: 'Asia/Jakarta', open: '09:00', close: '15:50', lunch: ['11:30', '13:30'], etf: 'EIDO', etfName: 'MSCI Indonesia' },
    { id: 'hkex', name: 'Hong Kong Stock Exchange', shortName: 'HKEX', city: 'Hong Kong', country: 'Hong Kong', lat: 22.28, lng: 114.16, tier: 'mega', region: 'APAC', tz: 'Asia/Hong_Kong', open: '09:30', close: '16:00', lunch: ['12:00', '13:00'], etf: 'EWH', etfName: 'MSCI Hong Kong' },
    { id: 'sse', name: 'Shanghai Stock Exchange', shortName: 'SSE', city: 'Shanghai', country: 'China', lat: 31.23, lng: 121.47, tier: 'mega', region: 'APAC', tz: 'Asia/Shanghai', open: '09:30', close: '15:00', lunch: ['11:30', '13:00'], etf: 'MCHI', etfName: 'MSCI China' },
    { id: 'szse', name: 'Shenzhen Stock Exchange', shortName: 'SZSE', city: 'Shenzhen', country: 'China', lat: 22.54, lng: 114.06, tier: 'major', region: 'APAC', tz: 'Asia/Shanghai', open: '09:30', close: '15:00', lunch: ['11:30', '13:00'], etf: 'MCHI', etfName: 'MSCI China' },
    { id: 'twse', name: 'Taiwan Stock Exchange', shortName: 'TWSE', city: 'Taipei', country: 'Taiwan', lat: 25.03, lng: 121.56, tier: 'major', region: 'APAC', tz: 'Asia/Taipei', open: '09:00', close: '13:30', etf: 'EWT', etfName: 'MSCI Taiwan' },
    { id: 'krx', name: 'Korea Exchange', shortName: 'KRX', city: 'Seoul', country: 'South Korea', lat: 37.57, lng: 126.98, tier: 'major', region: 'APAC', tz: 'Asia/Seoul', open: '09:00', close: '15:30', etf: 'EWY', etfName: 'MSCI South Korea' },
    { id: 'jpx', name: 'Japan Exchange Group (TSE)', shortName: 'JPX', city: 'Tokyo', country: 'Japan', lat: 35.68, lng: 139.77, tier: 'mega', region: 'APAC', tz: 'Asia/Tokyo', open: '09:00', close: '15:30', lunch: ['11:30', '12:30'], etf: 'EWJ', etfName: 'MSCI Japan' },
    { id: 'asx', name: 'Australian Securities Exchange', shortName: 'ASX', city: 'Sydney', country: 'Australia', lat: -33.87, lng: 151.21, tier: 'major', region: 'APAC', tz: 'Australia/Sydney', open: '10:00', close: '16:00', etf: 'EWA', etfName: 'MSCI Australia' },
    { id: 'nzx', name: 'New Zealand Exchange', shortName: 'NZX', city: 'Wellington', country: 'New Zealand', lat: -41.29, lng: 174.78, tier: 'regional', region: 'APAC', tz: 'Pacific/Auckland', open: '10:00', close: '16:45', etf: 'ENZL', etfName: 'MSCI New Zealand' },
];
