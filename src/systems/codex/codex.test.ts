import { beforeAll, describe, expect, it } from 'vitest';
import { applyPatch, type PatchOp } from '@/state/mvu';
import { migrateToCurrent } from '@/state/migrate';
import { registerGameSlices } from '@/state/register';
import { createInitialState } from '@/state/store';
import { codexOf, codexPromptView, reconcileCodexOps } from './slice';

beforeAll(() => {
  registerGameSlices();
});

function setNpc(id: string, to: Record<string, unknown>): PatchOp {
  return {
    op: 'set',
    path: `codex.npcs.${id}`,
    from: null,
    to: { id, name: 'Jeanne', ...to },
    reason: 'ghi nhớ NPC vừa xuất hiện',
    source: 'json',
  };
}

describe('Codex', () => {
  it('khởi tạo rỗng và nằm trong state của ván chơi', () => {
    const state = createInitialState('codex-moi');
    expect(codexOf(state)).toEqual({
      npcs: {}, locations: {}, events: {}, organizations: {}, objects: {}, quests: {}, other: {},
    });
  });

  it('chuẩn hóa hồ sơ mới và đóng dấu lượt trước khi MVU ghi', () => {
    const state = createInitialState('codex-ghi');
    const ops = reconcileCodexOps(state, [setNpc('npc_jeanne', {
      age: 24,
      adultConfirmed: true,
      personality: { traits: ['điềm tĩnh'] },
      relationships: {
        player: {
          targetId: 'player', type: 'đồng minh', affection: 15, trust: 20,
          lastUpdatedTurn: 3,
          history: [{ turn: 3, affectionDelta: 15, trustDelta: 20, reason: 'được người chơi giúp đỡ' }],
        },
      },
    })], 3);
    const result = applyPatch(state, ops, { actor: 'ai' });

    expect(result.applied).toBe(true);
    const npc = codexOf(result.next!).npcs['npc_jeanne'];
    expect(npc?.age).toBe(24);
    expect(npc?.personality.traits).toEqual(['điềm tĩnh']);
    expect(npc?.relationships.player?.affection).toBe(15);
    expect(npc?.relationships.player?.trust).toBe(20);
    expect(npc?.relationships.player?.history).toHaveLength(1);
    expect(npc?.firstSeenTurn).toBe(3);
    expect(npc?.lastUpdatedTurn).toBe(3);
  });

  it('gộp cùng tên vào ID cũ thay vì tạo NPC thứ hai', () => {
    const initial = createInitialState('codex-gop');
    const first = applyPatch(
      initial,
      reconcileCodexOps(initial, [setNpc('npc_jeanne', {
        aliases: ['Jeanne xứ Rouen'], summary: 'Một sứ giả.', age: 24, adultConfirmed: true,
      })], 1),
      { actor: 'ai' },
    );
    expect(first.applied).toBe(true);

    const duplicate = setNpc('npc_nguoi_dua_tin', {
      aliases: ['Jeanne xứ Rouen'],
      appearance: { hair: 'tóc đen' },
    });
    const reconciled = reconcileCodexOps(first.next!, [duplicate], 2);
    expect(reconciled[0]?.path).toBe('codex.npcs.npc_jeanne');

    const second = applyPatch(first.next!, reconciled, { actor: 'ai' });
    expect(second.applied).toBe(true);
    const npcs = codexOf(second.next!).npcs;
    expect(Object.keys(npcs)).toEqual(['npc_jeanne']);
    expect(npcs['npc_jeanne']?.summary).toBe('Một sứ giả.');
    expect(npcs['npc_jeanne']?.appearance.hair).toBe('tóc đen');
    expect(npcs['npc_jeanne']?.adultConfirmed).toBe(true);
  });

  it('từ chối dữ liệu trưởng thành nếu NPC chưa đủ và chưa xác nhận 18+', () => {
    const state = createInitialState('codex-tuoi');
    const ops = reconcileCodexOps(state, [setNpc('npc_jeanne', {
      age: 17,
      adultConfirmed: false,
      adultDetail: { notes: 'không được phép lưu' },
    })], 1);
    const result = applyPatch(state, ops, { actor: 'ai' });

    expect(result.applied).toBe(false);
    expect(result.failures.some((failure) => failure.step === 'B7')).toBe(true);
  });

  it('save cùng phiên bản nhưng thiếu slice mới vẫn được bù Codex khi nạp', () => {
    const state = createInitialState('codex-save');
    const raw = structuredClone(state) as Record<string, unknown>;
    delete raw['codex'];

    expect(codexOf(migrateToCurrent(raw))).toEqual({
      npcs: {}, locations: {}, events: {}, organizations: {}, objects: {}, quests: {}, other: {},
    });
  });

  it('đổi ghi chú quan hệ kiểu cũ thành hồ sơ quan hệ mới khi nạp save', () => {
    const initial = createInitialState('codex-quan-he-cu');
    const saved = applyPatch(
      initial,
      reconcileCodexOps(initial, [setNpc('npc_jeanne', { role: 'sứ giả' })], 1),
      { actor: 'ai' },
    ).next!;
    const raw = structuredClone(saved) as Record<string, unknown>;
    const npc = ((raw['codex'] as { npcs: Record<string, Record<string, unknown>> }).npcs['npc_jeanne'])!;
    npc['relationships'] = { player: 'từng cùng vượt qua một cuộc phục kích' };

    const migrated = migrateToCurrent(raw);
    expect(codexOf(migrated).npcs['npc_jeanne']?.relationships.player?.notes)
      .toBe('từng cùng vượt qua một cuộc phục kích');
  });

  it('prompt chỉ lấy chi tiết NPC trong cảnh nhưng vẫn giữ chỉ mục chống trùng', () => {
    const initial = createInitialState('codex-prompt');
    const result = applyPatch(
      initial,
      reconcileCodexOps(initial, [
        setNpc('npc_jeanne', { role: 'sứ giả' }),
        { ...setNpc('npc_marie', { name: 'Marie', role: 'thợ may' }), path: 'codex.npcs.npc_marie' },
      ], 1),
      { actor: 'ai' },
    );
    expect(result.applied).toBe(true);

    const view = codexPromptView(result.next!, {
      place: '',
      npcs: [{ id: 'npc_jeanne', name: 'Jeanne' }],
    });
    expect(view.index.npcs).toHaveLength(2);
    expect(view.relevant.npcs.map((npc) => npc.id)).toEqual(['npc_jeanne']);
  });
});
