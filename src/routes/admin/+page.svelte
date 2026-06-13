<script>
	import { supabase } from '$lib/supabase.js';
	import { rates, loadRates, saveRate, quarterLabels } from '$lib/rates.svelte.js';

	let profiles = $state([]);
	let allEntries = $state([]);
	let expandedPeriod = $state(null);
	let expandedContractor = $state(null);
	let ratesYear = $state(new Date().getFullYear());
	const years = [ratesYear, ratesYear + 1];
	const quarters = [1, 2, 3, 4];

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

	function getBillingPeriods(count = 13) {
		const periods = [];
		const now = new Date();
		let sm = now.getDate() >= 15 ? now.getMonth() : now.getMonth() - 1;
		let sy = now.getFullYear();
		if (sm < 0) { sm = 11; sy--; }

		for (let i = 0; i < count; i++) {
			let em = sm + 1, ey = sy;
			if (em > 11) { em = 0; ey++; }
			const start = `${sy}-${String(sm + 1).padStart(2, '0')}-15`;
			const end = `${ey}-${String(em + 1).padStart(2, '0')}-14`;
			const s = new Date(sy, sm, 15), e = new Date(ey, em, 14);
			const label = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
				+ ' – ' + e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
			periods.push({ start, end, label, key: start });
			sm--;
			if (sm < 0) { sm = 11; sy--; }
		}
		return periods;
	}

	const periods = getBillingPeriods();

	function contractorsForPeriod(start, end) {
		const entries = allEntries.filter(e => e.entry_date >= start && e.entry_date <= end);
		return profiles
			.filter(p => p.role === 'contractor' || p.role === 'admin')
			.map(p => ({
				...p,
				initials: (p.name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
				periodSeconds: entries.filter(e => e.user_id === p.id).reduce((s, e) => s + e.duration_seconds, 0),
				entries: entries.filter(e => e.user_id === p.id).sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
			}))
			.filter(p => p.periodSeconds > 0)
			.sort((a, b) => b.periodSeconds - a.periodSeconds);
	}

	async function loadData() {
		loadRates();
		const cutoff = new Date();
		cutoff.setFullYear(cutoff.getFullYear() - 1);
		const [{ data: pData }, { data: eData }] = await Promise.all([
			supabase.from('profiles').select('id, name, role'),
			supabase.from('time_entries').select('*').gte('entry_date', cutoff.toISOString().slice(0, 10)),
		]);
		if (pData) profiles = pData;
		if (eData) allEntries = eData;
		expandedPeriod = periods[0].key;
	}

	loadData();
</script>

<div class="min-h-screen bg-[#0d0d0d] text-white" style="font-family: 'Diolce-Regular', sans-serif;">
	<nav class="px-6 py-4 flex items-center justify-between" style="border-bottom: 1px dotted rgba(255,255,255,0.25);">
		<span style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.1rem;">hex time</span>
		<div class="flex items-center gap-5">
			<a href="/dashboard" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.45);">my time</a>
			<span style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.7);">admin</span>
		</div>
	</nav>

	<div class="max-w-lg mx-auto px-6 py-10 space-y-12">

		<section>
			<h2 style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.6rem; margin-bottom: 0.25rem;">hourly rates</h2>
			<p class="mb-6" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.35);">
				set per quarter — applied automatically when contractors generate invoices
			</p>

			<div class="flex gap-4 mb-5">
				{#each years as y}
					<button
						onclick={() => ratesYear = y}
						style="font-family: 'Courier', monospace; font-size: 1rem; background: none; border: none; cursor: pointer; padding-bottom: 2px;
						color: {ratesYear === y ? 'white' : 'rgba(255,255,255,0.35)'};
						border-bottom: {ratesYear === y ? '1px solid white' : '1px solid transparent'};"
					>{y}</button>
				{/each}
			</div>

			<div>
				{#each quarters as q}
					{@const key = `${ratesYear}-Q${q}`}
					<div class="flex items-center justify-between py-3" style="border-bottom: 1px dotted rgba(255,255,255,0.12);">
						<span style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.6);">{quarterLabels[q]}</span>
						<div class="flex items-baseline gap-1">
							<span style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">$</span>
							<input
								type="number"
								value={rates[key] ?? ''}
								onchange={(e) => saveRate(key, e.target.value)}
								class="hex-input text-right"
								style="width: 5rem; font-family: 'Courier', monospace;"
								placeholder="—"
								min="0"
								step="0.01"
							/>
							<span style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.3);">/hr</span>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<hr class="hex-divider" />

		<section>
			<h2 style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.6rem; margin-bottom: 1.5rem;">contractor hours</h2>

			{#each periods as period}
				{@const contractors = contractorsForPeriod(period.start, period.end)}
				{@const isOpen = expandedPeriod === period.key}
				{@const totalSecs = contractors.reduce((s, c) => s + c.periodSeconds, 0)}

				<div style="border-bottom: 1px dotted rgba(255,255,255,0.15);">
					<button
						class="w-full text-left py-4 flex items-center justify-between"
						onclick={() => expandedPeriod = isOpen ? null : period.key}
					>
						<span style="font-family: 'Courier', monospace; color: {isOpen ? 'white' : 'rgba(255,255,255,0.5)'};">
							{period.label}
						</span>
						<div class="flex items-center gap-4">
							<span style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">
								{totalSecs > 0 ? fmtDuration(totalSecs) : '—'}
							</span>
							<span style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.25);">
								{isOpen ? '▲' : '▼'}
							</span>
						</div>
					</button>

					{#if isOpen}
						<div class="pb-4">
							{#if contractors.length === 0}
								<p style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.25); padding-left: 0.5rem;">no entries this period</p>
							{:else}
								{#each contractors as c}
									{@const cKey = `${period.key}-${c.id}`}
									{@const cOpen = expandedContractor === cKey}
									<div style="border-top: 1px dotted rgba(255,255,255,0.08);">
										<button
											class="w-full text-left py-3 flex items-center justify-between"
											style="padding-left: 0.5rem;"
											onclick={() => expandedContractor = cOpen ? null : cKey}
										>
											<div class="flex items-center gap-3">
												<span style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3); width: 1.8rem;">{c.initials}</span>
												<span style="font-family: 'Times New Roman', Georgia, serif;">{c.name}</span>
											</div>
											<div class="flex items-center gap-3">
												<span style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.6);">{fmtDuration(c.periodSeconds)}</span>
												<span style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.2);">{cOpen ? '▲' : '▼'}</span>
											</div>
										</button>

										{#if cOpen}
											<div class="pb-3" style="padding-left: 2.8rem;">
												{#each c.entries as entry}
													<div class="flex justify-between py-1" style="border-bottom: 1px dotted rgba(255,255,255,0.07);">
														<div>
															<span style="font-family: 'Times New Roman', Georgia, serif; font-size: 0.95rem;">{entry.description}</span>
															{#if entry.project}
																<span class="ml-2" style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.25);">{entry.project}</span>
															{/if}
														</div>
														<div class="flex gap-3" style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.4);">
															<span>{fmtDate(entry.entry_date)}</span>
															<span>{fmtDuration(entry.duration_seconds)}</span>
														</div>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</section>

	</div>
</div>
