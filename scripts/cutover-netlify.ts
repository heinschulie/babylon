#!/usr/bin/env bun

import { resolveNs, resolveSoa } from 'node:dns/promises';
import { existsSync, readFileSync } from 'node:fs';

type CutoverConfig = {
	webUrl: string;
	verifierUrl: string;
	convexSiteUrl: string;
	convexUrl: string;
	betterAuthSecret: string;
	vapidPublicKey?: string;
	vapidPrivateKey?: string;
	authRequireEmailVerification?: string;
	authAllowLocalhostOrigins?: string;
	authAllowUnverifiedEmailsProd?: string;
	authExtraTrustedOrigins?: string;
	payfastReturnUrl: string;
	payfastCancelUrl: string;
	payfastNotifyUrl: string;
};

type NetlifySite = {
	id: string;
	name: string;
	default_domain: string;
	custom_domain: string | null;
	dns_zone_id: string | null;
	managed_dns: boolean;
	url: string;
	ssl_url: string;
};

type NetlifyDnsRecord = {
	id: string;
	hostname: string;
	type: string;
	value: string;
	ttl?: number;
	site_id?: string | null;
	managed?: boolean;
};

type NetlifyDnsZone = {
	id: string;
	name: string;
	dns_servers: string[];
	records: NetlifyDnsRecord[];
};

type SiteKey = 'web' | 'verifier';
type SiteContext = {
	key: SiteKey;
	label: string;
	filter: string;
	statePath: string;
	siteId: string;
	site: NetlifySite;
	targetUrl: string;
	targetHost: string;
	zoneName?: string;
};

type DnsProvider = 'auto' | 'none' | 'namecheap';
type ZoneProvider = 'netlify' | 'namecheap' | 'external';

type DesiredDnsRecord = {
	host: string;
	type: 'A' | 'CNAME';
	value: string;
	ttl: number;
};

type ZonePlan = {
	zoneName: string;
	provider: ZoneProvider;
	publicNameservers: string[];
	netlifyZone?: NetlifyDnsZone;
	records: DesiredDnsRecord[];
};

type RailwayDomain = {
	id: string;
	domain: string;
	targetPort?: number | null;
};

type RailwayServiceInstance = {
	serviceId: string;
	serviceName: string;
	domains: {
		serviceDomains: RailwayDomain[];
		customDomains: RailwayDomain[];
	};
};

type RailwayStatus = {
	id: string;
	name: string;
	environments: {
		edges: Array<{
			node: {
				id: string;
				name: string;
				serviceInstances: {
					edges: Array<{
						node: RailwayServiceInstance;
					}>;
				};
			};
		}>;
	};
};

type NamecheapCredentials = {
	apiUser: string;
	apiKey: string;
	username: string;
	clientIp: string;
};

type NamecheapHostRecord = {
	name: string;
	type: string;
	address: string;
	ttl?: string;
	mxPref?: string;
	emailType?: string;
};

type Target = {
	name: string;
	summary: string;
	run: () => Promise<void>;
};

const WEB_FILTER = '@babylon/web';
const VERIFIER_FILTER = '@babylon/verifier';
const NETLIFY_APEX_IP = '75.2.60.5';
const NETLIFY_CONTEXTS = ['production', 'deploy-preview'] as const;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const includePreview = args.includes('--include-preview');
const help = args.includes('--help') || args.includes('-h');
const providerArg = (getArgValue(args, '--domain-provider') ?? 'auto') as DnsProvider;

if (help) {
	console.log(`Usage:
  bun run scripts/cutover-netlify.ts --web-domain <domain> --verifier-domain <domain> [options]

Options:
  --apply                     Execute the cutover steps. Without this, the script prints a dry run.
  --include-preview           Also update Netlify deploy-preview env vars.
  --web-domain                Production web domain, e.g. xhosa.academy or https://www.xhosa.academy
  --verifier-domain           Production verifier domain, e.g. verifier.xhosa.academy
  --domain-provider           auto | none | namecheap (default: auto)

The script can:
  - update Netlify env vars for both sites
  - update Convex production env vars
  - attach Netlify custom domains when needed
  - inspect public DNS and print the remaining cutover work
  - update Namecheap DNS automatically when API credentials are present

Optional Namecheap env vars:
  NAMECHEAP_API_USER
  NAMECHEAP_API_KEY
  NAMECHEAP_USERNAME          Defaults to NAMECHEAP_API_USER
  NAMECHEAP_CLIENT_IP
`);
	process.exit(0);
}

