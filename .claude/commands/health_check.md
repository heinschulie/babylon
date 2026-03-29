# Health Check

Run the canonical health check and report results.

!`bun -e "import { runHealthCheck } from './adws/src/health-check.ts'; import { createLogger } from './adws/src/logger.ts'; const logger = { info: console.log, error: console.error, warn: console.warn, debug: () => {} }; const result = await runHealthCheck(process.cwd(), logger); if (!result.ok) { console.error('FAILED:', result.failures.join('\\n')); process.exit(1); }"`

Report each check as PASS or FAIL. If any check fails, list the errors concisely.