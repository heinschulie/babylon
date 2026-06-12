/**
 * Sets up Resend email sending for a domain:
 * 1. Creates (or reuses) the domain in Resend and reads its required DNS records.
 * 2. Merges those records into Namecheap DNS — never removes existing records.
 * 3. Triggers Resend verification and polls until verified (or timeout).
 *
 * Usage: bun run scripts/setup-resend-domain.ts --domain xhosa.academy [--region eu-west-1]
 * Env: RESEND_API_KEY, NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP
 *      (NAMECHEAP_USERNAME defaults to NAMECHEAP_API_USER)
 */

type ResendDnsRecord = {
	record: string;
	name: string;
	type: string;
	value: string;
	priority?: number | string;
	status?: string;
};

type ResendDomain = {
	id: string;
	name: string;
	status: string;
	records?: ResendDnsRecord[];
};

type HostRecord = {
	name: string;
	type: string;
	address: string;
	ttl?: string;
	mxPref?: string;
	emailType?: string;
};

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
	const index = args.indexOf(flag);
	return index >= 0 ? args[index + 1] : undefined;
}

const DOMAIN = argValue('--domain') ?? 'xhosa.academy';
const REGION = argValue('--region') ?? 'eu-west-1';
const VERIFY_TIMEOUT_MS = 8 * 60 * 1000;

const RESEND_API_KEY = requireEnv('RESEND_API_KEY');
const NC = {
	apiUser: requireEnv('NAMECHEAP_API_USER'),
	apiKey: requireEnv('NAMECHEAP_API_KEY'),
	username: process.env.NAMECHEAP_USERNAME?.trim() || requireEnv('NAMECHEAP_API_USER'),
	clientIp: requireEnv('NAMECHEAP_CLIENT_IP')
};

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		console.error(`Missing env var: ${name}`);
		process.exit(1);
	}
	return value;
}

async function resend(path: string, init?: RequestInit): Promise<Response> {
	return await fetch(`https://api.resend.com${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${RESEND_API_KEY}`,
			'Content-Type': 'application/json',
			...(init?.headers ?? {})
		}
	});
}

async function getOrCreateDomain(): Promise<ResendDomain> {
	const listResponse = await resend('/domains');
	const list = (await listResponse.json()) as { data?: ResendDomain[] };
	const existing = list.data?.find((d) => d.name === DOMAIN);
	if (existing) {
		console.log(`Resend domain exists: ${DOMAIN} (status: ${existing.status})`);
		const detail = await resend(`/domains/${existing.id}`);
		return (await detail.json()) as ResendDomain;
	}

	const createResponse = await resend('/domains', {
		method: 'POST',
		body: JSON.stringify({ name: DOMAIN, region: REGION })
	});
	if (!createResponse.ok) {
		throw new Error(`Resend domain creation failed: ${await createResponse.text()}`);
	}
	const created = (await createResponse.json()) as ResendDomain;
	console.log(`Created Resend domain ${DOMAIN} (${created.id}) in ${REGION}`);
	return created;
}

// ——— Namecheap ———

function splitRegisteredDomain(zoneName: string): [string, string] {
	const parts = zoneName.split('.');
	if (parts.length < 2) throw new Error(`Cannot split DNS zone ${zoneName}`);
	return [parts[0], parts.slice(1).join('.')];
}

function decodeXml(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function parseXmlAttributes(rawAttributes: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	for (const match of rawAttributes.matchAll(/([A-Za-z0-9:_-]+)="([^"]*)"/g)) {
		attrs[match[1]] = decodeXml(match[2]);
	}
	return attrs;
}

function assertNamecheapOk(xml: string) {
	const statusMatch = xml.match(/<ApiResponse\b[^>]*Status="([^"]+)"/i);
	if (statusMatch?.[1] === 'OK') return;
	const errors = [...xml.matchAll(/<Error\b[^>]*>(.*?)<\/Error>/gi)]
		.map((match) => decodeXml(match[1]?.trim() ?? ''))
		.filter(Boolean);
	throw new Error(errors.length > 0 ? errors.join('; ') : `Namecheap API request failed`);
}

