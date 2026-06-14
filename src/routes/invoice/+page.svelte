<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';
	import { auth } from '$lib/auth.svelte.js';
	import { rates, loadRates, groupByRate, loadCaps, getCapForDate } from '$lib/rates.svelte.js';

	let profile = $state(null);
	let allEntries = $state([]);

	let invoiceNumber = $state('001');
	let notes = $state('');
	let showPreview = $state(false);
	let manualRates = $state({});
	let customDates = $state(false);

	function getBillingPeriods() {
		const periods = [];
		// Fixed range: Mar 15, 2026 → Mar 14, 2027 (12 periods)
		for (let i = 0; i < 12; i++) {
			const sm = (2 + i) % 12; // start month (0-indexed), March = 2
			const sy = 2026 + Math.floor((2 + i) / 12);
			const em = (sm + 1) % 12;
			const ey = sm === 11 ? sy + 1 : sy;
			const start = `${sy}-${String(sm + 1).padStart(2,'0')}-15`;
			const end = `${ey}-${String(em + 1).padStart(2,'0')}-14`;
			const s = new Date(sy, sm, 15), e = new Date(ey, em, 14);
			const label = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
				+ ' – ' + e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
			periods.push({ start, end, label, key: start });
		}
		return periods.reverse(); // newest first so current period is near the top
	}

	const periods = getBillingPeriods();
	const todayStr = new Date().toISOString().slice(0, 10);
	const defaultPeriod = periods.find(p => todayStr >= p.start && todayStr <= p.end) ?? periods[0];

	let periodKey = $state(defaultPeriod.key);
	let customStart = $state(defaultPeriod.start);
	let customEnd = $state(defaultPeriod.end);
	let periodDropdownOpen = $state(false);

	function selectPeriod(key) {
		periodKey = key;
		periodDropdownOpen = false;
	}

	function closePeriodDropdown(e) {
		if (!e.target.closest('.period-dropdown')) periodDropdownOpen = false;
	}

	let startDate = $derived(
		customDates ? customStart : (periods.find(p => p.key === periodKey)?.start ?? '')
	);
	let endDate = $derived(
		customDates ? customEnd : (periods.find(p => p.key === periodKey)?.end ?? '')
	);

	onMount(async () => {
		if (!auth.session?.user) return;
		loadRates();
		loadCaps(auth.session.user.id);
		const [{ data: p }, { data: e }] = await Promise.all([
			supabase.from('profiles').select('*').eq('id', auth.session.user.id).single(),
			supabase.from('time_entries').select('*').eq('user_id', auth.session.user.id).order('entry_date', { ascending: false }),
		]);
		if (p) profile = p;
		if (e) allEntries = e;

		const script = document.createElement('script');
		script.src = '/assets/asciinema-player.min.js';
		script.onload = () => {
			window.AsciinemaPlayer.create('/assets/10.cast', document.getElementById('invoice-hourglass'), {
				speed: 2, idleTimeLimit: 1, autoPlay: true, loop: true, preload: true,
				controls: false, cols: 57, rows: 26, startAt: 4, theme: 'bla',
			});
		};
		document.head.appendChild(script);
	});

	const filtered = $derived(
		allEntries
			.filter(e => e.entry_date >= startDate && e.entry_date <= endDate)
			.sort((a, b) => a.entry_date.localeCompare(b.entry_date))
	);

	function splitByCap(entries, capHours) {
		if (capHours == null) return { comp: entries, over: [] };
		const capSecs = capHours * 3600;
		let acc = 0;
		const comp = [], over = [];
		for (const e of entries) {
			if (acc >= capSecs) {
				over.push(e);
			} else if (acc + e.duration_seconds <= capSecs) {
				comp.push(e); acc += e.duration_seconds;
			} else {
				const compSecs = capSecs - acc;
				comp.push({ ...e, duration_seconds: compSecs, _partial: true });
				over.push({ ...e, duration_seconds: e.duration_seconds - compSecs, _partial: true });
				acc = capSecs;
			}
		}
		return { comp, over };
	}

	const capHours = $derived(
		auth.session?.user?.id ? getCapForDate(auth.session.user.id, startDate) : null
	);
	const { comp: compEntries, over: overEntries } = $derived(splitByCap(filtered, capHours));

	const rateGroups = $derived(groupByRate(compEntries));

	function effectiveRate(g) {
		if (g.rate != null) return g.rate;
		const v = parseFloat(manualRates[g.rateKey]);
		return isNaN(v) ? null : v;
	}

	const totalAmount = $derived(
		rateGroups.reduce((sum, g) => {
			const r = effectiveRate(g);
			if (r == null) return sum;
			return sum + (g.totalSeconds / 3600) * r;
		}, 0).toFixed(2)
	);

	const hasUnratedEntries = $derived(rateGroups.some(g => effectiveRate(g) == null));
	const overSeconds = $derived(overEntries.reduce((s, e) => s + e.duration_seconds, 0));

	function fmtDuration(s) {
		const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
		if (h > 0 && m > 0) return `${h}h ${m}m`;
		if (h > 0) return `${h}h`;
		return `${m}m`;
	}

	function fmtDate(d) {
		const [y, mo, day] = d.split('-');
		return `${mo}/${day}/${y}`;
	}

	function printInvoice() {
		showPreview = true;
		setTimeout(() => window.print(), 100);
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="/assets/asciinema-player.css" />
	<style>
		.asciinema-player { background: #000000 !important; }
		.asciinema-player .asciinema-terminal { background: #000000 !important; }
		@media print {
			.no-print { display: none !important; }
			body { background: white !important; color: black !important; }
			.invoice-sheet { display: block !important; }
		}
	</style>
</svelte:head>

<!-- Setup UI -->
<div class="no-print min-h-screen bg-[#000000] text-white" style="font-family: 'Diolce-Regular', sans-serif;" onclick={closePeriodDropdown}>
	<nav class="px-6 py-4 flex items-center justify-between" style="border-bottom: 1px dotted rgba(255,255,255,0.25);">
		<span style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.1rem;">hex time</span>
		<a href="/dashboard" class="text-xs" style="color: rgba(255,255,255,0.45); font-family: 'Courier', monospace;">← dashboard</a>
	</nav>

	<div class="max-w-lg mx-auto px-6 py-10 space-y-8">
		<h2 style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.6rem;">generate invoice</h2>

		{#if !customDates}
			<div class="flex gap-6 flex-wrap items-end">
				<div style="position: relative;" class="period-dropdown">
					<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4);">payment period</label>
					<button
						onclick={() => periodDropdownOpen = !periodDropdownOpen}
						style="
							font-family: 'Courier', monospace;
							font-size: 0.9rem;
							background: #a8a8a8;
							color: #1a1a1a;
							border: 2px outset #b0b0b0;
							border-radius: 2px;
							padding: 0.15em 2em 0.15em 0.7em;
							cursor: pointer;
							white-space: nowrap;
							position: relative;
							box-shadow: inset 1px 1px 0px #d0d0d0, inset -1px -1px 0px #707070;
						"
					>
						{periods.find(p => p.key === periodKey)?.label ?? ''}
						<span style="position: absolute; right: 0.5em; top: 50%; transform: translateY(-50%); font-size: 0.65rem; color: #444;">{periodDropdownOpen ? '▲' : '▼'}</span>
					</button>
					{#if periodDropdownOpen}
						<div style="
							position: absolute;
							top: 100%;
							left: 0;
							z-index: 50;
							background: #060606;
							border: 1px dotted rgba(255,255,255,0.2);
							margin-top: 2px;
							min-width: 100%;
						">
							{#each periods as p}
								<button
									onclick={() => selectPeriod(p.key)}
									style="
										display: block;
										width: 100%;
										text-align: left;
										font-family: 'Courier', monospace;
										font-size: 0.9rem;
										padding: 0.35em 0.75em;
										background: {p.key === periodKey ? 'rgba(255,255,255,0.07)' : 'none'};
										color: {p.key === periodKey ? 'white' : 'rgba(255,255,255,0.55)'};
										border: none;
										cursor: pointer;
										white-space: nowrap;
									"
								>{p.label}</button>
							{/each}
						</div>
					{/if}
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4);">invoice #</label>
					<input type="text" bind:value={invoiceNumber} class="hex-input" style="width: 5rem;" />
				</div>
			</div>
		{:else}
			<div class="flex gap-6 flex-wrap items-end">
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4);">from</label>
					<input type="date" bind:value={customStart} class="hex-input" style="width: 9rem; color-scheme: dark;" />
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4);">to</label>
					<input type="date" bind:value={customEnd} class="hex-input" style="width: 9rem; color-scheme: dark;" />
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4);">invoice #</label>
					<input type="text" bind:value={invoiceNumber} class="hex-input" style="width: 5rem;" />
				</div>
			</div>
		{/if}
		<button
			onclick={() => customDates = !customDates}
			style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.2); background: none; border: none; cursor: pointer; padding: 0; margin-top: -1rem;"
		>{customDates ? '← back to payment periods' : 'custom date range'}</button>

		<div>
			<label class="block mb-1" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4);">notes (optional)</label>
			<input type="text" bind:value={notes} class="hex-input" placeholder="anything to add..." />
		</div>

		<hr class="hex-divider" />

		<!-- Cap info -->
		{#if capHours != null}
			<p style="font-family: 'Courier', monospace; font-size: 0.9rem; color: rgba(255,255,255,0.35); margin-bottom: 1rem;">
				monthly cap: {capHours}h
				{#if overEntries.length > 0}
					<span style="color: #f4a261;"> · {fmtDuration(overSeconds)} over cap</span>
				{/if}
			</p>
		{/if}

		<!-- Rate preview per group (compensated entries only) -->
		{#if filtered.length === 0}
			<p style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.35);">no entries in this period</p>
		{:else}
			{#each rateGroups as g}
				<div class="mb-4">
					<div class="flex items-baseline justify-between mb-2 gap-4">
						<span style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4);">{g.rateKey}</span>
						{#if g.rate != null}
							<span style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4);">
								${g.rate}/hr · {fmtDuration(g.totalSeconds)} · <strong style="color: white;">${((g.totalSeconds / 3600) * g.rate).toFixed(2)}</strong>
							</span>
						{:else}
							<div class="flex items-baseline gap-1">
								<span style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.35);">rate: $</span>
								<input
									type="number"
									bind:value={manualRates[g.rateKey]}
									class="hex-input text-right"
									style="width: 4.5rem; font-family: 'Courier', monospace; font-size: 1rem;"
									placeholder="—"
									min="0"
									step="0.01"
								/>
								<span style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.35);">/hr</span>
								{#if effectiveRate(g) != null}
									<span style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4); margin-left: 0.5rem;">
										· <strong style="color: white;">${((g.totalSeconds / 3600) * effectiveRate(g)).toFixed(2)}</strong>
									</span>
								{/if}
							</div>
						{/if}
					</div>
					{#each g.entries as entry}
						<div class="flex justify-between py-1.5" style="border-bottom: 1px dotted rgba(255,255,255,0.1);">
							<div>
								<span style="font-family: 'Times New Roman', Georgia, serif;">{entry.description}{#if entry._partial} <span style="color:rgba(255,255,255,0.3);">(partial)</span>{/if}</span>
								<span class="ml-2" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.3);">{entry.project}</span>
							</div>
							<div class="flex gap-4" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.5);">
								<span>{fmtDate(entry.entry_date)}</span>
								<span>{fmtDuration(entry.duration_seconds)}</span>
							</div>
						</div>
					{/each}
				</div>
			{/each}

			{#if !hasUnratedEntries}
				<p style="font-family: 'Courier', monospace; font-size: 1rem;">
					total: <strong>${totalAmount}</strong>
				</p>
			{/if}

			<!-- Over-cap entries -->
			{#if overEntries.length > 0}
				<div class="mt-6" style="border-top: 1px dotted rgba(255,255,255,0.15); padding-top: 1.25rem;">
					<p style="font-family: 'Courier', monospace; font-size: 0.9rem; color: rgba(255,255,255,0.35); margin-bottom: 0.75rem;">
						donated / uncompensated · {fmtDuration(overSeconds)}
					</p>
					{#each overEntries as entry}
						<div class="flex justify-between py-1.5" style="border-bottom: 1px dotted rgba(255,255,255,0.07);">
							<div>
								<span style="font-family: 'Times New Roman', Georgia, serif; color: rgba(255,255,255,0.45);">{entry.description}{#if entry._partial} <span style="color:rgba(255,255,255,0.25);">(partial)</span>{/if}</span>
								<span class="ml-2" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.2);">{entry.project}</span>
							</div>
							<div class="flex gap-4" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.3);">
								<span>{fmtDate(entry.entry_date)}</span>
								<span>{fmtDuration(entry.duration_seconds)}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<button class="btn-silver mt-4" onclick={printInvoice} disabled={hasUnratedEntries}>
				save as PDF
			</button>
			{#if hasUnratedEntries}
				<p class="mt-2" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.35);">enter a rate above to continue</p>
			{/if}

			<div class="mt-8">
				<p style="font-family: 'Courier', monospace; font-size: 0.85rem; color: rgba(255,255,255,0.3); margin-bottom: 0.6rem;">then →</p>
				<svg style="position:absolute;width:0;height:0;overflow:hidden;" aria-hidden="true">
					<defs>
						<filter id="invoice-noise" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
							<feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="6" stitchTiles="stitch" result="noise"/>
							<feColorMatrix type="saturate" values="0" in="noise" result="mono"/>
							<feComponentTransfer in="mono" result="boosted">
								<feFuncA type="linear" slope="15"/>
							</feComponentTransfer>
							<feBlend in="SourceGraphic" in2="boosted" mode="hard-light" result="blended"/>
							<feComposite in="blended" in2="SourceGraphic" operator="in"/>
						</filter>
					</defs>
				</svg>
				<a
					href="https://docs.google.com/forms/d/e/1FAIpQLSfyonxuZUjctSkVuyfsFe9Mnq5Ot9oDY2DHeI1UcUwfC3g00A/viewform?usp=header"
					target="_blank"
					rel="noopener noreferrer"
					style="
						display: inline-block;
						padding: 0.45em 1em;
						background: #1e0a16;
						color: rgba(255, 255, 255, 0.92);
						font-family: 'Courier', monospace;
						font-size: 1rem;
						text-decoration: none;
						border: 1px solid #0011ff;
						border-radius: 2px;
						filter: url(#invoice-noise) drop-shadow(0 0 6px rgba(190, 160, 150, 0.75)) drop-shadow(0 0 20px rgba(180, 30, 110, 0.55)) drop-shadow(0 0 45px rgba(0, 10, 180, 0.4));
					"
				>Hex ☄︎ Invoice &amp; Reimbursement ☄︎ <em>Submission&nbsp;Form</em></a>
			</div>

			<div id="invoice-hourglass" style="width: 430px; margin-left: auto; margin-right: auto; margin-top: 80px;"></div>
		{/if}
	</div>
</div>

<!-- Print-only invoice -->
<div class="invoice-sheet" style="display: {showPreview ? 'block' : 'none'}; max-width: 680px; margin: 0 auto; padding: 3rem; font-family: 'Courier', monospace; color: black; background: white;">

	<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3rem;">
		<div>
			<div style="font-family: 'Skanaus-Display', sans-serif; font-size: 2rem;">invoice</div>
			<div style="font-size: 1rem; color: #666; margin-top: 0.2rem;">Hex House</div>
		</div>
		<div style="text-align: right; font-size: 1rem;">
			<div>#{invoiceNumber}</div>
			<div style="color: #666;">{fmtDate(endDate)}</div>
		</div>
	</div>

	<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2.5rem; font-size: 1rem;">
		<div>
			<div style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 0.4rem;">from</div>
			<div style="font-weight: bold;">{profile?.business_name || profile?.name}</div>
			{#if profile?.business_name}<div>{profile.name}</div>{/if}
			<div>{profile?.address}</div>
			<div>{profile?.city_state_zip}</div>
			<div>{profile?.invoice_email}</div>
			{#if profile?.tax_id}<div style="color: #666; margin-top: 0.3rem;">EIN: {profile.tax_id}</div>{/if}
		</div>
		<div>
			<div style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 0.4rem;">to</div>
			<div style="font-weight: bold;">Hex House</div>
			<div>Brooklyn, NY</div>
		</div>
	</div>

	<div style="font-size: 1rem; color: #999; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.5rem;">
		{fmtDate(startDate)} — {fmtDate(endDate)}
	</div>

	<!-- One table per rate group -->
	{#each rateGroups as g, i}
		{#if i > 0}<div style="margin-top: 1.5rem;"></div>{/if}

		{#if rateGroups.length > 1}
			<div style="font-size: 1rem; color: #999; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.4rem;">
				{g.rateKey} · ${effectiveRate(g)}/hr
			</div>
		{/if}

		<table style="width: 100%; border-collapse: collapse; font-size: 1rem; margin-bottom: 0.5rem; table-layout: fixed;">
			<colgroup>
				<col style="width: 42%;" />
				<col style="width: 28%;" />
				<col style="width: 16%;" />
				<col style="width: 14%;" />
			</colgroup>
			<thead>
				<tr style="border-bottom: 1px solid black;">
					<th style="text-align: left; padding: 0.4rem 0; font-weight: normal; color: #888;">description</th>
					<th style="text-align: left; padding: 0.4rem 0; font-weight: normal; color: #888;">project</th>
					<th style="text-align: left; padding: 0.4rem 0; font-weight: normal; color: #888;">date</th>
					<th style="text-align: right; padding: 0.4rem 0; font-weight: normal; color: #888;">time</th>
				</tr>
			</thead>
			<tbody>
				{#each g.entries as entry}
					<tr style="border-bottom: 1px dotted #ddd;">
						<td style="padding: 0.4rem 0.5rem 0.4rem 0; word-break: break-word;">{entry.description}</td>
						<td style="padding: 0.4rem 0.5rem 0.4rem 0; color: #666; word-break: break-word;">{entry.project}</td>
						<td style="padding: 0.4rem 0; white-space: nowrap;">{fmtDate(entry.entry_date)}</td>
						<td style="padding: 0.4rem 0; text-align: right; white-space: nowrap;">{fmtDuration(entry.duration_seconds)}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if rateGroups.length > 1}
			{@const r = effectiveRate(g)}
			<div style="text-align: right; font-size: 1rem; color: #666; margin-bottom: 0.5rem;">
				subtotal: {fmtDuration(g.totalSeconds)} × ${r}/hr = ${((g.totalSeconds / 3600) * r).toFixed(2)}
			</div>
		{/if}
	{/each}

	<!-- Total -->
	<div style="display: flex; justify-content: flex-end; margin-top: 1.5rem; margin-bottom: 2rem;">
		<table style="font-size: 1rem;">
			<tbody>
				<tr style="border-top: 1px solid black;">
					<td style="padding: 0.5rem 1.5rem 0 0; font-weight: bold;">total due</td>
					<td style="font-weight: bold; font-size: 1.1rem;">${totalAmount}</td>
				</tr>
			</tbody>
		</table>
	</div>

	<!-- Donated / uncompensated section -->
	{#if overEntries.length > 0}
		<div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px dotted #ccc;">
			<div style="font-size: 1rem; text-transform: uppercase; letter-spacing: 0.08em; color: #aaa; margin-bottom: 0.5rem;">
				donated / uncompensated · {fmtDuration(overSeconds)}
			</div>
			<table style="width: 100%; border-collapse: collapse; font-size: 1rem; color: #aaa; table-layout: fixed;">
				<colgroup>
					<col style="width: 42%;" />
					<col style="width: 28%;" />
					<col style="width: 16%;" />
					<col style="width: 14%;" />
				</colgroup>
				<thead>
					<tr style="border-bottom: 1px dotted #ccc;">
						<th style="text-align: left; padding: 0.4rem 0; font-weight: normal;">description</th>
						<th style="text-align: left; padding: 0.4rem 0; font-weight: normal;">project</th>
						<th style="text-align: left; padding: 0.4rem 0; font-weight: normal;">date</th>
						<th style="text-align: right; padding: 0.4rem 0; font-weight: normal;">time</th>
					</tr>
				</thead>
				<tbody>
					{#each overEntries as entry}
						<tr style="border-bottom: 1px dotted #eee;">
							<td style="padding: 0.4rem 0.5rem 0.4rem 0; word-break: break-word;">{entry.description}{#if entry._partial} (partial){/if}</td>
							<td style="padding: 0.4rem 0.5rem 0.4rem 0; word-break: break-word;">{entry.project}</td>
							<td style="padding: 0.4rem 0; white-space: nowrap;">{fmtDate(entry.entry_date)}</td>
							<td style="padding: 0.4rem 0; text-align: right; white-space: nowrap;">{fmtDuration(entry.duration_seconds)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if notes}
		<div style="font-size: 1rem; color: #666; margin-bottom: 1.5rem;">
			<span style="color: #999; text-transform: uppercase; font-size: 1rem; letter-spacing: 0.08em;">notes: </span>{notes}
		</div>
	{/if}

	<div style="font-size: 1rem; color: #666; border-top: 1px dotted #ccc; padding-top: 0.75rem;">
		<span style="color: #999; text-transform: uppercase; font-size: 1rem; letter-spacing: 0.08em;">payment: </span>
		{profile?.payment_method} — {profile?.payment_details}
	</div>
</div>
