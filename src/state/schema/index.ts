/**
 * Zod schemas for persisted state.
 *
 * PART 0 SCOPE: the minimal root state only (part 0 section 8.6). Part 2 turns
 * this file into the backbone of MVU — per-field write permission
 * (engine/ai/locked), clamping, and the all-or-nothing patch validator all read
 * from schemas declared here. Keep everything additive so part 2 can extend
 * rather than rewrite.
 *
 * R2: nothing enters state without passing through one of these schemas.
 */

import { z } from 'zod';

/**
 * Bump whenever the persisted shape changes; add a step in `migrate.ts`.
 *
 * v1 → v2: a single `meta.rngState` became `meta.rng`, a set of named streams.
 */
export const CURRENT_SCHEMA_VERSION = 2;

/** Serialised xoshiro128** state — must round-trip byte-exact (R3). */
export const rngStateSchema = z.object({
  s0: z.int().nonnegative(),
  s1: z.int().nonnegative(),
  s2: z.int().nonnegative(),
  s3: z.int().nonnegative(),
  seed: z.string(),
  draws: z.int().nonnegative(),
});

export const gameDateSchema = z.object({
  year: z.int(),
  month: z.int().min(1).max(12),
  day: z.int().min(1).max(31),
  hour: z.int().min(0).max(23),
});

/** Every named RNG stream. One shared stream cannot hold R3 — see `core/rng.ts`. */
export const rngHubStateSchema = z.object({
  streams: z.record(z.string().min(1), rngStateSchema),
});

export const metaSchema = z.object({
  schemaVersion: z.int().positive(),
  seed: z.string().min(1),
  rng: rngHubStateSchema,
  turn: z.int().nonnegative(),
  gameDate: gameDateSchema,
});

export const playerSchema = z.object({
  name: z.string(),
});

/**
 * Root state KHÔNG còn khai báo ở đây.
 *
 * Từ Phần 2, nó là hợp nhất của mọi slice đã đăng ký — xem `state/slices.ts`.
 * `meta` và `player` ở trên chính là hai slice lõi, đăng ký ở đó như mọi slice
 * khác, để chỉ có duy nhất một cơ chế.
 */
export type { GameState } from '../slices';

export type GameMeta = z.infer<typeof metaSchema>;
export type PlayerState = z.infer<typeof playerSchema>;
