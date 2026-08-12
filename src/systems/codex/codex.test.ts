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
    expect(codexOf(migrated).npcs['npc_jeanne']?.portrait).toBe('');
  });

  /**
   * Đúng lô mà người chơi báo hỏng: model gửi một biến cố với `time`,
   * `description` và một `sources` dạng chuỗi, không kèm `id` lẫn `name`. Cả lô
   * bị từ chối với ba dòng "Invalid input", và lượt đó mất sạch phần ghi nhớ.
   */
  it('nhận hồ sơ AI gửi thiếu id/name và sai hình dạng sources', () => {
    const state = createInitialState('codex-hinh-dang-ai');
    const ops = reconcileCodexOps(state, [{
      op: 'set',
      path: 'codex.events.event_aimery_morning_training',
      from: null,
      to: {
        time: '1444-11-15T06:00',
        description: 'Aimery Valois tập kiếm buổi sáng tại sân huấn luyện Orléans.',
        sources: 'lượt hiện tại',
      },
      reason: 'ghi nhớ biến cố',
      source: 'json',
    }], 6);

    const result = applyPatch(state, ops, { actor: 'ai' });
    expect(result.failures).toEqual([]);
    expect(result.applied).toBe(true);

    const event = codexOf(result.next!).events['event_aimery_morning_training'];
    expect(event?.id).toBe('event_aimery_morning_training');
    expect(event?.name).toBe('aimery morning training');
    // Chữ AI viết phải về đúng chỗ, không được rơi mất vì gọi sai tên trường.
    expect(event?.summary).toBe('Aimery Valois tập kiếm buổi sáng tại sân huấn luyện Orléans.');
    expect(event?.dateText).toBe('1444-11-15T06:00');
    expect(event?.sources).toEqual([{ turn: 0, source: 'lượt hiện tại', confidence: 50 }]);
    expect(event?.lastUpdatedTurn).toBe(6);
  });

  it('không để tên trường AI đè lên trường đúng đã gửi kèm', () => {
    const state = createInitialState('codex-uu-tien-truong-dung');
    const ops = reconcileCodexOps(state, [{
      op: 'set',
      path: 'codex.events.event_hop_trieu',
      from: null,
      to: { name: 'Buổi chầu', title: 'Cái tên AI gửi kèm', summary: 'bản chính', description: 'bản phụ' },
      reason: 'ghi nhớ biến cố',
      source: 'json',
    }], 2);

    const event = codexOf(applyPatch(state, ops, { actor: 'ai' }).next!).events['event_hop_trieu'];
    expect(event?.name).toBe('Buổi chầu');
    expect(event?.summary).toBe('bản chính');
  });

  it('giữ tên và tóm tắt cũ khi lượt sau chỉ gửi thêm một mẩu', () => {
    const state = createInitialState('codex-gop-mau');
    const first = applyPatch(state, reconcileCodexOps(state, [{
      op: 'set',
      path: 'codex.events.event_vay_thanh',
      from: null,
      to: { name: 'Vây thành Orléans', description: 'Quân Anh siết vòng vây.' },
      reason: 'ghi nhớ biến cố',
      source: 'json',
    }], 1), { actor: 'ai' }).next!;

    const second = applyPatch(first, reconcileCodexOps(first, [{
      op: 'set',
      path: 'codex.events.event_vay_thanh',
      from: null,
      to: { participants: ['npc_jeanne'] },
      reason: 'bổ sung người tham gia',
      source: 'json',
    }], 4), { actor: 'ai' });

    expect(second.applied).toBe(true);
    const event = codexOf(second.next!).events['event_vay_thanh'];
    expect(event?.name).toBe('Vây thành Orléans');
    expect(event?.summary).toBe('Quân Anh siết vòng vây.');
    expect(event?.participantIds).toEqual(['npc_jeanne']);
  });

  it('prompt chỉ lấy chi tiết NPC trong cảnh nhưng vẫn giữ chỉ mục chống trùng', () => {
    const initial = createInitialState('codex-prompt');
    const portrait = 'data:image/webp;base64,UklGRg==';
    const result = applyPatch(
      initial,
      reconcileCodexOps(initial, [
        setNpc('npc_jeanne', { role: 'sứ giả', portrait }),
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
    expect('portrait' in (view.relevant.npcs[0] ?? {})).toBe(false);
    expect(codexOf(result.next!).npcs['npc_jeanne']?.portrait).toBe(portrait);
  });
});
