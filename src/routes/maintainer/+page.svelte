<script>
	import { supabase } from '$lib/supabase.js';

	const PROJECT_COLORS = {
		'Space/Facilities/Infrastructure': '#7eb8d4',
		'Membership':                  '#a8d8a8',
		'Public Messaging':            '#f4a261',
		'Events':                      '#e76f51',
		'Maintainer Meeting':          '#c9b8f0',
		'Finance':                     '#ffd166',
		'Organizational Stewardship':  '#06d6a0',
		'Residency':                   '#ef476f',
	};

	function fmtDuration(s) {
		const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
		if (h > 0 && m > 0) return `${h}h ${m}m`;
		if (h > 0) return `${h}h`;
		return `${m}m`;
	}

	function getBillingPeriods() {
		const periods = [];
		const now = new Date();
		let sm = now.getDate() >= 15 ? now.getMonth() : now.getMonth() - 1;
		let sy = now.getFullYear();
		if (sm < 0) { sm = 11; sy--; }
		for (let i = 0; i < 13; i++) {
			let em = sm + 1, ey = sy;
			if (em > 11) { em = 0; ey++; }
			const start = `${sy}-${String(sm + 1).padStart(2, '0')}-15`;
			const end = `${ey}-${String(em + 1).padStart(2, '0')}-14`;
			const s = new Date(sy, sm, 15), e = new Date(ey, em, 14);
			const label = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
				+ ' – ' + e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
			periods.push({ start, end, label, key: start });
			sm--; if (sm < 0) { sm = 11; sy--; }
		}
		return periods.filter(p => p.start >= '2026-02-15');
	}

	const periods = getBillingPeriods();

	let selectedKey = $state(periods[0].key);
	let slices = $state([]);
	let totalSeconds = $state(0);
	let loading = $state(false);

	$effect(() => {
		selectedKey;
		loadData();
	});

	async function loadData() {
		loading = true;
		const period = periods.find(p => p.key === selectedKey);
		const { data } = await supabase
			.from('time_entries')
			.select('project, duration_seconds')
			.gte('entry_date', period.start)
			.lte('entry_date', period.end);

		if (data) {
			const groups = {};
			for (const e of data) {
				const proj = e.project || 'Uncategorized';
				groups[proj] = (groups[proj] || 0) + e.duration_seconds;
			}
			const total = Object.values(groups).reduce((s, v) => s + v, 0);
			totalSeconds = total;

			let angle = -Math.PI / 2;
			slices = Object.entries(groups)
				.map(([project, seconds]) => ({ project, seconds, color: PROJECT_COLORS[project] ?? '#888888' }))
				.sort((a, b) => b.seconds - a.seconds)
				.map(d => {
					const sweep = total > 0 ? (d.seconds / total) * 2 * Math.PI : 0;
					const s = { ...d, angle, sweep, pct: total > 0 ? ((d.seconds / total) * 100).toFixed(1) : '0' };
					angle += sweep;
					return s;
				});
		}
		loading = false;
	}

	const CX = 130, CY = 130, OR = 110, IR = 58;

	function donutPath(startAngle, sweep) {
		if (sweep >= 2 * Math.PI - 0.001) {
			return `M ${CX + OR} ${CY} A ${OR} ${OR} 0 1 1 ${CX - OR} ${CY} A ${OR} ${OR} 0 1 1 ${CX + OR} ${CY}
			        M ${CX + IR} ${CY} A ${IR} ${IR} 0 1 0 ${CX - IR} ${CY} A ${IR} ${IR} 0 1 0 ${CX + IR} ${CY} Z`;
		}
		const ox1 = CX + OR * Math.cos(startAngle),   oy1 = CY + OR * Math.sin(startAngle);
		const ox2 = CX + OR * Math.cos(startAngle + sweep), oy2 = CY + OR * Math.sin(startAngle + sweep);
		const ix1 = CX + IR * Math.cos(startAngle),   iy1 = CY + IR * Math.sin(startAngle);
		const ix2 = CX + IR * Math.cos(startAngle + sweep), iy2 = CY + IR * Math.sin(startAngle + sweep);
		const lg = sweep > Math.PI ? 1 : 0;
		return `M ${ox1} ${oy1} A ${OR} ${OR} 0 ${lg} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${IR} ${IR} 0 ${lg} 0 ${ix1} ${iy1} Z`;
	}
</script>

<div class="min-h-screen bg-[#0d0d0d] text-white" style="font-family: 'Diolce-Regular', sans-serif;">

	<nav class="px-6 py-4 flex items-center justify-between" style="border-bottom: 1px dotted rgba(255,255,255,0.2);">
		<span style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.1rem;">hex time</span>
		<div class="flex gap-5">
			<a href="/dashboard" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">← dashboard</a>
		</div>
	</nav>

	<div class="max-w-lg mx-auto px-6 py-10">

		<div class="flex items-start justify-between mb-8">
			<div>
				<h2 style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.6rem;">maintainers</h2>
				<p style="font-family: 'Courier', monospace; font-size: 0.78rem; color: rgba(255,255,255,0.35); margin-top: 0.2rem;">aggregated hours logged per payment period</p>
			</div>
			<select
				bind:value={selectedKey}
				class="hex-select"
				style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.6);"
			>
				{#each periods as p}
					<option value={p.key}>{p.label}</option>
				{/each}
			</select>
		</div>


		{#if loading}
			<p style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.3);">loading...</p>
		{:else if slices.length === 0}
			<p style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.3);">no entries this period</p>
		{:else}

			<!-- Donut chart -->
			<div style="display: flex; justify-content: center; margin-bottom: 2rem;">
				<svg viewBox="0 0 260 260" width="260" height="260">
					{#each slices as slice}
						<path
							d={donutPath(slice.angle, slice.sweep)}
							fill={slice.color}
							opacity="0.85"
						/>
					{/each}
					<!-- Center label -->
					<text x={CX} y={CY - 6} text-anchor="middle" style="font-family: 'Courier', monospace; font-size: 11px; fill: rgba(255,255,255,0.35);">total</text>
					<text x={CX} y={CY + 12} text-anchor="middle" style="font-family: 'Courier', monospace; font-size: 15px; fill: white;">{fmtDuration(totalSeconds)}</text>
				</svg>
			</div>

			<!-- Legend -->
			<div class="space-y-2">
				{#each slices as slice}
					<div class="flex items-center justify-between py-2" style="border-bottom: 1px dotted rgba(255,255,255,0.08);">
						<div class="flex items-center gap-3">
							<span style="width: 10px; height: 10px; border-radius: 50%; background: {slice.color}; display: inline-block; flex-shrink: 0;"></span>
							<span style="font-family: 'Times New Roman', Georgia, serif; font-size: 0.95rem;">{slice.project}</span>
						</div>
						<div class="flex gap-4" style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.5);">
							<span>{fmtDuration(slice.seconds)}</span>
							<span style="width: 3.5rem; text-align: right;">{slice.pct}%</span>
						</div>
					</div>
				{/each}
			</div>

		{/if}
	</div>
</div>