if (!['auto', 'none', 'namecheap'].includes(providerArg)) {
	console.error(`Unsupported --domain-provider value: ${providerArg}`);
	process.exit(1);
}

const webDomain = getArgValue(args, '--web-domain');
const verifierDomain = getArgValue(args, '--verifier-domain');

if (!webDomain || !verifierDomain) {
	console.error('Missing required --web-domain and/or --verifier-domain');
	process.exit(1);
}

await main();

async function main() {
	const env = loadMergedEnv();

	const config: CutoverConfig = {
		webUrl: normalizeHttpsUrl(webDomain!),
		verifierUrl: normalizeHttpsUrl(verifierDomain!),
		convexSiteUrl: normalizeHttpsUrl(requireEnv(env, 'PUBLIC_CONVEX_SITE_URL')),
		convexUrl: requireEnv(env, 'PUBLIC_CONVEX_URL'),
		betterAuthSecret: requireEnv(env, 'BETTER_AUTH_SECRET'),
		vapidPublicKey: env.VITE_VAPID_PUBLIC_KEY,
		vapidPrivateKey: env.VAPID_PRIVATE_KEY,
		authRequireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
		authAllowLocalhostOrigins: env.AUTH_ALLOW_LOCALHOST_ORIGINS,
		authAllowUnverifiedEmailsProd: env.AUTH_ALLOW_UNVERIFIED_EMAILS_PROD,
		authExtraTrustedOrigins: env.AUTH_EXTRA_TRUSTED_ORIGINS,
		payfastReturnUrl: '',
		payfastCancelUrl: '',
		payfastNotifyUrl: ''
	};

	config.payfastReturnUrl = new URL('/billing/return', config.webUrl).toString();
	config.payfastCancelUrl = new URL('/billing/cancel', config.webUrl).toString();
	config.payfastNotifyUrl = new URL('/webhooks/payfast', config.convexSiteUrl).toString();

	const sites = await Promise.all([
		loadSiteContext('web', config.webUrl),
		loadSiteContext('verifier', config.verifierUrl)
	]);

	const allNetlifyZones = (await netlifyApi<NetlifyDnsZone[]>('getDnsZones')) ?? [];
	const zonePlans = await buildZonePlans(sites, allNetlifyZones, providerArg);
	const railwayStatus = await loadRailwayStatus();

	const netlifyContexts = includePreview ? [...NETLIFY_CONTEXTS] : [NETLIFY_CONTEXTS[0]];
	const namecheapCredentials = readNamecheapCredentials(env);

	const targets: Target[] = [
		...buildNetlifyDomainTargets(sites),
		...buildNetlifyEnvTargets(config, netlifyContexts),
		...buildConvexTargets(config),
		...buildDnsTargets(zonePlans, providerArg, namecheapCredentials),
		...buildRailwayCleanupTargets(railwayStatus)
	];

	printPlan({
		apply,
		config,
		sites,
		zonePlans,
		railwayStatus,
		targets,
		namecheapCredentialsPresent: Boolean(namecheapCredentials)
	});

	if (!apply) {
		process.exit(0);
	}

	for (const target of targets) {
		console.log(`\n> ${target.name}`);
		await target.run();
	}

	console.log('\nCutover complete. Public DNS may still need time to propagate.');
}

async function loadSiteContext(key: SiteKey, targetUrl: string): Promise<SiteContext> {
	const statePath = key === 'web' ? 'apps/web/.netlify/state.json' : 'apps/verifier/.netlify/state.json';
	const siteId = readNetlifySiteId(statePath);
	const site = await netlifyApi<NetlifySite>('getSite', { site_id: siteId });
	if (!site) {
		throw new Error(`Failed to load Netlify site metadata for ${key}`);
	}

	const targetHost = new URL(targetUrl).hostname;
	const zoneName = targetHost.endsWith('.netlify.app') ? undefined : await inferDnsZone(targetHost);

	return {
		key,
		label: key === 'web' ? 'web' : 'verifier',
		filter: key === 'web' ? WEB_FILTER : VERIFIER_FILTER,
		statePath,
		siteId,
		site,
		targetUrl,
		targetHost,
		zoneName
	};
}

