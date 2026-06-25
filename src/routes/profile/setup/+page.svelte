<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';
	import { auth } from '$lib/auth.svelte.js';
	import { goto } from '$app/navigation';

	let name = $state('');
	let displayName = $state('');
	let businessName = $state('');
	let address = $state('');
	let cityStateZip = $state('');
	let invoiceEmail = $state('');
	let phone = $state('');
	let taxId = $state('');
	let paymentMethod = $state('Gusto');
	let paymentDetails = $state('');
	let error = $state('');
	let submitting = $state(false);
	let passkeyStatus = $state('');
	let enrollingPasskey = $state(false);
	let showHomeScreenInstructions = $state(false);

	async function enrollPasskey() {
		enrollingPasskey = true;
		passkeyStatus = '';
		const { error: err } = await supabase.auth.registerPasskey();
		enrollingPasskey = false;
		if (err) {
			passkeyStatus = err.message;
		} else {
			passkeyStatus = '✓ passkey added';
		}
	}

	onMount(async () => {
		if (!auth.session?.user) return;
		const { data } = await supabase.from('profiles').select('*').eq('id', auth.session.user.id).single();
		if (data) {
			name = data.name ?? auth.session.user.user_metadata?.name ?? '';
			displayName = data.display_name ?? '';
			businessName = data.business_name ?? '';
			address = data.address ?? '';
			cityStateZip = data.city_state_zip ?? '';
			invoiceEmail = data.invoice_email ?? auth.session.user.email ?? '';
			phone = data.phone ?? '';
			taxId = data.tax_id ?? '';
			paymentMethod = data.payment_method ?? 'Gusto';
			paymentDetails = data.payment_details ?? '';
		}
	});

	async function save() {
		submitting = true;
		error = '';
		const profileData = {
			id: auth.session.user.id,
			name,
			display_name: displayName || null,
			business_name: businessName,
			address,
			city_state_zip: cityStateZip,
			invoice_email: invoiceEmail,
			phone,
			tax_id: taxId,
			payment_method: paymentMethod,
			payment_details: paymentDetails,
		};
		const firstName = name.trim().split(/\s+/)[0].toLowerCase();
		if (firstName === 'char' || firstName === 'charlotte') {
			profileData.role = 'admin';
			profileData.limited_admin = true;
		}
		const { error: err } = await supabase.from('profiles').upsert(profileData);
		submitting = false;
		if (err) { error = err.message; return; }

		// Apply any matching contractor presets for this first name
		if (firstName) {
			const { data: matchingPresets } = await supabase
				.from('contractor_presets')
				.select('*')
				.eq('name_match', firstName);
			if (matchingPresets?.length) {
				for (const preset of matchingPresets) {
					if (preset.hours_cap != null) {
						await supabase.from('contractor_quarterly_caps').upsert(
							{ user_id: auth.session.user.id, year: preset.year, quarter: preset.quarter, hours_cap: preset.hours_cap },
							{ onConflict: 'user_id,year,quarter', ignoreDuplicates: true }
						);
					}
				}
			}
		}

		goto('/dashboard');
	}
</script>


