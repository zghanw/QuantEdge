import type { Exchange } from '../config/exchanges';

export interface MarketStatus {
    state: 'open' | 'lunch' | 'closed';
    localTime: string;   // "14:32"
    localDay: string;    // "Mon"
    holiday: boolean;    // closed for a listed market holiday
    closeToday?: string; // set only when today closes early
}

const DAY_NUM: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

export function getMarketStatus(ex: Exchange, now: Date = new Date()): MarketStatus {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: ex.tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';

    const day = DAY_NUM[get('weekday')] ?? 0;
    const hour = Number(get('hour')) % 24; // some engines emit "24" at midnight
    const minute = get('minute');
    const minutes = hour * 60 + Number(minute);
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;

    const holiday = ex.holidays?.includes(dateStr) ?? false;
    const effectiveClose = ex.earlyCloses?.[dateStr] ?? ex.close;

    const tradingDays = ex.days ?? [1, 2, 3, 4, 5];
    let state: MarketStatus['state'] = 'closed';
    if (!holiday && tradingDays.includes(day) && minutes >= toMin(ex.open) && minutes < toMin(effectiveClose)) {
        state = 'open';
        if (ex.lunch && minutes >= toMin(ex.lunch[0]) && minutes < toMin(ex.lunch[1])) {
            state = 'lunch';
        }
    }

    return {
        state,
        localTime: `${String(hour).padStart(2, '0')}:${minute}`,
        localDay: get('weekday'),
        holiday,
        closeToday: effectiveClose !== ex.close ? effectiveClose : undefined,
    };
}
