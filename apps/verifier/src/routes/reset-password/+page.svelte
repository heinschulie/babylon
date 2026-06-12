<script lang="ts">
	import { authClient } from '@babylon/shared/auth-client';
	import { ResetPasswordForm } from '@babylon/ui/auth';
	import * as m from '$lib/paraglide/messages.js';
</script>

<ResetPasswordForm
	{authClient}
	labels={{
		kicker: m.auth_reset_title(),
		title: m.auth_reset_title(),
		description: m.auth_reset_description(),
		newPasswordLabel: m.auth_reset_new_password(),
		confirmPasswordLabel: m.auth_reset_confirm_password(),
		invalidToken: m.auth_reset_invalid_token(),
		passwordMismatch: m.auth_reset_password_mismatch(),
		resetFailed: m.auth_reset_failed(),
		success: m.auth_reset_success(),
		submitting: m.auth_reset_submitting(),
		submit: m.auth_reset_submit(),
		backToLogin: m.auth_back_to_login()
	}}
/>