<div class="min-h-screen bg-[#060606] px-6 py-12">
	<div class="max-w-md mx-auto">

		<a href="/dashboard" style="font-family: 'Courier', monospace; font-size: 0.9rem; color: rgba(255,255,255,0.35); text-decoration: none; display: inline-block; margin-bottom: 1.5rem;">← dashboard</a>

		<h1 class="text-3xl mb-1" style="font-family: 'Skanaus-Display', sans-serif;">invoice setup</h1>
		<p class="mb-2" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">Fill this out once. It will appear on every invoice you generate.</p>
		<hr class="hex-divider my-6" />

		<div style="position: relative; padding: 1rem 1.25rem 1.25rem 1.25rem;">
			<div style="position: absolute; inset: -28px; border-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFQAAABUCAYAAAAcaxDBAAADlklEQVR4Aeyc0W7bQAwE1f7/P6ecIHDmJMeOQrpuky207Wrp453GAhH0Ib+3bXvZqW6XK/Ujoz2Tyz1AF3q56REI0B6/w+oAPSDpBQD9VS2syzyoHO8answis1zDu4Yns8gs1/Cu4cksMss1vGt4MovMcg3vGr6wLBfZRQBdqrnpEQjQHr/D6gA9IOkFAGVOWJd5UK3xruHJLDLLNbxreDKLzHIN7xqezCKzXMO7hiezyCzX8K7hySyyiwBa3HJNEQjQKZJvfQL0DcTUPwD1PMBf5kFtgiezyCzX8K7hySwyyzW8a3gyi8xyDe8answis1zDu4Yns8gs134BtLjlmiIQoFMk3/oE6BuIqX8A6nmAX2ZCbURmpb5tZmA2LwDd8meOQIDOsXztFKCvGOb+AqjnAX6ZCbUVmfXoem25XN4b/+j9z/ZfDgvQJchNj0CA9vgdVgfoAUkvAOjZmcEcsz6z3p/xWvzZJ2CN5d541/BkFpnlGt41PJlFZi3nB+gS5KZHIEB7/A6rA/SApBcA1PMA73mBJ7PILNfwruHJrN6Jj6vdG7//BJnFmSzX8K7hySwyy7X8f+iefveeN7TbI+tFIEAFY8IC1PMAv8yE2oTM6tar5VOv7vlvrgfoU5/uu20eoMPfaIA+AOjNmVD7Tder5aeuv/Wh0efLGzr8tQVogA4TGG7HG+qfMfGjM2X4vI9oxzNbrecH6CMO+WN7BujwVx+gDwDamhl1nv36iv7py/MSvz8/mXWqnjd0+LsP0AAdJjDcjjfU8wJ/ambUeVhjVfS069rGPhu++3w31wP02iGSfZFAgH4R3EfLAvQjMl/MAXpzJlTfbr1aPPXqnv/UeoA+9Wm/2+YBOvyNBugDgPKzmXVqZtR5vBZ/b30tWS7WWEtx4Ma98ffO16rnDR34xtwiQE1jwAfoAES3uAaUOWO1Zkpt1l1fLU5dPjv+3v6j9WtAT50+H14JBOjKo30XoG2Ea4NrQEdnSm3HHLO6/avlcrk3vtu/tf4a0OW0uTlHIEDP8br76QC9i+jcBwDamhm1XdZv77+DBKBb/swRCNA5lq+dAvQVw9xfAOVnNyszcXufidvxd9jDxzK7/N6mAjZ68YaONvzpzQJ0+A0AqOcBfpkJtR+Zlfo6VwvR+wXQ97u4NoEAbSNcGwToyqN9B9D9TNw33dc9T/H/W336+ZZ+AF2C3PQIBGiP32F1gB6Q9II/AAAA//9+qDdLAAAABklEQVQDACxe1JO29rq3AAAAAElFTkSuQmCC') 28 / 28px / 0 round; border-width: 28px; border-style: solid; filter: invert(1); pointer-events: none; z-index: 0;"></div>
		<form class="space-y-8" onsubmit={(e) => { e.preventDefault(); save(); }}>

			<section class="space-y-5">
				<h2 style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em;">Your info</h2>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">full legal name</label>
					<input type="text" bind:value={name} class="hex-input" placeholder="First Last" />
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">display name <span style="color: rgba(255,255,255,0.3);">(optional)</span></label>
					<p style="font-family: 'Courier', monospace; font-size: 0.8rem; color: rgba(255,255,255,0.3); margin-bottom: 0.4rem;">How your name appears to other maintainers. Leave blank to use your full name.</p>
					<input type="text" bind:value={displayName} class="hex-input" placeholder="e.g. Char" />
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">business name <span style="color: rgba(255,255,255,0.3);">(optional)</span></label>
					<input type="text" bind:value={businessName} class="hex-input" placeholder="Your Studio LLC" />
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">mailing address</label>
					<input type="text" bind:value={address} class="hex-input mb-2" placeholder="Street address" />
					<input type="text" bind:value={cityStateZip} class="hex-input" placeholder="City, State, ZIP" />
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">email on invoice</label>
					<input type="email" bind:value={invoiceEmail} class="hex-input" />
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">phone <span style="color: rgba(255,255,255,0.3);">(optional)</span></label>
					<input type="tel" bind:value={phone} class="hex-input" placeholder="555-000-0000" />
				</div>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">tax ID / EIN <span style="color: rgba(255,255,255,0.3);">(optional)</span></label>
					<input type="text" bind:value={taxId} class="hex-input" placeholder="XX-XXXXXXX" />
				</div>
			</section>

			<hr class="hex-divider" />

			<section class="space-y-5">
				<h2 style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em;">Payment info</h2>
				<p style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.35);">How should Hex House pay you?</p>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">payment method</label>
					<select bind:value={paymentMethod} class="hex-select">
						<option value="Gusto">Gusto</option>
						<option value="Other">Other</option>
					</select>
				</div>
				{#if paymentMethod === 'Other'}
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">specify payment method</label>
					<input type="text" bind:value={paymentDetails} class="hex-input" placeholder="Venmo, Zelle, ACH, etc." />
				</div>
				{/if}
			</section>

			<hr class="hex-divider" />

			<section class="space-y-3">
				<h2 style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em;">Passkey</h2>
				<p style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.35);">Add a passkey to sign in with Face ID or Touch ID instead of your password.</p>
				<div class="flex items-center gap-4">
					<button type="button" onclick={enrollPasskey} disabled={enrollingPasskey} class="btn-silver">
						{enrollingPasskey ? '...' : 'add passkey'}
					</button>
					{#if passkeyStatus}
						<span style="font-family: 'Courier', monospace; font-size: 0.9rem; color: {passkeyStatus.startsWith('✓') ? 'rgba(100,220,100,0.8)' : 'rgba(255,100,100,0.8)'};">{passkeyStatus}</span>
					{/if}
				</div>
			</section>

			{#if error}
				<p style="font-family: 'Courier', monospace; color: rgba(255,100,100,0.8);">{error}</p>
			{/if}

			<div class="flex items-center gap-4 pt-2">
				<button type="submit" class="btn-silver" disabled={submitting}>
					{submitting ? '...' : 'Save & go to dashboard'}
				</button>
				<button type="button" onclick={() => goto('/dashboard')} style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.35); background: none; border: none; cursor: pointer;">skip for now</button>
			</div>

		</form>
		</div>

		<div style="margin-top: 3rem; border-top: 1px dotted rgba(255,255,255,0.1); padding-top: 1.5rem;">
			<button
				onclick={() => showHomeScreenInstructions = !showHomeScreenInstructions}
				style="font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.3); background: none; border: none; cursor: pointer; padding: 0;"
			>{showHomeScreenInstructions ? '▲ hide' : '↓ Add time.hexhouse.studio to home screen (iPhone)'}</button>

			{#if showHomeScreenInstructions}
				<ol style="margin-top: 1rem; font-family: 'Courier', monospace; font-size: 0.82rem; color: rgba(255,255,255,0.45); line-height: 1.9; padding-left: 1.25rem;">
					<li>Open the Shortcuts app.</li>
					<li>Tap + to create a new shortcut.</li>
					<li>Tap Add Action.</li>
					<li>Search for and select Open URLs.</li>
					<li>Enter: <span style="color: rgba(255,255,255,0.65);">https://time.hexhouse.studio/dashboard</span></li>
					<li>Tap the ⓘ (or the dropdown/arrow at the top, depending on your iOS version).</li>
					<li>Choose Add to Home Screen.</li>
					<li>Tap the Home Screen icon to choose your own image.</li>
					<li>Rename it to Time.Hex, time.hex, or whatever you'd like.</li>
				</ol>
			{/if}
		</div>

	</div>

</div>
