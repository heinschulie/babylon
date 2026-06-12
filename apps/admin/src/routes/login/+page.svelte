<script lang="ts">
	import { authClient } from '@babylon/shared/auth-client';
	import { LoginForm } from '@babylon/ui/auth';
	import * as m from '$lib/paraglide/messages.js';
</script>

<LoginForm
	{authClient}
	labels={{
		kicker: m.admin_login_kicker(),
		title: m.auth_sign_in(),
		description: m.admin_login_desc(),
		emailLabel: m.auth_email(),
		passwordLabel: m.auth_password(),
		signIn: m.auth_sign_in(),
		signingIn: m.auth_signing_in(),
		loginFailed: m.auth_login_failed(),
		forgotPasswordLink: m.auth_forgot_password_link(),
		noAccount: m.auth_no_account(),
		register: m.auth_register()
	}}
/>