async function buildZonePlans(
	sites: SiteContext[],
	allNetlifyZones: NetlifyDnsZone[],
	providerArg: DnsProvider
): Promise<ZonePlan[]> {
	const grouped = new Map<string, ZonePlan>();

	for (const site of sites) {
		if (!site.zoneName) continue;

		const publicNameservers = normalizeNameservers(await safeResolveNs(site.zoneName));
		const netlifyZone = allNetlifyZones.find((zone) => zone.name === site.zoneName);
		const provider = determineZoneProvider(site.zoneName, publicNameservers, netlifyZone, providerArg);
		const records = buildDesiredDnsRecords(site);

		const existing = grouped.get(site.zoneName);
		if (existing) {
			existing.provider = existing.provider === 'netlify' || provider === 'netlify' ? 'netlify' : provider;
			existing.publicNameservers = existing.publicNameservers.length > 0 ? existing.publicNameservers : publicNameservers;
			existing.netlifyZone = existing.netlifyZone ?? netlifyZone;
			existing.records = mergeDesiredDnsRecords(existing.records, records);
			continue;
		}

		grouped.set(site.zoneName, {
			zoneName: site.zoneName,
			provider,
			publicNameservers,
			netlifyZone,
			records
		});
	}

	return [...grouped.values()];
}

function buildNetlifyDomainTargets(sites: SiteContext[]): Target[] {
	return sites.flatMap((site) => {
		const targetHost = site.targetHost;
		const currentCustom = site.site.custom_domain;
		const isDefaultDomain = targetHost === site.site.default_domain;

		if (isDefaultDomain || currentCustom === targetHost) {
			return [];
		}

		return [
			{
				name: `Netlify ${site.label}: attach ${targetHost}`,
				summary: `Set custom domain for ${site.site.name} to ${targetHost}`,
				run: async () => {
					await netlifyApi('updateSite', {
						site_id: site.siteId,
						custom_domain: targetHost
					});
				}
			}
		];
	});
}

function buildNetlifyEnvTargets(config: CutoverConfig, contexts: string[]): Target[] {
	const contextArgs = contexts.flatMap((context) => ['--context', context]);

	const webVars = [
		['SITE_URL', config.webUrl],
		['VERIFIER_SITE_URL', config.verifierUrl],
		['PUBLIC_CONVEX_URL', config.convexUrl],
		['PUBLIC_CONVEX_SITE_URL', config.convexSiteUrl],
		['BETTER_AUTH_SECRET', config.betterAuthSecret],
		['VITE_VAPID_PUBLIC_KEY', config.vapidPublicKey]
	].filter((entry): entry is [string, string] => Boolean(entry[1]));

	const verifierVars = [
		['SITE_URL', config.verifierUrl],
		['VERIFIER_SITE_URL', config.verifierUrl],
		['PUBLIC_CONVEX_URL', config.convexUrl],
		['PUBLIC_CONVEX_SITE_URL', config.convexSiteUrl],
		['BETTER_AUTH_SECRET', config.betterAuthSecret]
	].filter((entry): entry is [string, string] => Boolean(entry[1]));

	return [
		...webVars.map(([key, value]) => ({
			name: `Netlify web: ${key}`,
			summary: describeEnvTarget('web', key, value),
			run: async () => {
				await runCommand(buildNetlifyEnvCommand(WEB_FILTER, key, value, contextArgs));
			}
		})),
		...verifierVars.map(([key, value]) => ({
			name: `Netlify verifier: ${key}`,
			summary: describeEnvTarget('verifier', key, value),
			run: async () => {
				await runCommand(buildNetlifyEnvCommand(VERIFIER_FILTER, key, value, contextArgs));
			}
		}))
	];
}

function buildConvexTargets(config: CutoverConfig): Target[] {
	const convexVars = [
		['SITE_URL', config.webUrl],
		['VERIFIER_SITE_URL', config.verifierUrl],
		['BETTER_AUTH_SECRET', config.betterAuthSecret],
		['PUBLIC_CONVEX_SITE_URL', config.convexSiteUrl],
		['PAYFAST_RETURN_URL', config.payfastReturnUrl],
		['PAYFAST_CANCEL_URL', config.payfastCancelUrl],
		['PAYFAST_NOTIFY_URL', config.payfastNotifyUrl],
		['VITE_VAPID_PUBLIC_KEY', config.vapidPublicKey],
		['VAPID_PRIVATE_KEY', config.vapidPrivateKey],
		['AUTH_REQUIRE_EMAIL_VERIFICATION', config.authRequireEmailVerification],
		['AUTH_ALLOW_LOCALHOST_ORIGINS', config.authAllowLocalhostOrigins],
		['AUTH_ALLOW_UNVERIFIED_EMAILS_PROD', config.authAllowUnverifiedEmailsProd],
		['AUTH_EXTRA_TRUSTED_ORIGINS', config.authExtraTrustedOrigins]
	].filter((entry): entry is [string, string] => Boolean(entry[1]));

	return convexVars.map(([key, value]) => ({
		name: `Convex prod: ${key}`,
		summary: describeEnvTarget('convex', key, value),
		run: async () => {
			await runCommand(['npx', 'convex', 'env', 'set', '--prod', key, value]);
		}
	}));
}

