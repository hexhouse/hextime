<script>
	import { supabase } from '$lib/supabase.js';
	import { auth } from '$lib/auth.svelte.js';
	import { goto } from '$app/navigation';
	import { rates, loadRates, getRateKey, loadCaps, getCapForDate } from '$lib/rates.svelte.js';

	let mode = $state('manual');
	let running = $state(false);
	let paused = $state(false);
	let reviewing = $state(false);
	let logAttempted = $state(false);
	let startTime = $state(null);
	let elapsed = $state(0);
	let timerInterval = null;

	let description = $state('');
	let project = $state('');
	let hours = $state('');
	let minutes = $state('');
	let decimalHours = $state('');
	let decimalMode = $state(
		typeof localStorage !== 'undefined' && localStorage.getItem('hextime_decimal') === '1'
	);
	let entryDate = $state(today());

	let entries = $state([]);
	let expandedPeriods = $state(new Set(['current']));
	let isRestricted = $state(false);

	const projects = ['Space/Facilities/Infrastructure', 'Membership', 'Public Messaging', 'Events', 'Maintainer Meeting', 'Finance', 'Organizational Stewardship', 'Residency', 'Other'];

	const PROJECT_COLORS = {
		'Space/Facilities/Infrastructure': '#7eb8d4',
		'Membership':                      '#a8d8a8',
		'Public Messaging':                '#f4a261',
		'Events':                          '#e76f51',
		'Maintainer Meeting':              '#c9b8f0',
		'Finance':                         '#ffd166',
		'Organizational Stewardship':      '#06d6a0',
		'Residency':                       '#ef476f',
	};

	const importPlaceholder = `You can paste a dashed list of lines here, one entry per line with the time in your preferred format at the end.
Example:

- toured Juniper .5
- onboarded Juniper 1
- updated events payment sheet .3
- toured a potential wedding 1`;

	function today() {
		return new Date().toISOString().slice(0, 10);
	}

	function fmt(s) {
		const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
		return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
	}

	function fmtDuration(s) {
		const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
		if (h > 0 && m > 0) return `${h}h ${m}m`;
		if (h > 0) return `${h}h`;
		return `${m}m`;
	}

	function fmtDate(d) {
		if (d === today()) return 'today';
		const [y, mo, day] = d.split('-');
		return `${mo}/${day}/${y}`;
	}

	async function loadEntries() {
		const { data } = await supabase
			.from('time_entries')
			.select('*')
			.eq('user_id', auth.session.user.id)
			.order('entry_date', { ascending: false })
			.order('created_at', { ascending: false });
		if (data) entries = data;
	}

	$effect(() => {
		if (auth.session?.user) {
			loadEntries();
			loadRates();
			loadCaps(auth.session.user.id);
			supabase.from('profiles').select('restricted').eq('id', auth.session.user.id).single()
				.then(({ data }) => { if (data) isRestricted = data.restricted === true; });
		}
	});

	function startTimer() {
		startTime = Date.now() - elapsed * 1000;
		timerInterval = setInterval(() => { elapsed = Math.floor((Date.now() - startTime) / 1000); }, 1000);
		running = true; paused = false; reviewing = false;
	}

	function pauseTimer() {
		clearInterval(timerInterval);
		running = false; paused = true;
	}

	function stopTimer() {
		clearInterval(timerInterval);
		running = false; paused = false; reviewing = true;
	}

	async function confirmSave() {
		await saveEntry(description || 'Untitled', project || 'Other', elapsed, today());
		resetTimer();
	}

	function resetTimer() {
		elapsed = 0; startTime = null; description = ''; project = '';
		running = false; paused = false; reviewing = false;
	}

	async function logManual() {
		let duration;
		if (decimalMode) {
			duration = Math.round((parseFloat(decimalHours) || 0) * 3600);
		} else {
			duration = (parseInt(hours) || 0) * 3600 + (parseInt(minutes) || 0) * 60;
		}
		if (!description.trim()) { logAttempted = true; return; }
		if (duration === 0) return;
		await saveEntry(description, project || 'Other', duration, entryDate || today());
		description = ''; project = ''; hours = ''; minutes = ''; decimalHours = ''; entryDate = today();
		logAttempted = false;
	}

	async function saveEntry(desc, proj, durationSeconds, date) {
		const { data, error } = await supabase.from('time_entries').insert({
			user_id: auth.session.user.id,
			description: desc,
			project: proj,
			duration_seconds: durationSeconds,
			entry_date: date,
		}).select().single();
		if (!error && data) entries = [data, ...entries];
	}

	async function signOut() {
		await supabase.auth.signOut();
		goto('/');
	}

	// Edit / delete
	let editingId = $state(null);
	let editDesc = $state('');
	let editHours = $state('');
	let editProject = $state('');
	let editDate = $state('');

	function startEdit(entry) {
		editingId = entry.id;
		editDesc = entry.description;
		editHours = String(+(entry.duration_seconds / 3600).toFixed(4));
		editProject = entry.project || '';
		editDate = entry.entry_date;
	}

	function cancelEdit() { editingId = null; }

	async function saveEdit() {
		const secs = Math.round(parseFloat(editHours) * 3600);
		if (!editDesc || !secs) return;
		const { error } = await supabase.from('time_entries').update({
			description: editDesc, project: editProject,
			duration_seconds: secs, entry_date: editDate,
		}).eq('id', editingId);
		if (!error) {
			entries = entries.map(e => e.id === editingId
				? { ...e, description: editDesc, project: editProject, duration_seconds: secs, entry_date: editDate }
				: e);
			editingId = null;
		}
	}

	async function deleteEntry(id) {
		const { error } = await supabase.from('time_entries').delete().eq('id', id);
		if (!error) entries = entries.filter(e => e.id !== id);
	}

	const todayTotal = $derived(
		entries.filter(e => e.entry_date === today()).reduce((s, e) => s + e.duration_seconds, 0) + elapsed
	);

	function currentBillingPeriod() {
		const now = new Date();
		let sm = now.getDate() >= 15 ? now.getMonth() : now.getMonth() - 1;
		let sy = now.getFullYear();
		if (sm < 0) { sm = 11; sy--; }
		let em = sm + 1, ey = sy;
		if (em > 11) { em = 0; ey++; }
		const start = `${sy}-${String(sm + 1).padStart(2,'0')}-15`;
		const end = `${ey}-${String(em + 1).padStart(2,'0')}-14`;
		const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
		const label = `${months[sm]} 15 – ${months[em]} 14`;
		return { start, end, label };
	}

	const billingPeriod = currentBillingPeriod();

	const periodTotalSecs = $derived(
		entries.filter(e => e.entry_date >= billingPeriod.start && e.entry_date <= billingPeriod.end)
			.reduce((s, e) => s + e.duration_seconds, 0) + elapsed
	);
	const periodCapHours = $derived(
		auth.session?.user?.id ? getCapForDate(auth.session.user.id, billingPeriod.start) : null
	);
	const periodRate = $derived(rates[getRateKey(billingPeriod.start)] ?? null);
	const periodCompSecs = $derived(
		periodCapHours != null ? Math.min(periodTotalSecs, periodCapHours * 3600) : periodTotalSecs
	);
	const periodEarned = $derived(
		periodRate != null ? (periodCompSecs / 3600) * periodRate : null
	);
	const periodOverCap = $derived(
		periodCapHours != null && periodTotalSecs > periodCapHours * 3600
	);

	function periodForDate(dateStr) {
		const [y, mo, da] = dateStr.split('-').map(Number);
		let sm = da >= 15 ? mo - 1 : mo - 2;
		let sy = y;
		if (sm < 0) { sm += 12; sy--; }
		let em = sm + 1, ey = sy;
		if (em > 11) { em = 0; ey++; }
		const start = `${sy}-${String(sm + 1).padStart(2,'0')}-15`;
		const end = `${ey}-${String(em + 1).padStart(2,'0')}-14`;
		const s = new Date(sy, sm, 15), e = new Date(ey, em, 14);
		const label = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
			+ ' – ' + e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		return { start, end, label };
	}

	const groupedByPeriod = $derived(() => {
		const map = {};
		for (const e of entries) {
			const p = periodForDate(e.entry_date);
			if (!map[p.start]) map[p.start] = { period: p, entries: [] };
			map[p.start].entries.push(e);
		}
		return Object.values(map)
			.map(g => ({
				...g,
				totalSecs: g.entries.reduce((s, e) => s + e.duration_seconds, 0),
				entries: g.entries.sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
			}))
			.sort((a, b) => b.period.start.localeCompare(a.period.start));
	});

	// Bulk import
	let showImport = $state(false);
	let importText = $state('');
	let importDate = $state(today());
	let importFormat = $state('hours'); // 'hours' | 'hhmm' | 'minutes'
	let importStage = $state('paste'); // 'paste' | 'categorize'
	let stagedEntries = $state([]);
	let batchProject = $state('');
	let importing = $state(false);
	let importDone = $state(null);

	// Auto-detects suffix; falls back to importFormat for bare numbers.
	function parseTimeToken(token, fallbackFormat) {
		// h:mm or hh:mm (always auto-detected)
		const colonMatch = token.match(/^(\d+):(\d{2})$/);
		if (colonMatch) {
			const s = Math.round((parseInt(colonMatch[1]) + parseInt(colonMatch[2]) / 60) * 3600);
			return s > 0 ? s : null;
		}
		// minutes suffix: 90m, 90min, 90mins
		const minMatch = token.match(/^([\d.]+)mins?$/i);
		if (minMatch) {
			const s = Math.round(parseFloat(minMatch[1]) * 60);
			return s > 0 ? s : null;
		}
		// hours suffix: 1.5h, 1.5hr, 1.5hrs
		const hrMatch = token.match(/^([\d.]+)hrs?$/i);
		if (hrMatch) {
			const s = Math.round(parseFloat(hrMatch[1]) * 3600);
			return s > 0 ? s : null;
		}
		// bare number — use fallback format
		const bare = parseFloat(token);
		if (isNaN(bare) || bare <= 0) return null;
		if (fallbackFormat === 'minutes') return Math.round(bare * 60);
		return Math.round(bare * 3600);
	}

	const parsedImport = $derived.by(() => {
		const results = [];
		const skipped = [];
		for (const raw of importText.split('\n')) {
			const line = raw.trim();
			if (!line.startsWith('-')) continue;
			const content = line.slice(1).trim();
			if (!content) continue;
			const match = content.match(/^(.+)\s+(\S+)\s*$/);
			if (!match) { skipped.push(content); continue; }
			const desc = match[1].trim();
			const secs = parseTimeToken(match[2].trim(), importFormat);
			if (!desc || !secs) { skipped.push(content); continue; }
			results.push({ description: desc, duration_seconds: secs, entry_date: importDate });
		}
		return { results, skipped };
	});

	function guessProject(desc) {
		const d = desc.toLowerCase();
		if (/meeting|mtg|sync|standup/.test(d)) return 'Maintainer Meeting';
		if (/finance|payment|invoice|stripe|gusto|bank|account|budget|expense/.test(d)) return 'Finance';
		if (/member|membership|contract|onboard/.test(d)) return 'Membership';
		if (/event|party|fundrais|shiv|nye|celebrat|gather/.test(d)) return 'Events';
		if (/clean|bathroom|kitchen|trash|facilit|infra|fix|repair|build|install|plumb|electric/.test(d)) return 'Space/Facilities/Infrastructure';
		if (/newsletter|instagram|social|post|promo|messag|website|flyer|announc|photo|video/.test(d)) return 'Public Messaging';
		if (/residency|resident/.test(d)) return 'Residency';
		return 'Organizational Stewardship';
	}

	function stageForCategorization() {
		const { results } = parsedImport;
		stagedEntries = results.map(e => ({ ...e, project: guessProject(e.description) }));
		importStage = 'categorize';
	}

	async function runImport() {
		if (!stagedEntries.length) return;
		importing = true;
		const rows = stagedEntries.map(e => ({
			user_id: auth.session.user.id,
			description: e.description,
			project: e.project,
			duration_seconds: e.duration_seconds,
			entry_date: e.entry_date,
		}));
		const { error } = await supabase.from('time_entries').insert(rows);
		importing = false;
		if (!error) {
			importDone = rows.length;
			importText = '';
			stagedEntries = [];
			importStage = 'paste';
			await loadEntries();
		}
	}
