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
		const { error: err } = await supabase.from('profiles').upsert({
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
		});
		submitting = false;
		if (err) { error = err.message; return; }
		goto('/dashboard');
	}
</script>

<div class="min-h-screen bg-[#0d0d0d] px-6 py-12">
	<div class="max-w-md mx-auto">

		<a href="/dashboard" style="font-family: 'Courier', monospace; font-size: 0.9rem; color: rgba(255,255,255,0.35); text-decoration: none; display: inline-block; margin-bottom: 1.5rem;">← dashboard</a>

		<h1 class="text-3xl mb-1" style="font-family: 'Skanaus-Display', sans-serif;">invoice setup</h1>
		<p class="mb-2" style="font-family: 'Courier', monospace; color: rgba(255,255,255,0.5);">Fill this out once. It will appear on every invoice you generate.</p>
		<hr class="hex-divider my-6" />

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
