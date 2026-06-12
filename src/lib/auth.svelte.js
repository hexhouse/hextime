import { supabase } from './supabase.js'

export const auth = $state({ session: null, loading: true })

supabase.auth.getSession().then(({ data }) => {
	auth.session = data.session
	auth.loading = false
})

supabase.auth.onAuthStateChange((_event, s) => {
	auth.session = s
	auth.loading = false
})
