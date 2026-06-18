<script>
	import '../app.css';
	import { auth } from '$lib/auth.svelte.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { children } = $props();

	const publicRoutes = ['/', '/signup'];

	$effect(() => {
		if (!auth.loading && !auth.session && !publicRoutes.includes($page.url.pathname)) {
			goto('/');
		}
	});

	$effect(() => {
		$page.url.pathname;
		console.log("time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀     time time time time time time 🌀");
	});
</script>

{#if auth.loading}
	<div style="min-height: 100vh; background: black;"></div>
{:else}
	{@render children()}
{/if}
