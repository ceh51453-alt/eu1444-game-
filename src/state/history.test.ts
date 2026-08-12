import { describe, expect, it } from 'vitest';
import { MAIN_STREAM } from '@/core/rng';
import { DEFAULT_UNDO_DEPTH, TurnHistory } from './history';
import { createInitialState, rngHubFor } from './store';
import type { GameState } from './schema';

function advanced(seed: string, turns: number, rolls: number): GameState {
  const state = createInitialState(seed, 'Người chơi');
  const hub = rngHubFor(state);
  for (let i = 0; i < rolls; i++) hub.main().int(1, 100);
  state.meta.rng = hub.getState();
  state.meta.turn = turns;
  return state;
}

describe('history — undo', () => {
  it('starts empty', () => {
    const history = new TurnHistory();
    expect(history.canUndo).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.peek()).toBeNull();
  });

  it('steps back one turn at a time, newest first', () => {
    const history = new TurnHistory();
    history.push(advanced('s', 1, 0), 'nói chuyện với thợ rèn');
    history.push(advanced('s', 2, 5), 'rút kiếm');

    expect(history.depth).toBe(2);
    expect(history.undo()?.meta.turn).toBe(2);
    expect(history.undo()?.meta.turn).toBe(1);
    expect(history.undo()).toBeNull();
  });

  it('restores the rng position, so redoing rolls the same dice (chống save-scum)', () => {
    const before = advanced('chong-save-scum', 3, 12);
    const history = new TurnHistory();
    history.push(before, 'tấn công tên lính gác');

    // Lượt chạy tiếp, tung thêm một loạt.
    const hub = rngHubFor(before);
    const outcome = Array.from({ length: 5 }, () => hub.main().int(1, 100));

    // Người chơi không hài lòng và bấm undo.
    const restored = history.undo();
    expect(restored).not.toBeNull();
    expect(restored?.meta.rng.streams[MAIN_STREAM]?.draws).toBe(12);

    // Làm lại đúng hành động đó → đúng dãy xúc sắc cũ. Không có cửa reroll.
    const redone = Array.from({ length: 5 }, () => rngHubFor(restored!).main().int(1, 100));
    expect(redone[0]).toBe(outcome[0]);
    expect(Array.from({ length: 5 }, () => rngHubFor(restored!).main().int(1, 100))[0]).toBe(
      outcome[0],
    );
  });

  it('snapshots by value — later mutation of the live state cannot leak in', () => {
    const state = advanced('tach-roi', 1, 0);
    const history = new TurnHistory();
    history.push(state, 'nhặt cái xẻng');

    state.player.name = 'đã đổi sau khi push';
    state.meta.turn = 99;

    expect(history.undo()?.player.name).toBe('Người chơi');
  });

  it('hands back a detached copy — mutating it cannot corrupt history', () => {
    const history = new TurnHistory();
    history.push(advanced('sao-chep', 1, 0), 'đi về hướng bắc');

    const peeked = history.peek();
    expect(peeked).not.toBeNull();
    peeked!.state.player.name = 'phá hoại';

    expect(history.peek()?.state.player.name).toBe('Người chơi');
  });

  it('drops the oldest entries past capacity', () => {
    const history = new TurnHistory(3);
    for (let turn = 1; turn <= 10; turn++) {
      history.push(advanced('gioi-han', turn, 0), `lượt ${turn}`);
    }
    expect(history.depth).toBe(3);
    expect(history.list().map((e) => e.turn)).toEqual([10, 9, 8]);
  });

  it('defaults to a depth the player can actually use', () => {
    expect(new TurnHistory().capacity).toBe(DEFAULT_UNDO_DEPTH);
    expect(DEFAULT_UNDO_DEPTH).toBeGreaterThanOrEqual(10);
  });

  it('refuses a nonsensical depth', () => {
    expect(() => new TurnHistory(0)).toThrow(RangeError);
    expect(() => new TurnHistory(-1)).toThrow(RangeError);
    expect(() => new TurnHistory(2.5)).toThrow(RangeError);
  });

  it('clears on demand, for new game and load', () => {
    const history = new TurnHistory();
    history.push(advanced('xoa', 1, 0), 'gì đó');
    history.clear();
    expect(history.canUndo).toBe(false);
  });
});
