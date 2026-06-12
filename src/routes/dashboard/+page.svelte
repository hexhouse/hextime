<script>
	import { supabase } from '$lib/supabase.js';
	import { auth } from '$lib/auth.svelte.js';
	import { goto } from '$app/navigation';

	let mode = $state('manual');
	let running = $state(false);
	let startTime = $state(null);
	let elapsed = $state(0);
	let timerInterval = null;

	let description = $state('');
	let project = $state('');
	let hours = $state('');
	let minutes = $state('');
	let entryDate = $state(today());

	let entries = $state([]);

	const projects = ['Space/Facilities/Infra', 'Membership', 'Public Messaging', 'Events', 'Maintainer Meeting', 'Finance', 'Organizational Stewardship', 'Residency'];

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
			.order('entry_date', { ascending: false })
			.order('created_at', { ascending: false });
		if (data) entries = data;
	}

	$effect(() => {
		if (auth.session?.user) loadEntries();
	});

	function toggleTimer() {
		if (running) {
			if (elapsed > 0) saveEntry(description || 'Untitled', project || 'Other', elapsed, today());
			clearInterval(timerInterval);
			elapsed = 0; startTime = null; description = ''; project = '';
		} else {
			startTime = Date.now();
			timerInterval = setInterval(() => { elapsed = Math.floor((Date.now() - startTime) / 1000); }, 1000);
		}
		running = !running;
	}

	async function logManual() {
		const h = parseInt(hours) || 0;
		const m = parseInt(minutes) || 0;
		const duration = h * 3600 + m * 60;
		if (!description || duration === 0) return;
		await saveEntry(description, project || 'Other', duration, entryDate || today());
		description = ''; project = ''; hours = ''; minutes = ''; entryDate = today();
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

	const todayTotal = $derived(
		entries.filter(e => e.entry_date === today()).reduce((s, e) => s + e.duration_seconds, 0) + (running ? elapsed : 0)
	);

	const groupedEntries = $derived(() => {
		const groups = {};
		for (const e of entries) {
			if (!groups[e.entry_date]) groups[e.entry_date] = [];
			groups[e.entry_date].push(e);
		}
		return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
	});
</script>

<div class="min-h-screen bg-black text-white">

	<nav class="px-6 py-4 flex items-center justify-between" style="border-bottom: 1px dotted rgba(255,255,255,0.2);">
		<span style="font-family: 'Skanaus-Display', sans-serif; font-size: 1.1rem;">hex time</span>
		<div class="flex gap-5">
			<a href="/invoice" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">invoice</a>
			<a href="/profile/setup" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">profile</a>
			<a href="/admin" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">admin</a>
			<button onclick={signOut} style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4); background: none; border: none; cursor: pointer;">sign out</button>
		</div>
	</nav>

	<div class="max-w-lg mx-auto px-6 py-10">

		<section class="mb-12">
			<div class="flex gap-5 mb-7" style="border-bottom: 1px dotted rgba(255,255,255,0.15); padding-bottom: 0.75rem;">
				<button
					onclick={() => { mode = 'manual'; if (running) toggleTimer(); }}
					style="font-family: 'Courier', monospace; font-size: 1rem; background: none; border: none; cursor: pointer; padding-bottom: 2px;
					color: {mode === 'manual' ? 'white' : 'rgba(255,255,255,0.35)'};
					border-bottom: {mode === 'manual' ? '1px solid white' : '1px solid transparent'};"
				>log time</button>
				<button
					onclick={() => mode = 'timer'}
					style="font-family: 'Courier', monospace; font-size: 1rem; background: none; border: none; cursor: pointer; padding-bottom: 2px;
					color: {mode === 'timer' ? 'white' : 'rgba(255,255,255,0.35)'};
					border-bottom: {mode === 'timer' ? '1px solid white' : '1px solid transparent'};"
				>timer</button>
			</div>

			{#if mode === 'manual'}
				<div class="space-y-5">
					<div>
						<input
							type="text"
							bind:value={description}
							class="hex-input"
							style="font-family: 'Times New Roman', Georgia, serif; font-size: 1rem;"
							placeholder="describe the work..."
							onkeydown={(e) => e.key === 'Enter' && logManual()}
						/>
					</div>
					<div class="flex gap-6 flex-wrap items-end">
						<div>
							<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">hours</label>
							<input type="number" bind:value={hours} class="hex-input" placeholder="0" min="0" style="width: 3.5rem;" />
						</div>
						<div>
							<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">min</label>
							<input type="number" bind:value={minutes} class="hex-input" placeholder="0" min="0" max="59" style="width: 3.5rem;" />
						</div>
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
					<button class="btn-silver" onclick={logManual}>+ log entry</button>
				</div>

			{:else}
				<div class="space-y-5">
					<div class="py-3 text-center">
						<span style="font-family: 'Courier', monospace; font-size: 3.5rem; letter-spacing: 0.06em;">{fmt(elapsed)}</span>
					</div>
					<div>
						<input type="text" bind:value={description} disabled={running} class="hex-input" style="font-family: 'Times New Roman', Georgia, serif; font-size: 1rem;" placeholder="describe the work..." />
					</div>
					<div>
						<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">project</label>
						<select bind:value={project} disabled={running} class="hex-select">
							<option value="">—</option>
							{#each projects as p}<option value={p}>{p}</option>{/each}
						</select>
					</div>
					<button
						onclick={toggleTimer}
						style="background: none; border: 1px dotted {running ? 'rgba(255,100,100,0.5)' : 'rgba(255,255,255,0.4)'}; color: {running ? 'rgba(255,120,120,0.9)' : 'white'}; font-family: 'Courier', monospace; padding: 0.3em 0.9em; cursor: pointer;"
					>{running ? '■ stop' : '▶ start'}</button>
				</div>
			{/if}
		</section>

		<div class="flex items-center gap-3 mb-8">
			<hr class="flex-1 hex-divider" />
			<span style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.35);">today: {fmtDuration(todayTotal)}</span>
			<hr class="flex-1 hex-divider" />
		</div>

		<section>
			{#each groupedEntries() as [date, group]}
				<div class="mb-8">
					<p class="mb-3" style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3);">
						{fmtDate(date)} — {fmtDuration(group.reduce((s, e) => s + e.duration_seconds, 0))}
					</p>
					{#each group as entry}
						<div class="flex items-baseline justify-between py-2" style="border-bottom: 1px dotted rgba(255,255,255,0.1);">
							<div class="flex items-baseline gap-3">
								<span style="font-family: 'Times New Roman', Georgia, serif; font-size: 1rem;">{entry.description}</span>
								{#if entry.project}
									<span style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3);">{entry.project}</span>
								{/if}
							</div>
							<span style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.55);">{fmtDuration(entry.duration_seconds)}</span>
						</div>
					{/each}
				</div>
			{/each}
		</section>

	</div>

	<div class="fixed bottom-4 right-5">
		<a href="https://docs.google.com/document/d/103PKUMAJ1aXdLwx6XYLSUxXY11OVc16D8GhGrR8aIzg/edit?usp=sharing" target="_blank" rel="noopener" style="font-family: 'Courier', monospace; font-size: 0.75rem; color: rgba(255,255,255,0.2); text-decoration: none;">maintainer roles ↗</a>
	</div>
</div>
