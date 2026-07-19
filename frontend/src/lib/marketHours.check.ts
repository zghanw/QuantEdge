// Self-check for session/holiday logic. Run: node src/lib/marketHours.check.ts
// (never imported by the app, so it stays out of the bundle)
import { getMarketStatus } from './marketHours.ts';
import type { Exchange } from '../config/exchanges';

const assert = {
    strictEqual<T>(actual: T, expected: T) {
        if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`);
    },
};

const nyse: Exchange = {
    id: 'nyse', name: 'NYSE', shortName: 'NYSE', city: 'New York', country: 'US',
    lat: 40.71, lng: -74.01, tier: 'mega', region: 'AMER', tz: 'America/New_York',
    open: '09:30', close: '16:00',
    holidays: ['2026-11-26'], earlyCloses: { '2026-11-27': '13:00' },
};
const jpx: Exchange = {
    id: 'jpx', name: 'JPX', shortName: 'JPX', city: 'Tokyo', country: 'JP',
    lat: 35.68, lng: 139.77, tier: 'mega', region: 'APAC', tz: 'Asia/Tokyo',
    open: '09:00', close: '15:30', lunch: ['11:30', '12:30'],
};

// Thanksgiving: Thursday 10:00 ET but a listed holiday
let st = getMarketStatus(nyse, new Date('2026-11-26T15:00:00Z'));
assert.strictEqual(st.state, 'closed');
assert.strictEqual(st.holiday, true);

// Day after Thanksgiving: 11:00 ET, open, early 13:00 close advertised
st = getMarketStatus(nyse, new Date('2026-11-27T16:00:00Z'));
assert.strictEqual(st.state, 'open');
assert.strictEqual(st.closeToday, '13:00');

// Same day 13:30 ET: past the early close
st = getMarketStatus(nyse, new Date('2026-11-27T18:30:00Z'));
assert.strictEqual(st.state, 'closed');

// Ordinary Monday 10:30 EDT: open, no early close
st = getMarketStatus(nyse, new Date('2026-07-13T14:30:00Z'));
assert.strictEqual(st.state, 'open');
assert.strictEqual(st.closeToday, undefined);

// Sunday: closed, not a holiday
st = getMarketStatus(nyse, new Date('2026-07-12T15:00:00Z'));
assert.strictEqual(st.state, 'closed');
assert.strictEqual(st.holiday, false);

// Tokyo 11:45 on a weekday: lunch break
st = getMarketStatus(jpx, new Date('2026-07-13T02:45:00Z'));
assert.strictEqual(st.state, 'lunch');

// Countdowns: NYSE Monday 10:30 EDT -> closes in 5h30m; 08:00 EDT -> opens in 1h30m
st = getMarketStatus(nyse, new Date('2026-07-13T14:30:00Z'));
assert.strictEqual(st.closesInMin, 330);
st = getMarketStatus(nyse, new Date('2026-07-13T12:00:00Z'));
assert.strictEqual(st.opensInMin, 90);
assert.strictEqual(st.state, 'closed');

console.log('marketHours: all checks passed.');
