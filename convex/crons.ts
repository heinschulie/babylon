import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
	'reschedule-spaced-repetition',
	{ hourUTC: 6, minuteUTC: 0 },
	internal.notifications.rescheduleDaily
);

export default crons;
