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
		await supabase.auth.registerPasskey().catch(() => {});
		goto('/profile/setup');
	}
</script>

<div class="min-h-screen bg-[#060606] flex items-center justify-center px-4">
	<div class="w-full max-w-xs">

		<h1 class="text-3xl mb-1 text-center" style="font-family: 'Skanaus-Display', sans-serif;">create account</h1>
		<p class="text-center mb-10" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.4);">Hex House · time tracking</p>

		<div style="position: relative; padding: 1rem 1.25rem 1.25rem 1.25rem;">
			<div style="position: absolute; inset: -28px; border-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFQAAABUCAYAAAAcaxDBAAADlklEQVR4Aeyc0W7bQAwE1f7/P6ecIHDmJMeOQrpuky207Wrp453GAhH0Ib+3bXvZqW6XK/Ujoz2Tyz1AF3q56REI0B6/w+oAPSDpBQD9VS2syzyoHO8answis1zDu4Yns8gs1/Cu4cksMss1vGt4MovMcg3vGr6wLBfZRQBdqrnpEQjQHr/D6gA9IOkFAGVOWJd5UK3xruHJLDLLNbxreDKLzHIN7xqezCKzXMO7hiezyCzX8K7hySyyiwBa3HJNEQjQKZJvfQL0DcTUPwD1PMBf5kFtgiezyCzX8K7hySwyyzW8a3gyi8xyDe8answis1zDu4Yns8gs134BtLjlmiIQoFMk3/oE6BuIqX8A6nmAX2ZCbURmpb5tZmA2LwDd8meOQIDOsXztFKCvGOb+AqjnAX6ZCbUVmfXoem25XN4b/+j9z/ZfDgvQJchNj0CA9vgdVgfoAUkvAOjZmcEcsz6z3p/xWvzZJ2CN5d541/BkFpnlGt41PJlFZi3nB+gS5KZHIEB7/A6rA/SApBcA1PMA73mBJ7PILNfwruHJrN6Jj6vdG7//BJnFmSzX8K7hySwyy7X8f+iefveeN7TbI+tFIEAFY8IC1PMAv8yE2oTM6tar5VOv7vlvrgfoU5/uu20eoMPfaIA+AOjNmVD7Tder5aeuv/Wh0efLGzr8tQVogA4TGG7HG+qfMfGjM2X4vI9oxzNbrecH6CMO+WN7BujwVx+gDwDamhl1nv36iv7py/MSvz8/mXWqnjd0+LsP0AAdJjDcjjfU8wJ/ambUeVhjVfS069rGPhu++3w31wP02iGSfZFAgH4R3EfLAvQjMl/MAXpzJlTfbr1aPPXqnv/UeoA+9Wm/2+YBOvyNBugDgPKzmXVqZtR5vBZ/b30tWS7WWEtx4Ma98ffO16rnDR34xtwiQE1jwAfoAES3uAaUOWO1Zkpt1l1fLU5dPjv+3v6j9WtAT50+H14JBOjKo30XoG2Ea4NrQEdnSm3HHLO6/avlcrk3vtu/tf4a0OW0uTlHIEDP8br76QC9i+jcBwDamhm1XdZv77+DBKBb/swRCNA5lq+dAvQVw9xfAOVnNyszcXufidvxd9jDxzK7/N6mAjZ68YaONvzpzQJ0+A0AqOcBfpkJtR+Zlfo6VwvR+wXQ97u4NoEAbSNcGwToyqN9B9D9TNw33dc9T/H/W336+ZZ+AF2C3PQIBGiP32F1gB6Q9II/AAAA//9+qDdLAAAABklEQVQDACxe1JO29rq3AAAAAElFTkSuQmCC') 28 / 28px / 0 round; border-width: 28px; border-style: solid; filter: invert(1); pointer-events: none; z-index: 0;"></div>
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
		</div>

		<p class="mt-8" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.3); border-top: 1px dotted rgba(255,255,255,0.15); padding-top: 1rem;">
			After that, you'll be able to add your invoicing information so invoices can be generated directly through time.hex
		</p>

	</div>
</div>
