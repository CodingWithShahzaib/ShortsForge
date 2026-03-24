/**
 * Prioritized follow-ups for the Create (/generate) flow.
 */
export const PRIORITIZED_GENERATE_FEATURES = [
  "Server-side template sync (account-scoped, not only localStorage)",
  "Per–story-type prompt library synced with Scripts page",
  "Estimated scene split preview from script length before generate",
  "Mobile stepper wizard (optional) for first-time users",
  "Backend caching / ETags for story-types and static catalogs",
] as const;
