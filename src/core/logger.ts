/**
 * Structured logger.
 *
 * PART 0 SCOPE: declaration only — no implementation yet.
 *
 * Job: one place to record what the engine did, at a level of detail the player
 * can be shown. R4 says a rejected patch must be logged rather than crash, and
 * the "no reroll" design means every failed check has to be explainable after
 * the fact — both requirements land here.
 *
 * Constraints to honour when this lands:
 * - Log entries are data, not formatted strings, so the UI can filter them.
 * - Anything written per turn goes to storage tier B (SQLite), never tier A.
 * - Never log the proxy password or API key.
 */

export {};
