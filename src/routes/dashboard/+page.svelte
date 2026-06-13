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
	let decimalHours = $state('');
	let decimalMode = $state(false);
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
		let duration;
		if (decimalMode) {
			duration = Math.round((parseFloat(decimalHours) || 0) * 3600);
		} else {
			duration = (parseInt(hours) || 0) * 3600 + (parseInt(minutes) || 0) * 60;
		}
		if (!description || duration === 0) return;
		await saveEntry(description, project || 'Other', duration, entryDate || today());
		description = ''; project = ''; hours = ''; minutes = ''; decimalHours = ''; entryDate = today();
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

	// Bulk import
	let showImport = $state(false);
	let importText = $state('');
	let importStage = $state('paste'); // 'paste' | 'categorize'
	let stagedEntries = $state([]);
	let batchProject = $state('');
	let importing = $state(false);
	let importDone = $state(null);

	const monthMap = {
		january: '01', february: '02', march: '03', april: '04',
		may: '05', june: '06', july: '07', august: '08',
		september: '09', october: '10', november: '11', december: '12'
	};

	const parsedImport = $derived(() => {
		const year = new Date().getFullYear();
		let currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
		const results = [];
		const skipped = [];
		for (const raw of importText.split('\n')) {
			const line = raw.trim();
			const monthKey = line.toLowerCase().replace(/[^a-z]/g, '');
			if (monthMap[monthKey]) { currentMonth = monthMap[monthKey]; continue; }
			if (!line.startsWith('-')) continue;
			const content = line.slice(1).trim();
			if (!content) continue;
			const match = content.match(/^(.+?)\s+([\d.]+)\s*$/);
			if (!match) { skipped.push(content); continue; }
			const desc = match[1].trim();
			const hrs = parseFloat(match[2]);
			if (!desc || isNaN(hrs) || hrs <= 0) { skipped.push(content); continue; }
			results.push({
				description: desc,
				duration_seconds: Math.round(hrs * 3600),
				entry_date: `${year}-${currentMonth}-01`,
			});
		}
		return { results, skipped };
	});

	function guessProject(desc) {
		const d = desc.toLowerCase();
		if (/meeting|mtg|sync|standup/.test(d)) return 'Maintainer Meeting';
		if (/finance|payment|invoice|stripe|gusto|bank|account|budget|expense/.test(d)) return 'Finance';
		if (/member|membership|contract|onboard/.test(d)) return 'Membership';
		if (/event|party|fundrais|shiv|nye|celebrat|gather/.test(d)) return 'Events';
		if (/clean|bathroom|kitchen|trash|facilit|infra|fix|repair|build|install|plumb|electric/.test(d)) return 'Space/Facilities/Infra';
		if (/newsletter|instagram|social|post|promo|messag|website|flyer|announc|photo|video/.test(d)) return 'Public Messaging';
		if (/residency|resident/.test(d)) return 'Residency';
		return 'Organizational Stewardship';
	}

	function stageForCategorization() {
		const { results } = parsedImport();
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
			<div class="flex items-center mb-7">
				<div style="display: inline-flex; border: 1px dotted rgba(255,255,255,0.25); font-family: 'Courier', monospace; font-size: 1rem;">
					<button
						onclick={() => { mode = 'manual'; if (running) toggleTimer(); }}
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
							style="font-family: 'Times New Roman', Georgia, serif; font-size: 1rem;"
							placeholder="work description..."
							onkeydown={(e) => e.key === 'Enter' && logManual()}
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
						<button class="btn-silver" onclick={logManual}>+ log entry</button>
						<button
							onclick={() => decimalMode = !decimalMode}
							style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3); background: none; border: none; cursor: pointer;"
						>{decimalMode ? 'switch to h/min' : 'switch to decimal (1.5h)'}</button>
					</div>
				</div>

			{:else}
				<div class="space-y-5">
					<div class="py-3 text-center">
						<span style="font-family: 'Courier', monospace; font-size: 3.5rem; letter-spacing: 0.06em;">{fmt(elapsed)}</span>
					</div>
					<div>
						<input type="text" bind:value={description} disabled={running} class="hex-input" style="font-family: 'Times New Roman', Georgia, serif; font-size: 1rem;" placeholder="work description..." />
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

		<!-- Bulk import -->
		<div class="mb-6">
			<button
				onclick={() => { showImport = !showImport; importDone = null; if (!showImport) { importStage = 'paste'; stagedEntries = []; } }}
				style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.25); background: none; border: none; cursor: pointer; padding: 0;"
			>{showImport ? '▲ close import' : '↓ import from notes'}</button>

			{#if showImport}
				<div class="mt-4 space-y-4">

					{#if importStage === 'paste'}
						<textarea
							bind:value={importText}
							rows="10"
							class="hex-input"
							style="width: 100%; font-family: 'Courier', monospace; font-size: 0.82rem; resize: vertical; background: rgba(255,255,255,0.03); padding: 0.5rem;"
							placeholder="paste your notes here — entries like '- did the thing 1.5' will be detected"
						></textarea>

						{#if parsedImport().results.length > 0}
							<div class="flex items-center gap-4">
								<p style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.35);">
									{parsedImport().results.length} entries detected
								</p>
								<button class="btn-silver" onclick={stageForCategorization} style="font-size: 0.82rem;">
									categorize →
								</button>
							</div>
						{/if}

						{#if parsedImport().skipped.length > 0}
							<div>
								<p style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,150,100,0.6); margin-bottom: 0.3rem;">
									{parsedImport().skipped.length} lines skipped (no hours found):
								</p>
								{#each parsedImport().skipped as s}
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
