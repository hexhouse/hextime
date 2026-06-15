<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';
	import { goto } from '$app/navigation';

	onMount(() => {
		document.documentElement.style.fontSize = '16px';
		return () => { document.documentElement.style.fontSize = ''; };
	});

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let submitting = $state(false);
	let showPassword = $state(false);

	async function signIn() {
		submitting = true;
		error = '';
		const { error: err } = await supabase.auth.signInWithPassword({ email, password });
		submitting = false;
		if (err) { error = err.message; return; }
		goto('/dashboard');
	}

	async function signInWithPasskey() {
		error = '';
		submitting = true;
		const { error: err } = await supabase.auth.signInWithPasskey({ email });
		submitting = false;
		if (err) { error = err.message; return; }
		goto('/dashboard');
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pinyon+Script&display=swap">
</svelte:head>

<style>
	@media (min-width: 768px) {
		.login-title { font-size: 4rem !important; }
		.login-title .time-word { font-size: 3.5rem !important; }
	}
</style>

<div class="min-h-screen bg-[#060606] flex flex-col items-center justify-center px-4">

	<h1 class="login-title mb-8" style="font-size: 3rem; font-family: 'Skanaus-Display', sans-serif; line-height: 1.3; text-align: center; white-space: nowrap;">
		<span style="font-family: 'Pinyon Script', cursive;">HEX</span>&nbsp;<span style="display: inline-block; border: 8px solid transparent; border-image: url('/assets/timer.png') 100%; vertical-align: middle; line-height: 0; margin-left: 0.25em;"><img src="/assets/timer.png" alt="" style="width: 0.8em; display: block;" /></span>&nbsp;<span class="time-word" style="font-size: 2.5rem;">TIME</span>
	</h1>

	<div class="w-full max-w-xs text-center">
		<div style="border: 12px solid transparent; border-image: url('/assets/timer.png') 100%; padding: 2rem;">
			<div class="space-y-6 text-left">
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">email</label>
					<input type="email" bind:value={email} class="hex-input" placeholder="you@example.com" />
				</div>

				{#if error}
					<p style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,100,100,0.8);">{error}</p>
				{/if}

				<div class="flex items-center gap-3 pt-1">
					<button class="btn-silver" onclick={signInWithPasskey} disabled={submitting}>
						{submitting && !showPassword ? '...' : 'sign in with passkey'}
					</button>
					<a href="/signup" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.5);">create account →</a>
				</div>

				{#if !showPassword}
					<button
						onclick={() => showPassword = true}
						style="font-family: 'Courier', monospace; font-size: 0.78rem; color: rgba(255,255,255,0.25); background: none; border: none; cursor: pointer; padding: 0;"
					>use password instead</button>
				{:else}
					<form class="space-y-4" onsubmit={(e) => { e.preventDefault(); signIn(); }}>
						<div>
							<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">password</label>
							<input type="password" bind:value={password} class="hex-input" placeholder="••••••••" required />
						</div>
						<div class="flex items-center gap-3">
							<button type="submit" class="btn-silver" disabled={submitting}>
								{submitting ? '...' : 'sign in'}
							</button>
							<button
								type="button"
								onclick={() => showPassword = false}
								style="font-family: 'Courier', monospace; font-size: 0.78rem; color: rgba(255,255,255,0.25); background: none; border: none; cursor: pointer; padding: 0;"
							>← back</button>
						</div>
					</form>
				{/if}
			</div>
		</div>
	</div>

	<img src="/assets/hextime-atm.png" alt="" style="width: 100%; max-width: 220px; margin-top: 4rem; display: block;" />

</div>
