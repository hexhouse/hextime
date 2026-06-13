import { supabase } from './supabase.js'

// Caps — keyed by `${userId}::${year}-Q${quarter}`
export const caps = $state({});

export async function loadCaps(userId = null) {
	let query = supabase.from('contractor_quarterly_caps').select('*');
	if (userId) query = query.eq('user_id', userId);
	const { data } = await query;
	if (data) {
		for (const row of data) {
			caps[`${row.user_id}::${row.year}-Q${row.quarter}`] = row.hours_cap != null ? parseFloat(row.hours_cap) : null;
		}
	}
}

export async function saveCap(userId, year, quarter, val) {
	const hours_cap = val === '' || val == null ? null : parseFloat(val);
	caps[`${userId}::${year}-Q${quarter}`] = hours_cap;
	await supabase.from('contractor_quarterly_caps').upsert(
		{ user_id: userId, year, quarter, hours_cap },
		{ onConflict: 'user_id,year,quarter' }
	);
}

export function getCapForDate(userId, dateStr) {
	const { year, quarter } = getQuarterInfo(dateStr);
	return caps[`${userId}::${year}-Q${quarter}`] ?? null;
}

export const quarterLabels = {
	1: 'Q1  Mar 15 – Jun 14',
	2: 'Q2  Jun 15 – Sep 14',
	3: 'Q3  Sep 15 – Dec 14',
	4: 'Q4  Dec 15 – Mar 14',
};

export const rates = $state({});

export async function loadRates() {
	const { data } = await supabase.from('quarterly_rates').select('*');
	if (data) {
		for (const row of data) {
			rates[`${row.year}-Q${row.quarter}`] = row.rate ? parseFloat(row.rate) : null;
		}
	}
}

export async function saveRate(key, val) {
	const [year, q] = key.split('-Q');
	const rate = val === '' || val == null ? null : parseFloat(val);
	rates[key] = rate;
	await supabase.from('quarterly_rates').upsert({
		year: parseInt(year),
		quarter: parseInt(q),
		rate,
	}, { onConflict: 'year,quarter' });
}

export function getQuarterInfo(dateStr) {
	const [y, mo, da] = dateStr.split('-').map(Number);
	const d = mo * 100 + da;
	if (d >= 315 && d < 615) return { year: y, quarter: 1 };
	if (d >= 615 && d < 915) return { year: y, quarter: 2 };
	if (d >= 915 && d < 1215) return { year: y, quarter: 3 };
	if (d >= 1215) return { year: y, quarter: 4 };
	return { year: y - 1, quarter: 4 };
}

export function getRateKey(dateStr) {
	const { year, quarter } = getQuarterInfo(dateStr);
	return `${year}-Q${quarter}`;
}

export function groupByRate(entries) {
	const groups = [];
	const seen = {};
	for (const e of entries) {
		const key = getRateKey(e.entry_date ?? e.date);
		if (!seen[key]) {
			seen[key] = { rateKey: key, rate: rates[key] ?? null, entries: [], totalSeconds: 0 };
			groups.push(seen[key]);
		}
		seen[key].entries.push(e);
		seen[key].totalSeconds += (e.duration_seconds ?? e.duration);
	}
	// Keep rate reactive
	for (const g of groups) g.rate = rates[g.rateKey] ?? null;
	return groups;
}