function buildDnsTargets(
	zonePlans: ZonePlan[],
	providerArg: DnsProvider,
	namecheapCredentials: NamecheapCredentials | null
): Target[] {
	const targets: Target[] = [];

	for (const plan of zonePlans) {
		if (plan.records.length === 0) continue;

		if (plan.provider === 'netlify' && plan.netlifyZone) {
			targets.push({
				name: `Netlify DNS: ${plan.zoneName}`,
				summary: `Ensure Netlify DNS contains ${describeDnsRecords(plan.records)}`,
				run: async () => {
					await applyNetlifyDns(plan.netlifyZone!, plan.records);
				}
			});
			continue;
		}

		if (plan.provider === 'namecheap' && providerArg !== 'none') {
			if (!namecheapCredentials) {
				continue;
			}

			targets.push({
				name: `Namecheap DNS: ${plan.zoneName}`,
				summary: `Update Namecheap host records to ${describeDnsRecords(plan.records)}`,
				run: async () => {
					await applyNamecheapDns(plan.zoneName, plan.records, namecheapCredentials);
				}
			});
		}
	}

	return targets;
}

function buildRailwayCleanupTargets(railwayStatus: RailwayStatus | null): Target[] {
	if (!railwayStatus) {
		return [];
	}

	const production = railwayStatus.environments.edges.find((edge) => edge.node.name === 'production');
	if (!production) {
		return [];
	}

	return production.node.serviceInstances.edges.flatMap(({ node }) =>
		node.domains.customDomains.map((domain) => ({
			name: `Railway ${node.serviceName}: remove ${domain.domain}`,
			summary: `Detach Railway custom domain ${domain.domain} from ${node.serviceName}`,
			run: async () => {
				await railwayGraphql(
					'mutation DeleteCustomDomain($id: String!) { customDomainDelete(id: $id) }',
					{ id: domain.id }
				);
			}
		}))
	);
}

function printPlan(input: {
	apply: boolean;
	config: CutoverConfig;
	sites: SiteContext[];
	zonePlans: ZonePlan[];
	railwayStatus: RailwayStatus | null;
	targets: Target[];
	namecheapCredentialsPresent: boolean;
}) {
	console.log(input.apply ? 'Applying Netlify cutover:' : 'Dry-run Netlify cutover:');
	console.log(`  web domain:      ${input.config.webUrl}`);
	console.log(`  verifier domain: ${input.config.verifierUrl}`);
	console.log(`  convex site:     ${input.config.convexSiteUrl}`);
	console.log(`  payfast return:  ${input.config.payfastReturnUrl}`);
	console.log(`  payfast cancel:  ${input.config.payfastCancelUrl}`);
	console.log(`  payfast notify:  ${input.config.payfastNotifyUrl}`);

	console.log('\nNetlify sites:');
	for (const site of input.sites) {
		console.log(`  ${site.label}: ${site.site.name}`);
		console.log(`    default: ${site.site.default_domain}`);
		console.log(`    current custom: ${site.site.custom_domain ?? '(none)'}`);
		console.log(`    target: ${site.targetHost}`);
	}

	if (input.zonePlans.length > 0) {
		console.log('\nDNS zones:');
		for (const zone of input.zonePlans) {
			console.log(`  ${zone.zoneName}`);
			console.log(`    provider: ${zone.provider}`);
			console.log(`    public NS: ${formatNameservers(zone.publicNameservers)}`);
			if (zone.netlifyZone) {
				console.log(`    netlify NS: ${formatNameservers(zone.netlifyZone.dns_servers)}`);
			}
			console.log(`    desired: ${describeDnsRecords(zone.records)}`);
			if (zone.provider === 'namecheap' && !input.namecheapCredentialsPresent) {
				console.log('    pending: add NAMECHEAP_* env vars to let the script update DNS automatically');
			}
			if (zone.provider === 'external') {
				console.log('    pending: provider is not automated; update DNS manually or add support for that provider');
			}
		}
	}

	const railwayDomains = listRailwayCustomDomains(input.railwayStatus);
	if (railwayDomains.length > 0) {
		console.log('\nRailway custom domains:');
		for (const domain of railwayDomains) {
			console.log(`  ${domain.serviceName}: ${domain.domain}`);
		}
	}

	console.log(`\nOperations: ${input.targets.length}`);
	for (const target of input.targets) {
		console.log(`  - ${target.summary}`);
	}

	if (!input.apply) {
		console.log('\nNo changes were made. Re-run with --apply to execute the plan.');
	}
}

