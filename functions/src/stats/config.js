// Tunables of computeDailyStats and refreshStats. Pure constants.

// Cloud Scheduler has no africa-south1 location (checked 2026-11-10 at
// https://docs.cloud.google.com/scheduler/docs/locations: no Africa section). A scheduled function's job is created
// in the function's own region, so the scheduled function runs in europe-west1 (Belgium, Tier 1 pricing; chosen
// over the nearer me-central1). It reads the africa-south1 Firestore database across regions (counts only leave it).
// Scheduler job name: firebase-schedule-computeDailyStats-europe-west1
export const STATS_SCHEDULE_REGION = 'europe-west1';
export const STATS_SCHEDULE = '15 0 * * *';// 00:15 every day...
export const STATS_TIME_ZONE = 'Africa/Nairobi';// ...Nairobi time

// refreshStats is a callable, not scheduled, so it stays next to the database
export const STATS_CALLABLE_REGION = 'africa-south1';

export const STATS_MEMORY = '512MiB';
export const STATS_TIMEOUT_SECONDS = 300;
