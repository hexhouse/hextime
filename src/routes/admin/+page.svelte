<script>
	import { supabase } from '$lib/supabase.js';
	import { rates, loadRates, saveRate, quarterLabels } from '$lib/rates.svelte.js';

	let contractors = $state([]);
	let expanded = $state(null);
	let ratesYear = $state(new Date().getFullYear());
	const years = [ratesYear, ratesYear + 1];
	const quarters = [1, 2, 3, 4];

	function fmtDuration(s) {
		const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
		if (h > 0 && m > 0) return `${h}h ${m}m`;
		if (h > 0) return `${h}h`;
		return `${m}m`;
	}

	async function loadContractors() {
		const { data: profiles } = await supabase
			.from('profiles')
			.select('id, name, role');

		if (!profiles) return;

		const today = new Date().toISOString().slice(0, 10);
		const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

		const { data: entries } = await supabase
			.from('time_entries')
			.select('*')
			.gte('entry_date', weekAgo);

		contractors = profiles
			.filter(p => p.role === 'contractor')
			.map(p => {
				const mine = (entries ?? []).filter(e => e.user_id === p.id);
				return {
					...p,
					initials: (p.name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
					todaySeconds: mine.filter(e => e.entry_date === today).reduce((s, e) => s + e.duration_seconds, 0),
					weekSeconds: mine.reduce((s, e) => s + e.duration_seconds, 0),
					entries: mine.slice(0, 5),
				};
			});
	}

	loadRates();
	loadContractors();

	const totalWeekSeconds = $derived(contractors.reduce((s, c) => s + c.weekSeconds, 0));
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
			<h2 style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.6rem; margin-bottom: 0.25rem;">contractor hours</h2>
			<p class="mb-6" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.35);">this week</p>

			<div class="flex gap-8 mb-8" style="font-family: 'Courier', monospace;">
				<div>
					<p style="color: rgba(255,255,255,0.4);">total</p>
					<p class="text-2xl">{fmtDuration(totalWeekSeconds)}</p>
				</div>
				<div>
					<p style="color: rgba(255,255,255,0.4);">active today</p>
					<p class="text-2xl">{contractors.filter(c => c.todaySeconds > 0).length}</p>
				</div>
				<div>
					<p style="color: rgba(255,255,255,0.4);">contractors</p>
					<p class="text-2xl">{contractors.length}</p>
				</div>
			</div>

			<div>
				{#each contractors as c}
					<div style="border-bottom: 1px dotted rgba(255,255,255,0.15);">
						<button
							class="w-full text-left py-4 flex items-center justify-between"
							onclick={() => expanded = expanded === c.id ? null : c.id}
						>
							<div class="flex items-center gap-3">
								<span style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.35); width: 2rem;">{c.initials}</span>
								<div>
									<p style="font-family: 'Times New Roman', Georgia, serif; font-size: 1rem;">{c.name}</p>
									<p style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.35);">today: {fmtDuration(c.todaySeconds)}</p>
								</div>
							</div>
							<div class="flex items-center gap-4">
								<span style="font-family: 'Courier', monospace;">{fmtDuration(c.weekSeconds)}</span>
								<span style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.3);">{expanded === c.id ? '▲' : '▼'}</span>
							</div>
						</button>

						{#if expanded === c.id}
							<div class="pb-4 pl-10 space-y-1">
								{#each c.entries as entry}
									<div class="flex justify-between py-1" style="border-bottom: 1px dotted rgba(255,255,255,0.08);">
										<div>
											<span style="font-family: 'Times New Roman', Georgia, serif;">{entry.description}</span>
											<span class="ml-2" style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3);">{entry.project}</span>
										</div>
										<span style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.5);">{fmtDuration(entry.duration_seconds)}</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				{#if contractors.length === 0}
					<p style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.3);">no contractors yet</p>
				{/if}
			</div>
		</section>

	</div>
</div>