function buildDesiredDnsRecords(site: SiteContext): DesiredDnsRecord[] {
	if (!site.zoneName) {
		return [];
	}

	const relativeHost = relativeDnsName(site.targetHost, site.zoneName);
	const records: DesiredDnsRecord[] = [];

	if (relativeHost === '@') {
		records.push({ host: '@', type: 'A', value: NETLIFY_APEX_IP, ttl: 300 });
		records.push({ host: 'www', type: 'CNAME', value: site.site.default_domain, ttl: 300 });
		return records;
	}

	records.push({ host: relativeHost, type: 'CNAME', value: site.site.default_domain, ttl: 300 });

	if (relativeHost === 'www') {
		records.push({ host: '@', type: 'A', value: NETLIFY_APEX_IP, ttl: 300 });
	}

	return mergeDesiredDnsRecords([], records);
}

function mergeDesiredDnsRecords(
	existing: DesiredDnsRecord[],
	next: DesiredDnsRecord[]
): DesiredDnsRecord[] {
	const merged = new Map<string, DesiredDnsRecord>();
	for (const record of [...existing, ...next]) {
		merged.set(`${record.host}:${record.type}:${record.value}`, record);
	}
	return [...merged.values()];
}

function determineZoneProvider(
	zoneName: string,
	publicNameservers: string[],
	netlifyZone: NetlifyDnsZone | undefined,
	providerArg: DnsProvider
): ZoneProvider {
	if (providerArg === 'none') {
		return 'external';
	}

	if (netlifyZone && sameNameservers(publicNameservers, netlifyZone.dns_servers)) {
		return 'netlify';
	}

	if (providerArg === 'namecheap') {
		return 'namecheap';
	}

	if (publicNameservers.some((nameserver) => nameserver.endsWith('registrar-servers.com'))) {
		return 'namecheap';
	}

	return 'external';
}

async function applyNetlifyDns(zone: NetlifyDnsZone, records: DesiredDnsRecord[]) {
	const existing = await netlifyApi<NetlifyDnsRecord[]>('getDnsRecords', { zone_id: zone.id });
	const current = existing ?? [];

	for (const record of records) {
		const fqdn = record.host === '@' ? zone.name : `${record.host}.${zone.name}`;
		const alreadyExists = current.some(
			(candidate) =>
				normalizeHostname(candidate.hostname) === fqdn &&
				candidate.type === record.type &&
				candidate.value === record.value
		);
		if (alreadyExists) continue;

		const conflicting = current.filter((candidate) => {
			if (normalizeHostname(candidate.hostname) !== fqdn) return false;
			if (record.type === 'CNAME') return true;
			return ['A', 'AAAA', 'ALIAS', 'CNAME'].includes(candidate.type);
		});

		for (const entry of conflicting) {
			if (entry.managed) {
				throw new Error(`Managed Netlify DNS record already owns ${fqdn}; adjust the site domain first`);
			}
			await netlifyApi('deleteDnsRecord', {
				zone_id: zone.id,
				dns_record_id: entry.id
			});
		}

		await netlifyApi('createDnsRecord', {
			zone_id: zone.id,
			type: record.type,
			hostname: fqdn,
			value: record.value,
			ttl: record.ttl
		});
	}
}

async function applyNamecheapDns(
	zoneName: string,
	records: DesiredDnsRecord[],
	credentials: NamecheapCredentials
) {
	const current = await getNamecheapHosts(zoneName, credentials);
	const merged = mergeNamecheapHostRecords(zoneName, current, records);
	await setNamecheapHosts(zoneName, merged, credentials);
}