async function namecheapGetHosts(): Promise<HostRecord[]> {
	const [sld, tld] = splitRegisteredDomain(DOMAIN);
	const params = new URLSearchParams({
		ApiUser: NC.apiUser,
		ApiKey: NC.apiKey,
		UserName: NC.username,
		ClientIp: NC.clientIp,
		Command: 'namecheap.domains.dns.getHosts',
		SLD: sld,
		TLD: tld
	});
	const response = await fetch(`https://api.namecheap.com/xml.response?${params.toString()}`);
	const xml = await response.text();
	assertNamecheapOk(xml);
	return [...xml.matchAll(/<host\b([^>]*)\/?>/gi)].map((match) => {
		const attrs = parseXmlAttributes(match[1] ?? '');
		return {
			name: attrs.Name ?? '@',
			type: attrs.Type ?? '',
			address: attrs.Address ?? '',
			ttl: attrs.TTL,
			mxPref: attrs.MXPref
		};
	});
}

async function namecheapSetHosts(records: HostRecord[]) {
	const [sld, tld] = splitRegisteredDomain(DOMAIN);
	const params = new URLSearchParams({
		ApiUser: NC.apiUser,
		ApiKey: NC.apiKey,
		UserName: NC.username,
		ClientIp: NC.clientIp,
		Command: 'namecheap.domains.dns.setHosts',
		SLD: sld,
		TLD: tld
	});
	records.forEach((record, index) => {
		const suffix = String(index + 1);
		params.set(`HostName${suffix}`, record.name);
		params.set(`RecordType${suffix}`, record.type);
		params.set(`Address${suffix}`, record.address);
		if (record.mxPref) params.set(`MXPref${suffix}`, record.mxPref);
		if (record.ttl) params.set(`TTL${suffix}`, record.ttl);
	});
	const response = await fetch(`https://api.namecheap.com/xml.response?${params.toString()}`);
	const xml = await response.text();
	assertNamecheapOk(xml);
}

/** Resend record names may be fully qualified; Namecheap wants zone-relative. */
function toRelativeName(name: string): string {
	if (name === DOMAIN || name === `${DOMAIN}.`) return '@';
	return name.replace(new RegExp(`\\.${DOMAIN.replace('.', '\\.')}\\.?$`), '');
}

async function main() {
	const domain = await getOrCreateDomain();
	if (domain.status === 'verified') {
		console.log('Domain already verified. Nothing to do.');
		return;
	}

	const required = (domain.records ?? []).map((record) => ({
		name: toRelativeName(record.name),
		type: record.type.toUpperCase(),
		address: record.value,
		mxPref:
			record.priority !== undefined && record.priority !== null
				? String(record.priority)
				: undefined,
		ttl: '1800'
	}));
	if (required.length === 0) {
		throw new Error('Resend returned no DNS records for the domain.');
	}
	console.log(`Resend requires ${required.length} records:`);
	for (const r of required) console.log(`  ${r.type} ${r.name} -> ${r.address.slice(0, 60)}...`);

	const existing = await namecheapGetHosts();
	console.log(`Namecheap currently has ${existing.length} host records.`);
	if (existing.length === 0) {
		throw new Error('Refusing to proceed: Namecheap returned zero existing records (parse issue?).');
	}

	const isSame = (a: HostRecord, b: HostRecord) =>
		a.name.toLowerCase() === b.name.toLowerCase() &&
		a.type.toUpperCase() === b.type.toUpperCase() &&
		a.address === b.address;

	const toAdd = required.filter((record) => !existing.some((host) => isSame(host, record)));
	if (toAdd.length === 0) {
		console.log('All required records already present.');
	} else {
		const merged = [...existing, ...toAdd];
		console.log(`Adding ${toAdd.length} records (total after merge: ${merged.length}).`);
		await namecheapSetHosts(merged);
		const after = await namecheapGetHosts();
		if (after.length < existing.length) {
			throw new Error(
				`DNS record count DECREASED (${existing.length} -> ${after.length}) — investigate immediately.`
			);
		}
		console.log(`Namecheap now has ${after.length} host records.`);
	}

	console.log('Triggering Resend verification...');
	await resend(`/domains/${domain.id}/verify`, { method: 'POST' });

	const deadline = Date.now() + VERIFY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 20_000));
		const check = await resend(`/domains/${domain.id}`);
		const current = (await check.json()) as ResendDomain;
		console.log(`Status: ${current.status}`);
		if (current.status === 'verified') {
			console.log('DOMAIN_VERIFIED');
			return;
		}
		if (current.status === 'failed') {
			throw new Error('Resend verification failed — check DNS records.');
		}
	}
	console.log('VERIFICATION_PENDING (DNS propagation can take a while; re-run to re-check).');
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