</script>

<style>
	.journal {
		position: relative;
	}
	.journal::before {
		content: '';
		position: absolute;
		inset: -14px;
		border-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACoAAAAqCAYAAADFw8lbAAAB5klEQVRYR+1Zy5aDIAytrmX8/8+0djt2QvGBkZgEg9pzxlWLkFxuXhCrB3qca9947Pj/AUTUixj4WcOQH+37rpLI30xyzgHQ+iPWC9p//J62elKjlDw1UIpJqSBuS1LLUfpmOtZAF1OdAjQyAQl0AjhN8P/9utfoO/i9ljlqfkpvau6Eq6IWzMBbCC4g2JrZLKB7DJ7NaGzZBwDrXyEr8IyO6eosRldAo/TFArXySSynAQI8VRQwbMnLgLKxgSxJpCf74KHyqJjRSQBO+NY+aQZ0AfwDsVaZp6MCQMOh5LaMnl3rGygkVVRIuOAig2kyVSlmOWDq9HRpZdIkfOfKBJcJo1eenrJL6NeYvlStT5v+DWnx+QlwdTCVBKo5Xv7Xes4S2itQ4rp88xKKT1GlKhKlh8urW0YbYBRG7w+00B1JdszbSU+cAC4oct9/dTDV0EDo+j6d8KU9oS1zqEOXSa36zkTdnTL1i5dlAz07Ta30QW+y70JnJPjwANknuALZRG1hoqbRKqaQmKjOo3iHgm4uUk35brrpi3GT51GKCcsWeei1D2C+qD1OKFYDpXznqIml6zfnUW5hqRO+Vi/7RcLSBWJw3gl+96J5nDx3nKU74+aZvo8+oYiBmgI4IIw1/QHZpkv/AKhgd0nbK4EFAAAAAElFTkSuQmCC') 14 / 14px / 0 round;
		border-width: 14px;
		border-style: solid;
		filter: invert(1);
		pointer-events: none;
	}