function mergeNamecheapHostRecords(
	zoneName: string,
	current: NamecheapHostRecord[],
	desired: DesiredDnsRecord[]
): NamecheapHostRecord[] {
	const desiredByHost = new Map<string, DesiredDnsRecord[]>();
	for (const record of desired) {
		const list = desiredByHost.get(record.host) ?? [];
		list.push(record);
		desiredByHost.set(record.host, list);
	}

	const merged = current.filter((record) => {
		const desiredRecords = desiredByHost.get(record.name);
		if (!desiredRecords) return true;

		if (desiredRecords.some((desiredRecord) => desiredRecord.type === 'CNAME')) {
			return false;
		}

		if (['A', 'AAAA', 'ALIAS', 'CNAME', 'URL', 'URL301', 'FRAME'].includes(record.type)) {
			return false;
		}

		return true;
	});

	for (const record of desired) {
		merged.push({
			name: record.host,
			type: record.type,
			address: record.value,
			ttl: String(record.ttl)
		});
	}

	return merged;
}

async function getNamecheapHosts(
	zoneName: string,
	credentials: NamecheapCredentials
): Promise<NamecheapHostRecord[]> {
	const xml = await callNamecheap(
		'namecheap.domains.dns.getHosts',
		zoneName,
		credentials
	);
	return parseNamecheapHosts(xml);
}

async function setNamecheapHosts(
	zoneName: string,
	records: NamecheapHostRecord[],
	credentials: NamecheapCredentials
) {
	const [sld, tld] = splitRegisteredDomain(zoneName);
	const params = new URLSearchParams({
		ApiUser: credentials.apiUser,
		ApiKey: credentials.apiKey,
		UserName: credentials.username,
		ClientIp: credentials.clientIp,
		Command: 'namecheap.domains.dns.setHosts',
		SLD: sld,
		TLD: tld
	});

	records.forEach((record, index) => {
		const suffix = String(index + 1);
		params.set(`HostName${suffix}`, record.name);
		params.set(`RecordType${suffix}`, record.type);
		params.set(`Address${suffix}`, record.address);
		if (record.mxPref) {
			params.set(`MXPref${suffix}`, record.mxPref);
		}
		if (record.emailType) {
			params.set(`EmailType${suffix}`, record.emailType);
		}
		if (record.ttl) {
			params.set(`TTL${suffix}`, record.ttl);
		}
	});

	const response = await fetch(`https://api.namecheap.com/xml.response?${params.toString()}`);
	const xml = await response.text();
	assertNamecheapOk(xml);
}

async function loadRailwayStatus(): Promise<RailwayStatus | null> {
	try {
		const stdout = await runCommand(['railway', 'status', '--json'], { captureStdout: true });
		return JSON.parse(stdout) as RailwayStatus;
	} catch {
		return null;
	}
}

async function railwayGraphql<T = unknown>(
	query: string,
	variables: Record<string, unknown>
): Promise<T> {
	const token = loadRailwayToken();
	const response = await fetch('https://backboard.railway.com/graphql/v2', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ query, variables })
	});

	const payload = (await response.json()) as {
		data?: T;
		errors?: Array<{ message?: string }>;
	};

	if (!response.ok || payload.errors?.length) {
		const message =
			payload.errors?.map((error) => error.message).filter(Boolean).join('; ') ||
			`Railway API request failed with status ${response.status}`;
		throw new Error(message);
	}

	if (payload.data === undefined) {
		throw new Error('Railway API returned no data');
	}

	return payload.data;
}

function loadRailwayToken(): string {
	const path = `${process.env.HOME}/.railway/config.json`;
	if (!existsSync(path)) {
		throw new Error('Missing Railway CLI config; run railway login first');
	}

	const config = JSON.parse(readFileSync(path, 'utf8')) as {
		user?: { token?: string };
	};
	const token = config.user?.token?.trim();
	if (!token) {
		throw new Error('Missing Railway token in CLI config; run railway login again');
	}
	return token;
}

async function callNamecheap(
	command: string,
	zoneName: string,
	credentials: NamecheapCredentials
): Promise<string> {
	const [sld, tld] = splitRegisteredDomain(zoneName);
	const params = new URLSearchParams({
		ApiUser: credentials.apiUser,
		ApiKey: credentials.apiKey,
		UserName: credentials.username,
		ClientIp: credentials.clientIp,
		Command: command,
		SLD: sld,
		TLD: tld
	});

	const response = await fetch(`https://api.namecheap.com/xml.response?${params.toString()}`);
	const xml = await response.text();
	assertNamecheapOk(xml);
	return xml;
}

