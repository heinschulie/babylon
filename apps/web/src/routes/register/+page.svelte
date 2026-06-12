<script lang="ts">
	import { authClient } from '@babylon/shared/auth-client';
	import { RegisterForm } from '@babylon/ui/auth';
	import * as m from '$lib/paraglide/messages.js';
</script>

<RegisterForm
	{authClient}
	labels={{
		kicker: m.register_kicker(),
		title: m.register_title(),
		description: m.register_description(),
		nameLabel: m.auth_name(),
		emailLabel: m.auth_email(),
		passwordLabel: m.auth_password(),
		createAccount: m.auth_create_account(),
		creatingAccount: m.auth_creating_account(),
		registrationFailed: m.auth_registration_failed(),
		haveAccount: m.auth_have_account(),
		signInLink: m.auth_sign_in_link()
	}}
/>
