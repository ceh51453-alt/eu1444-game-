/**
 * Seeded pseudo-random number generator — xoshiro128**.
 *
 * Rule R3 (reproducibility) rests entirely on this file: every roll in the game
 * must come from here, the generator state must be serialisable into the save,
 * and restoring a save must resume the exact same stream. Never call
 * `Math.random()` anywhere else in the codebase.
 *
 * xoshiro128** was chosen over mulberry32 because its state is four plain
 * uint32 words — trivially JSON-serialisable — while passing far stronger
 * statistical tests. The Monte Carlo suite in part 5 depends on that quality.
 */

/** Serialisable generator state. Goes into the save file verbatim. */
export interface RngState {
  /** The four uint32 words of the xoshiro128** state. */
  readonly s0: number;
  readonly s1: number;
  readonly s2: number;
  readonly s3: number;
  /** Seed string the stream was originally created from (for debugging/export). */
  readonly seed: string;
  /** How many 32-bit draws have been consumed. Audit aid, not used by the algorithm. */
  readonly draws: number;
}

export interface Rng {
  /** Raw 32-bit draw, `0 .. 4294967295`. */
  uint32(): number;
  /** Uniform float in `[0, 1)`. */
  next(): number;
  /** Uniform integer in `[min, max]`, both inclusive, no modulo bias. */
  int(min: number, max: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates shuffle returning a NEW array; the input is never mutated. */
  shuffle<T>(items: readonly T[]): T[];
  /** Snapshot for persistence. */
  getState(): RngState;
  /** Restore a snapshot; the stream continues exactly where it was cut. */
  setState(state: RngState): void;
}

const TWO_POW_32 = 4294967296;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Expand an arbitrary seed string into four non-zero state words.
 * cyrb128 — fast, no dependencies, well-distributed for short strings.
 */
export function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  const words: [number, number, number, number] = [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];

  // An all-zero state is a fixed point of xoshiro and would emit only zeroes.
  if ((words[0] | words[1] | words[2] | words[3]) === 0) {
    return [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0xdeadbeef];
  }
  return words;
}

/**
 * Checked array access. `noUncheckedIndexedAccess` makes `arr[i]` a `T |
 * undefined`; this narrows it without an `as` cast (part 0 section 7 bans
 * loose casts). Throws on sparse arrays and on arrays holding `undefined`,
 * neither of which is valid game data.
 */
function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new RangeError(`array index ${index} is empty or undefined`);
  }
  return value;
}

function makeRng(initial: RngState): Rng {
  let s0 = initial.s0 >>> 0;
  let s1 = initial.s1 >>> 0;
  let s2 = initial.s2 >>> 0;
  let s3 = initial.s3 >>> 0;
  let seed = initial.seed;
  let draws = initial.draws;

  const uint32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;

    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);

    draws++;
    return result;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`rng.int expects integers, got (${min}, ${max})`);
    }
    if (max < min) {
      throw new RangeError(`rng.int expects min <= max, got (${min}, ${max})`);
    }
    const range = max - min + 1;
    if (range > TWO_POW_32) {
      throw new RangeError(`rng.int range ${range} exceeds 2^32`);
    }
    // Rejection sampling: discard the ragged tail so every value is equally
    // likely. Biased modulo would quietly skew the part 5 Monte Carlo tests.
    const limit = Math.floor(TWO_POW_32 / range) * range;
    let draw = uint32();
    while (draw >= limit) {
      draw = uint32();
    }
    return min + (draw % range);
  };

  return {
    uint32,
    next: () => uint32() / TWO_POW_32,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('rng.pick called on an empty array');
      }
      return at(items, int(0, items.length - 1));
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        const a = at(out, i);
        const b = at(out, j);
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
    getState: (): RngState => ({ s0, s1, s2, s3, seed, draws }),
    setState: (state: RngState): void => {
      s0 = state.s0 >>> 0;
      s1 = state.s1 >>> 0;
      s2 = state.s2 >>> 0;
      s3 = state.s3 >>> 0;
      seed = state.seed;
      draws = state.draws;
    },
  };
}

/** Build a fresh generator from a seed string. */
export function createRng(seed: string): Rng {
  const [s0, s1, s2, s3] = hashSeed(seed);
  return makeRng({ s0, s1, s2, s3, seed, draws: 0 });
}