function assertNamecheapOk(xml: string) {
	const statusMatch = xml.match(/<ApiResponse\b[^>]*Status="([^"]+)"/i);
	if (statusMatch?.[1] === 'OK') {
		return;
	}

	const errors = [...xml.matchAll(/<Error\b[^>]*>(.*?)<\/Error>/gi)]
		.map((match) => decodeXml(match[1]?.trim() ?? ''))
		.filter((value): value is string => Boolean(value));
	throw new Error(errors.length > 0 ? errors.join('; ') : `Namecheap API request failed: ${xml}`);
}

function parseNamecheapHosts(xml: string): NamecheapHostRecord[] {
	return [...xml.matchAll(/<host\b([^>]*)\/?>/gi)].map((match) => {
		const attrs = parseXmlAttributes(match[1] ?? '');
		return {
			name: attrs.Name ?? '@',
			type: attrs.Type ?? '',
			address: attrs.Address ?? '',
			ttl: attrs.TTL,
			mxPref: attrs.MXPref,
			emailType: attrs.EmailType
		};
	});
}

function parseXmlAttributes(rawAttributes: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	for (const match of rawAttributes.matchAll(/([A-Za-z0-9:_-]+)="([^"]*)"/g)) {
		attrs[match[1]] = decodeXml(match[2]);
	}
	return attrs;
}

function decodeXml(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function readNamecheapCredentials(env: Record<string, string>): NamecheapCredentials | null {
	const apiUser = env.NAMECHEAP_API_USER?.trim();
	const apiKey = env.NAMECHEAP_API_KEY?.trim();
	const username = env.NAMECHEAP_USERNAME?.trim() || apiUser;
	const clientIp = env.NAMECHEAP_CLIENT_IP?.trim();

	if (!apiUser || !apiKey || !username || !clientIp) {
		return null;
	}

	return { apiUser, apiKey, username, clientIp };
}

async function netlifyApi<T>(method: string, data?: Record<string, unknown>): Promise<T | null> {
	const command = ['npx', '--yes', 'netlify-cli', 'api', method];
	if (data) {
		command.push('--data', JSON.stringify(data));
	}

	const stdout = await runCommand(command, { captureStdout: true });
	if (!stdout.trim()) {
		return null;
	}

	return JSON.parse(stdout) as T;
}

function buildNetlifyEnvCommand(
	filter: string,
	key: string,
	value: string,
	contextArgs: string[]
): string[] {
	const command = ['npx', '--yes', 'netlify-cli', 'env:set', key, value, '--filter', filter, '--force'];
	command.push(...contextArgs);
	if (isSecretKey(key)) {
		command.push('--secret');
	}
	return command;
}

async function runCommand(
	command: string[],
	options?: { captureStdout?: boolean }
): Promise<string> {
	const stdoutMode = options?.captureStdout ? 'pipe' : 'inherit';
	const proc = Bun.spawn(command, {
		stdout: stdoutMode,
		stderr: 'pipe',
		env: process.env
	});

	const stderrText = await streamToString(proc.stderr);
	const stdoutText =
		options?.captureStdout && proc.stdout ? await streamToString(proc.stdout) : '';
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		const rendered = stderrText.trim() || `Command failed: ${command.join(' ')}`;
		throw new Error(rendered);
	}

	if (!options?.captureStdout && stderrText.trim()) {
		process.stderr.write(stderrText);
	}

	return stdoutText;
}

async function streamToString(stream: ReadableStream<Uint8Array> | null): Promise<string> {
	if (!stream) {
		return '';
	}

	return await new Response(stream).text();
}

async function inferDnsZone(hostname: string): Promise<string> {
	const labels = hostname.split('.');
	for (let index = 0; index < labels.length - 1; index += 1) {
		const candidate = labels.slice(index).join('.');
		if (await isAuthoritativeDnsName(candidate)) {
			return candidate;
		}
	}

	const digFallback = await inferDnsZoneWithDig(hostname);
	if (digFallback) {
		return digFallback;
	}

	throw new Error(`Unable to infer DNS zone for ${hostname}`);
}

async function isAuthoritativeDnsName(candidate: string): Promise<boolean> {
	try {
		await resolveSoa(candidate);
		return true;
	} catch {
		try {
			const nameservers = await resolveNs(candidate);
			return nameservers.length > 0;
		} catch {
			return false;
		}
	}
}

