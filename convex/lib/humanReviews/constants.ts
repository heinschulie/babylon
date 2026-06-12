export const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
export const SLA_MS = 24 * 60 * 60 * 1000;
export const AGREEMENT_TOLERANCE = 1;

/** Number of dispute reviews required to resolve a flagged review. */
export const DISPUTE_REVIEWS_REQUIRED = 2;

/** Max expired claims / SLA-breached requests processed per maintenance sweep. */
export const CLAIM_MAINTENANCE_BATCH = 100;