/** Rebuild a generator from a persisted snapshot (save/load, undo). */
export function createRngFromState(state: RngState): Rng {
  return makeRng(state);
}

/** Initial snapshot for a seed, without instantiating a generator. */
export function initialRngState(seed: string): RngState {
  const [s0, s1, s2, s3] = hashSeed(seed);
  return { s0, s1, s2, s3, seed, draws: 0 };
}

// ---------------------------------------------------------------------------
// Named substreams
// ---------------------------------------------------------------------------

/**
 * A single shared stream is not enough to keep R3.
 *
 * The background world simulation (part 15) rolls a variable number of times
 * depending on what is happening off-screen. On one shared stream that shifts
 * every later player roll, so "same seed + same input = same result" quietly
 * stops being true. Each concern therefore gets its own named stream.
 *
 * A stream's seed is DERIVED from the campaign seed and its label, never drawn
 * from another stream — so opening a new stream never disturbs an existing one,
 * and streams can appear in any order without changing anyone's dice.
 */

/** The stream player-facing rolls come from. */
export const MAIN_STREAM = 'main';

/** Labels the engine reserves. Systems may add their own on top. */
export const RNG_STREAMS = {
  /** Player actions, checks, combat. */
  main: MAIN_STREAM,
  /** Background world simulation (part 15). */
  worldtick: 'worldtick',
  /** Character, name and content generation that must not shift combat dice. */
  generation: 'generation',
} as const;

/** All live streams, ready to go into a save. */
export interface RngHubState {
  streams: Record<string, RngState>;
}

export interface RngHub {
  /** Campaign seed every stream is derived from. */
  readonly seed: string;
  /** Get (or lazily open) a named stream. Opening one disturbs no other. */
  stream(label?: string): Rng;
  /** Shorthand for the player-facing stream. */
  main(): Rng;
  /** Labels currently open, sorted, for display and debugging. */
  labels(): string[];
  /** Snapshot of every open stream. */
  getState(): RngHubState;
  /** Restore every stream. Streams missing from `state` rewind to their start. */
  setState(state: RngHubState): void;
}

/** Seed of a substream. Deterministic, and independent of draw order. */
export function deriveStreamSeed(seed: string, label: string): string {
  return `${seed}::${label}`;
}

export function createRngHub(seed: string, state?: RngHubState): RngHub {
  // Instantiated generators, keyed by label.
  const live = new Map<string, Rng>();
  // States restored from a save whose generator has not been asked for yet.
  const pending = new Map<string, RngState>(Object.entries(state?.streams ?? {}));

  const open = (label: string): Rng => {
    const existing = live.get(label);
    if (existing !== undefined) return existing;

    const saved = pending.get(label);
    const rng = saved === undefined ? createRng(deriveStreamSeed(seed, label)) : createRngFromState(saved);
    pending.delete(label);
    live.set(label, rng);
    return rng;
  };

  return {
    seed,
    stream: (label: string = MAIN_STREAM) => open(label),
    main: () => open(MAIN_STREAM),
    labels: () => [...new Set([...live.keys(), ...pending.keys()])].sort(),
    getState: (): RngHubState => {
      const streams: Record<string, RngState> = {};
      for (const [label, rngState] of pending) streams[label] = rngState;
      for (const [label, rng] of live) streams[label] = rng.getState();
      return { streams };
    },
    setState: (next: RngHubState): void => {
      pending.clear();
      for (const [label, rngState] of Object.entries(next.streams)) {
        const existing = live.get(label);
        if (existing === undefined) pending.set(label, rngState);
        else existing.setState(rngState);
      }
      // A stream the save does not mention rewinds to its derived start rather
      // than keeping a position that save never knew about.
      for (const [label, rng] of live) {
        if (label in next.streams) continue;
        rng.setState(initialRngState(deriveStreamSeed(seed, label)));
      }
    },
  };
}

/** Opening state for a fresh campaign: the main stream, at draw zero. */
export function initialRngHubState(seed: string): RngHubState {
  return { streams: { [MAIN_STREAM]: initialRngState(deriveStreamSeed(seed, MAIN_STREAM)) } };
}
