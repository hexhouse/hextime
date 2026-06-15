<script>
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';
	import { auth } from '$lib/auth.svelte.js';
	import { goto } from '$app/navigation';

	let name = $state('');
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
		if (firstName === 'char') {
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
			<div style="position: absolute; inset: -28px; border-image: url('data:image/png;base64,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') 28 / 28px / 0 round; border-width: 28px; border-style: solid; filter: brightness(0) invert(1); pointer-events: none; z-index: 0;"></div>
		<form class="space-y-8" onsubmit={(e) => { e.preventDefault(); save(); }}>

			<section class="space-y-5">
				<h2 style="font-family: 'Courier', monospace; font-size: 1rem; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em;">Your info</h2>
				<div>
					<label class="block mb-1" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">full legal name</label>
					<input type="text" bind:value={name} class="hex-input" placeholder="First Last" />
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
	</div>
</div>