async function inferDnsZoneWithDig(hostname: string): Promise<string | null> {
	const labels = hostname.split('.');
	for (let index = 0; index < labels.length - 1; index += 1) {
		const candidate = labels.slice(index).join('.');
		try {
			const output = await runCommand(['dig', '+short', 'SOA', candidate], {
				captureStdout: true
			});
			if (output.trim()) {
				return candidate;
			}
		} catch {
			// Continue until we find a zone that answers.
		}
	}

	return null;
}

function readNetlifySiteId(path: string): string {
	if (!existsSync(path)) {
		throw new Error(`Missing Netlify state file: ${path}`);
	}
	const state = JSON.parse(readFileSync(path, 'utf8')) as { siteId?: string };
	if (!state.siteId) {
		throw new Error(`Missing siteId in ${path}`);
	}
	return state.siteId;
}

function listRailwayCustomDomains(railwayStatus: RailwayStatus | null): Array<{
	serviceName: string;
	domain: string;
}> {
	if (!railwayStatus) {
		return [];
	}

	const production = railwayStatus.environments.edges.find((edge) => edge.node.name === 'production');
	if (!production) {
		return [];
	}

	return production.node.serviceInstances.edges.flatMap(({ node }) =>
		node.domains.customDomains.map((domain) => ({
			serviceName: node.serviceName,
			domain: domain.domain
		}))
	);
}

async function safeResolveNs(hostname: string): Promise<string[]> {
	try {
		return await resolveNs(hostname);
	} catch {
		return [];
	}
}

function sameNameservers(left: string[], right: string[]): boolean {
	if (left.length === 0 || right.length === 0) return false;
	const normalizedLeft = [...normalizeNameservers(left)].sort();
	const normalizedRight = [...normalizeNameservers(right)].sort();
	return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function normalizeNameservers(values: string[]): string[] {
	return values.map((value) => value.toLowerCase().replace(/\.$/, ''));
}

function normalizeHostname(value: string): string {
	return value.toLowerCase().replace(/\.$/, '');
}

function relativeDnsName(hostname: string, zoneName: string): string {
	if (hostname === zoneName) return '@';
	const suffix = `.${zoneName}`;
	if (!hostname.endsWith(suffix)) {
		throw new Error(`${hostname} is not within DNS zone ${zoneName}`);
	}
	return hostname.slice(0, -suffix.length);
}

function splitRegisteredDomain(zoneName: string): [string, string] {
	const parts = zoneName.split('.');
	if (parts.length < 2) {
		throw new Error(`Cannot split DNS zone ${zoneName}`);
	}
	return [parts[0], parts.slice(1).join('.')];
}

function describeEnvTarget(scope: string, key: string, value: string): string {
	if (isSecretKey(key)) {
		return `Set ${scope} ${key} (secret)`;
	}
	return `Set ${scope} ${key}=${value}`;
}

function describeDnsRecords(records: DesiredDnsRecord[]): string {
	return records.map((record) => `${record.host} ${record.type} ${record.value}`).join(', ');
}

function formatNameservers(values: string[]): string {
	if (values.length === 0) return '(unresolved)';
	return values.join(', ');
}

function isSecretKey(key: string): boolean {
	return key === 'BETTER_AUTH_SECRET' || key === 'VAPID_PRIVATE_KEY';
}

function loadMergedEnv(): Record<string, string> {
	const merged: Record<string, string> = {};
	for (const file of ['.env', '.env.local']) {
		Object.assign(merged, parseEnvFile(file));
	}
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === 'string' && value.length > 0) {
			merged[key] = value;
		}
	}
	return merged;
}

function parseEnvFile(path: string): Record<string, string> {
	if (!existsSync(path)) {
		return {};
	}

	return parseEnvText(readFileSync(path, 'utf8'));
}

function parseEnvText(contents: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const rawLine of contents.split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;

		const equalsIndex = line.indexOf('=');
		if (equalsIndex === -1) continue;

		const key = line.slice(0, equalsIndex).trim();
		let value = line.slice(equalsIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		values[key] = value;
	}
	return values;
}

function requireEnv(env: Record<string, string>, key: string): string {
	const value = env[key]?.trim();
	if (!value) {
		throw new Error(`Missing required environment value: ${key}`);
	}
	return value;
}

function normalizeHttpsUrl(input: string): string {
	const candidate = input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`;
	const url = new URL(candidate);
	url.pathname = '';
	url.search = '';
	url.hash = '';
	return url.toString().replace(/\/$/, '');
}

function getArgValue(argv: string[], flag: string): string | undefined {
	const index = argv.indexOf(flag);
	if (index === -1) return undefined;
	return argv[index + 1];
}