</style>

<div class="min-h-screen bg-[#060606] text-white">

	<nav class="px-6 py-4 flex items-center justify-between" style="border-bottom: 1px dotted rgba(255,255,255,0.2);">
		<span style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.1rem;">hex time</span>
		<div class="flex gap-5">
			<a href="/invoice" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">invoice</a>
			<a href="/profile/setup" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">profile</a>
			{#if !isRestricted}<a href="/maintainer" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">maintainers</a>{/if}
			<a href="/admin" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">admin</a>
			<button onclick={signOut} style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4); background: none; border: none; cursor: pointer;">sign out</button>
		</div>
	</nav>

	<div class="max-w-lg mx-auto px-6 py-10">

		<div class="journal mb-10" style="padding: 1rem 1.25rem 1.25rem 1.25rem;">

		<section>
			<div class="flex items-center mb-7">
				<div style="display: inline-flex; border: 1px dotted rgba(255,255,255,0.25); font-family: 'Courier', monospace; font-size: 1rem;">
					<button
						onclick={() => { mode = 'manual'; if (running) stopTimer(); }}
						style="padding: 0.25em 0.8em; background: {mode === 'manual' ? 'rgba(255,255,255,0.12)' : 'none'}; color: {mode === 'manual' ? 'white' : 'rgba(255,255,255,0.35)'}; border: none; cursor: pointer;"
					>log time</button>
					<button
						onclick={() => mode = 'timer'}
						style="padding: 0.25em 0.8em; background: {mode === 'timer' ? 'rgba(255,255,255,0.12)' : 'none'}; color: {mode === 'timer' ? 'white' : 'rgba(255,255,255,0.35)'}; border: none; cursor: pointer; border-left: 1px dotted rgba(255,255,255,0.25);"
					>timer</button>
				</div>
			</div>

			{#if mode === 'manual'}
				<div class="space-y-5">
					<div>
						<input
							type="text"
							bind:value={description}
							class="hex-input"
							style="font-family: 'Times New Roman', Georgia, serif; font-size: 1rem; {logAttempted && !description.trim() ? 'border-color: rgba(255,210,80,0.6);' : ''}"
							placeholder="work description..."
							onkeydown={(e) => e.key === 'Enter' && logManual()}
							oninput={() => { if (logAttempted && description.trim()) logAttempted = false; }}
						/>
					</div>
					<div class="flex gap-6 flex-wrap items-end">
						{#if decimalMode}
							<div>
								<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">hours (decimal)</label>
								<input type="number" bind:value={decimalHours} class="hex-input" placeholder="1.5" min="0" step="0.25" style="width: 5rem;" />
							</div>
						{:else}
							<div>
								<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">hours</label>
								<input type="number" bind:value={hours} class="hex-input" placeholder="0" min="0" style="width: 3.5rem;" />
							</div>
							<div>
								<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">min</label>
								<input type="number" bind:value={minutes} class="hex-input" placeholder="0" min="0" max="59" style="width: 3.5rem;" />
							</div>
						{/if}
						<div>
							<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">project</label>
							<select bind:value={project} class="hex-select">
								<option value="">—</option>
								{#each projects as p}<option value={p}>{p}</option>{/each}
							</select>
						</div>
						<div>
							<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">date</label>
							<input type="date" bind:value={entryDate} class="hex-input" style="width: 8rem; color-scheme: dark;" />
						</div>
					</div>
					<div class="flex items-center gap-4 mt-1">
						<button class="btn-silver" onclick={logManual} style="opacity: {description.trim() ? 1 : 0.4};">+ log entry</button>
						<button
							onclick={() => { decimalMode = !decimalMode; localStorage.setItem('hextime_decimal', decimalMode ? '1' : '0'); }}
							style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.3); background: none; border: none; cursor: pointer;"
						>{decimalMode ? 'switch to h/min' : 'switch to decimal (1.5h)'}</button>
					</div>
				</div>

			{:else}
				<div class="space-y-5">
					<div class="py-3 text-center">
						<span style="font-family: 'Courier', monospace; font-size: 3.5rem; letter-spacing: 0.06em; color: {paused ? 'rgba(255,255,255,0.4)' : 'white'};">{fmt(elapsed)}</span>
						{#if paused}<span style="font-family: 'Courier', monospace; font-size: 0.8rem; color: rgba(255,255,255,0.3); display: block; margin-top: 0.25rem;">paused</span>{/if}
					</div>
					<div>
						<input type="text" bind:value={description} class="hex-input" style="font-family: 'Times New Roman', Georgia, serif; font-size: 1rem; {reviewing && !description.trim() ? 'border-color: rgba(255,210,80,0.6);' : ''}" placeholder="work description..." />
					</div>
					<div>
						<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">project</label>
						<select bind:value={project} class="hex-select" style="{reviewing && !project ? 'border-color: rgba(255,210,80,0.6);' : ''}">
							<option value="">—</option>
							{#each projects as p}<option value={p}>{p}</option>{/each}
						</select>
					</div>

					{#if reviewing}
						<div class="flex gap-3 items-center">
							<button
								onclick={confirmSave}
								disabled={!description.trim()}
								style="background: none; border: 1px dotted rgba(255,255,255,0.4); color: white; font-family: 'Courier', monospace; padding: 0.3em 0.9em; cursor: pointer; opacity: {description.trim() ? 1 : 0.3};"
							>+ save to log</button>
							<button
								onclick={resetTimer}
								style="background: none; border: none; color: rgba(255,255,255,0.3); font-family: 'Courier', monospace; padding: 0.3em 0; cursor: pointer;"
							>discard</button>
						</div>
					{:else if running}
						<div class="flex gap-3">
							<button
								onclick={pauseTimer}
								style="background: none; border: 1px dotted rgba(255,200,100,0.5); color: rgba(255,200,100,0.9); font-family: 'Courier', monospace; padding: 0.3em 0.9em; cursor: pointer;"
							>⏸ pause</button>
							<button
								onclick={stopTimer}
								style="background: none; border: 1px dotted rgba(255,100,100,0.5); color: rgba(255,120,120,0.9); font-family: 'Courier', monospace; padding: 0.3em 0.9em; cursor: pointer;"
							>■ stop</button>
						</div>
					{:else if paused}
						<div class="flex gap-3">
							<button
								onclick={startTimer}
								style="background: none; border: 1px dotted rgba(255,255,255,0.4); color: white; font-family: 'Courier', monospace; padding: 0.3em 0.9em; cursor: pointer;"
							>▶ resume</button>
							<button
								onclick={stopTimer}
								style="background: none; border: 1px dotted rgba(255,100,100,0.5); color: rgba(255,120,120,0.9); font-family: 'Courier', monospace; padding: 0.3em 0.9em; cursor: pointer;"
							>■ stop</button>
						</div>
					{:else}
						<button
							onclick={startTimer}
							style="background: none; border: 1px dotted rgba(255,255,255,0.4); color: white; font-family: 'Courier', monospace; padding: 0.3em 0.9em; cursor: pointer;"
						>▶ start</button>
					{/if}
				</div>
			{/if}
		</section>

		</div><!-- end log journal -->

		<!-- Bulk import -->
		<div class="journal mb-10" style="padding: 1rem 1.25rem 1.25rem 1.25rem;">
		<div>
			<button
				onclick={() => { showImport = !showImport; importDone = null; if (!showImport) { importStage = 'paste'; stagedEntries = []; importDate = today(); } }}
				style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.55); background: none; border: none; cursor: pointer; padding: 0;"
			>{showImport ? '▲ close import' : '↓ import from notes'}</button>

			{#if showImport}
				<div class="mt-4 space-y-4">

					{#if importStage === 'paste'}
						<div class="flex items-end gap-6 flex-wrap">
							<div>
								<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.6);">date for all entries</label>
								<input type="date" bind:value={importDate} class="hex-input" style="width: 9rem; color-scheme: dark; font-family: 'Courier', monospace; font-size: 0.82rem;" />
							</div>
							<div>
								<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.6);">time format</label>
								<div style="display: inline-flex; border: 1px dotted rgba(255,255,255,0.2); font-family: 'Courier', monospace; font-size: 0.75rem;">
									{#each [['hours', 'hours (1.5)'], ['hhmm', 'h:mm (1:30)'], ['minutes', 'minutes (90)']] as [val, label], i}
										<button
											onclick={() => importFormat = val}
											style="padding: 0.2em 0.6em; background: {importFormat === val ? 'rgba(255,255,255,0.1)' : 'none'}; color: {importFormat === val ? 'white' : 'rgba(255,255,255,0.3)'}; border: none; cursor: pointer; {i < 2 ? 'border-right: 1px dotted rgba(255,255,255,0.2);' : ''}"
										>{label}</button>
									{/each}
								</div>
							</div>
						</div>
						<div style="position: relative;">
							<textarea
								bind:value={importText}
								oninput={() => { if (importDone != null) importDone = null; }}
								rows="10"
								class="hex-input"
								style="width: 100%; font-family: 'Courier', monospace; font-size: 0.82rem; resize: vertical; background: rgba(255,255,255,0.07); padding: 0.5rem;"
							></textarea>
							{#if !importText}
								<div style="position: absolute; top: 0.5rem; left: 0.5rem; right: 0.5rem; pointer-events: none; white-space: pre-wrap; font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.42); line-height: 1.5;">{importPlaceholder}</div>
							{/if}
						</div>

						{#if parsedImport.results.length > 0}
							<div class="flex items-center gap-4">
								<p style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.35);">
									{parsedImport.results.length} entries detected
								</p>
								<button class="btn-silver" onclick={stageForCategorization} style="font-size: 0.82rem;">
									categorize →
								</button>
							</div>
						{:else if importText.trim() && parsedImport.skipped.length === 0}
							<p style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3);">
								put the time at the end of each line — e.g. <code style="color: rgba(255,255,255,0.5);">toured the space 1</code>
							</p>
						{/if}

						{#if parsedImport.skipped.length > 0}
							<div>
								<p style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,150,100,0.6); margin-bottom: 0.3rem;">
									{parsedImport.skipped.length} lines skipped (no hours found):
								</p>
								{#each parsedImport.skipped as s}
									<div style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,150,100,0.4); padding: 0.1rem 0;">— {s}</div>
								{/each}
							</div>
						{/if}

					{:else}
						<!-- Categorization step -->
						<div class="flex items-center justify-between">
							<button
								onclick={() => importStage = 'paste'}
								style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3); background: none; border: none; cursor: pointer; padding: 0;"
							>← back</button>
							<p style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.35);">
								{stagedEntries.length} entries — assign project to each
							</p>
						</div>

						<!-- Batch set -->
						<div class="flex items-center gap-2">
							<label style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3); white-space: nowrap;">set all to:</label>
							<select
								bind:value={batchProject}
								onchange={() => { if (batchProject) { stagedEntries = stagedEntries.map(e => ({ ...e, project: batchProject })); batchProject = ''; } }}
								class="hex-select"
								style="font-size: 0.82rem;"
							>
								<option value="">—</option>
								{#each projects as p}<option value={p}>{p}</option>{/each}
							</select>
						</div>

						<!-- Per-entry rows -->
						<div style="max-height: 55vh; overflow-y: auto; border: 1px dotted rgba(255,255,255,0.1); padding: 0.25rem 0.5rem;">
							{#each stagedEntries as entry, i}
								<div style="display: grid; grid-template-columns: 4rem 3.5rem 1fr auto; gap: 0.5rem; align-items: center; padding: 0.3rem 0; border-bottom: 1px dotted rgba(255,255,255,0.07);">
									<span style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.25);">{entry.entry_date.slice(5, 7)}/{entry.entry_date.slice(8)}</span>
									<span style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.4);">{fmtDuration(entry.duration_seconds)}</span>
									<span style="font-family: 'Times New Roman', Georgia, serif; font-size: 0.9rem; color: rgba(255,255,255,0.75); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title={entry.description}>{entry.description}</span>
									<select
										bind:value={stagedEntries[i].project}
										class="hex-select"
										style="font-size: 0.75rem; min-width: 0; max-width: 180px;"
									>
										{#each projects as p}<option value={p}>{p}</option>{/each}
									</select>
								</div>
							{/each}
						</div>

						<button class="btn-silver" onclick={runImport} disabled={importing}>
							{importing ? '...' : `import ${stagedEntries.length} entries`}
						</button>
					{/if}

					{#if importDone != null}
						<p style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.5);">✓ imported {importDone} entries</p>
					{/if}
				</div>
			{/if}
		</div>
		</div><!-- end import journal -->

		<!-- Billing period summary -->
		<div class="mt-20 mb-6 px-3 py-3" style="border: 1px dotted rgba(255,255,255,0.1);">
			<p style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.3); margin-bottom: 0.35rem;">
				current period: {billingPeriod.label}
			</p>
			<div class="flex gap-5 flex-wrap items-baseline">
				<span style="font-family: 'Courier', monospace; font-size: 0.9rem;">
					{fmtDuration(periodTotalSecs)} logged
					{#if periodCapHours != null}
						<span style="color: rgba(255,255,255,0.3);"> / {periodCapHours}h cap</span>
					{/if}
				</span>
				{#if periodEarned != null}
					<span style="font-family: 'Courier', monospace; font-size: 0.9rem; color: rgba(255,255,255,0.7);">
						${periodEarned.toFixed(2)} earned
					</span>
				{/if}
				{#if periodOverCap}
					<span
						title="quarterly cap of {periodCapHours}h reached — hours above cap are logged but uncompensated"
						style="font-family: 'Courier', monospace; font-size: 0.82rem; color: #f4a261; cursor: default;"
					>⚠ cap reached</span>
				{/if}
			</div>
		</div>

		<section class="mt-16">
			{#each groupedByPeriod() as { period, entries: periodEntries, totalSecs: pTotal }, i}
				{@const key = i === 0 ? 'current' : period.start}
				{@const isOpen = expandedPeriods.has(key)}
				<div class="mb-6">
					<button
						class="w-full text-left flex items-baseline justify-between pb-3"
						style="border-bottom: 1px solid rgba(255,255,255,{i === 0 ? '0.12' : '0.06'}); background: none; border-top: none; border-left: none; border-right: none; cursor: pointer; margin-bottom: {isOpen ? '1rem' : '0'};"
						onclick={() => { const s = new Set(expandedPeriods); s.has(key) ? s.delete(key) : s.add(key); expandedPeriods = s; }}
					>
						<span style="font-family: 'Skanaus-Display', sans-serif; font-size: 1rem; color: rgba(255,255,255,{i === 0 ? '0.55' : '0.25'});">payment period: {period.label}</span>
						<div class="flex items-baseline gap-3">
							<span style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,{i === 0 ? '0.4' : '0.2'});">{fmtDuration(pTotal)}</span>
							{#if !isOpen}<span style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.18);">{periodEntries.length} {periodEntries.length === 1 ? 'entry' : 'entries'}</span>{/if}
							<span style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.2);">{isOpen ? '▲' : '▼'}</span>
						</div>
					</button>
					{#if isOpen}
					{#each periodEntries as entry}
						{#if editingId === entry.id}
							<div style="padding: 0.6rem 0; border-bottom: 1px dotted rgba(255,255,255,0.1);">
								<input
									type="text"
									bind:value={editDesc}
									class="hex-input"
									style="font-family: 'Times New Roman', Georgia, serif; font-size: 1rem; margin-bottom: 0.5rem;"
									onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
								/>
								<div class="flex gap-4 items-end flex-wrap">
									<div>
										<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.4);">hours</label>
										<input type="number" bind:value={editHours} class="hex-input" min="0" step="0.25" style="width: 4.5rem;" />
									</div>
									<div>
										<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.4);">project</label>
										<select bind:value={editProject} class="hex-select" style="font-size: 0.9rem;">
											<option value="">—</option>
											{#each projects as p}<option value={p}>{p}</option>{/each}
										</select>
									</div>
									<div>
										<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.4);">date</label>
										<input type="date" bind:value={editDate} class="hex-input" style="width: 8rem; color-scheme: dark;" />
									</div>
									<div class="flex gap-3 items-center">
										<button class="btn-silver" onclick={saveEdit} style="font-size: 0.9rem;">save</button>
										<button onclick={cancelEdit} style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3); background: none; border: none; cursor: pointer;">cancel</button>
									</div>
								</div>
							</div>
						{:else}
							<div class="flex items-baseline justify-between py-2" style="border-bottom: 1px dotted rgba(255,255,255,0.08);">
								<div class="flex items-baseline gap-3 flex-wrap">
									<span style="font-family: 'Times New Roman', Georgia, serif; font-size: 1.1rem; color: {entry.project && PROJECT_COLORS[entry.project] ? `color-mix(in srgb, ${PROJECT_COLORS[entry.project]} 55%, rgba(255,255,255,${i === 0 ? '0.7' : '0.45'}))` : `rgba(255,255,255,${i === 0 ? '1' : '0.65'})`};">{entry.description}</span>
									{#if entry.project}
										<span style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.22);">{entry.project}</span>
									{/if}
								</div>
								<div class="flex items-baseline gap-3" style="flex-shrink: 0; margin-left: 0.75rem;">
									<span style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.2);">{fmtDate(entry.entry_date)}</span>
									<span style="font-family: 'Courier', monospace; font-size: 0.95rem; color: rgba(255,255,255,{i === 0 ? '0.55' : '0.35'});">{fmtDuration(entry.duration_seconds)}</span>
									<button onclick={() => startEdit(entry)} style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.2); background: none; border: none; cursor: pointer; padding: 0;">edit</button>
									<button onclick={() => deleteEntry(entry.id)} style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,100,100,0.25); background: none; border: none; cursor: pointer; padding: 0;">×</button>
								</div>
							</div>
						{/if}
					{/each}
					{/if}
				</div>
			{/each}
		</section>

	</div>

	<div class="fixed bottom-4 right-5">
		<a href="https://docs.google.com/document/d/103PKUMAJ1aXdLwx6XYLSUxXY11OVc16D8GhGrR8aIzg/edit?usp=sharing" target="_blank" rel="noopener" style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.5); text-decoration: none;">maintainer roles doc ↗</a>
	</div>
</div>
