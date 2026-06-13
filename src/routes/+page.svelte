<script>
	import { supabase } from '$lib/supabase.js';
	import { goto } from '$app/navigation';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let submitting = $state(false);

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
		const { error: err } = await supabase.auth.signInWithPasskey({ email });
		if (err) { error = err.message; return; }
		goto('/dashboard');
	}
</script>

<svelte:head>
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pinyon+Script&display=swap">
</svelte:head>

<div class="min-h-screen bg-black flex items-center justify-center px-4">
	<div class="w-full max-w-xs text-center">

		<h1 class="mb-1" style="font-size: 3rem; line-height: 1; display: flex; align-items: center; justify-content: center; gap: 0.15em;">
			<span style="font-family: 'Pinyon Script', cursive;">hex</span>
			<img src="/assets/timer.png" alt="" style="width: 0.8em; display: inline-block;" />
			<span style="font-family: 'Skanaus-Display', sans-serif;">time</span>
		</h1>
		<p class="text-sm mb-8" style="color: rgba(255,255,255,0.5);">Hex House · time tracking</p>

		<div style="border: 12px solid transparent; border-image: url('/assets/timer.png') 100%; padding: 2rem;">
			<form class="space-y-6 text-left" onsubmit={(e) => { e.preventDefault(); signIn(); }}>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">email</label>
					<input type="email" bind:value={email} class="hex-input" placeholder="you@example.com" required />
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">password</label>
					<input type="password" bind:value={password} class="hex-input" placeholder="••••••••" required />
				</div>
				{#if error}
					<p style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,100,100,0.8);">{error}</p>
				{/if}
				<div class="flex items-center gap-3 pt-2">
					<button type="submit" class="btn-silver" disabled={submitting}>
						{submitting ? '...' : 'Sign in'}
					</button>
					<a href="/signup" style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.5);">create account →</a>
				</div>
			</form>

			<div class="mt-6 pt-5" style="border-top: 1px dotted rgba(255,255,255,0.2);">
				<button class="btn-ghost" onclick={signInWithPasskey}>
					sign in with passkey
				</button>
			</div>
		</div>

	</div>
</div>
