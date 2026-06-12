<script>
	import { supabase } from '$lib/supabase.js';
	import { goto } from '$app/navigation';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirm = $state('');
	let error = $state('');
	let submitting = $state(false);

	async function signUp() {
		if (password !== confirm) { error = 'Passwords do not match.'; return; }
		submitting = true;
		error = '';
		const { error: err } = await supabase.auth.signUp({
			email,
			password,
			options: { data: { name } }
		});
		submitting = false;
		if (err) { error = err.message; return; }
		goto('/profile/setup');
	}
</script>

<div class="min-h-screen bg-black flex items-center justify-center px-4">
	<div class="w-full max-w-xs">

		<h1 class="text-3xl mb-1 text-center" style="font-family: 'Skanaus-Display', sans-serif;">create account</h1>
		<p class="text-center mb-10" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">Hex House · time tracking</p>

		<form class="space-y-6" onsubmit={(e) => { e.preventDefault(); signUp(); }}>
			<div>
				<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">your name</label>
				<input type="text" bind:value={name} class="hex-input" placeholder="First Last" required />
			</div>
			<div>
				<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">email</label>
				<input type="email" bind:value={email} class="hex-input" placeholder="you@example.com" required />
			</div>
			<div>
				<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">password</label>
				<input type="password" bind:value={password} class="hex-input" placeholder="••••••••" required />
			</div>
			<div>
				<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">confirm password</label>
				<input type="password" bind:value={confirm} class="hex-input" placeholder="••••••••" required />
			</div>
			{#if error}
				<p style="font-family: 'Courier', monospace; color: rgba(255,100,100,0.8);">{error}</p>
			{/if}
			<div class="flex items-center gap-3 pt-2">
				<button type="submit" class="btn-silver" disabled={submitting}>
					{submitting ? '...' : 'Create account'}
				</button>
				<a href="/" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">← sign in</a>
			</div>
		</form>

		<p class="mt-8" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.3); border-top: 1px dotted rgba(255,255,255,0.15); padding-top: 1rem;">
			After creating your account, you'll fill in your invoice details once.
		</p>

	</div>
</div>
