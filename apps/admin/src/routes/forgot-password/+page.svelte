<script lang="ts">
	import { authClient } from '@babylon/shared/auth-client';
	import { convexClient } from '@babylon/shared/convex';
	import { api } from '@babylon/convex';
	import { ForgotPasswordForm } from '@babylon/ui/auth';
	import * as m from '$lib/paraglide/messages.js';
</script>

<ForgotPasswordForm
	{authClient}
	getDebugLink={(email) => convexClient.query(api.passwordReset.getLatestDebugLink, { email })}
	labels={{
		kicker: m.auth_forgot_password_link(),
		title: m.auth_reset_request_title(),
		description: m.auth_reset_request_description(),
		emailLabel: m.auth_email(),
		resetFailed: m.auth_reset_failed(),
		success: m.auth_reset_request_success(),
		debugDescription: m.auth_reset_request_debug_description(),
		debugLink: m.auth_reset_request_debug_link(),
		submitting: m.auth_reset_request_submitting(),
		submit: m.auth_reset_request_submit(),
		backToLogin: m.auth_back_to_login()
	}}
/>
