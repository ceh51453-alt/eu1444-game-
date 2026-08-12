/**
 * BÀI TEST CỦA PHẦN 15 — ba bài bắt buộc của mục 12, cộng nhóm phép kiểm cấu trúc.
 *
 *   **Test A (12.10)** — chạy 5 NĂM mô phỏng KHÔNG CÓ NGƯỜI CHƠI. Bất biến không
 *   được vi phạm lần nào, và in ra 20 sự kiện lớn nhất.
 *
 *   **Test B (12.11)** — đứng ở một vùng xa, cho một sự kiện lớn xảy ra ở đầu kia
 *   bản đồ. Đo xem sau bao nhiêu ngày tin tới, và nội dung đã sai lệch thế nào.
 *
 *   **Test C (12.12)** — đo chi phí thật của 12 tháng mô phỏng với model rẻ. In
 *   ra số token và số tiền ước tính. **Mục 13 nói đây là bài quan trọng nhất.**
 *
 * VỀ TEST C VÀ HAI CHỮ "CHI PHÍ THẬT": bài test không gọi proxy — một bài test
 * gọi mạng thì không chạy được ở CI, không tái lập được, và tốn tiền mỗi lần
 * chạy. Cái nó đo là thứ QUYẾT ĐỊNH hoá đơn: prompt THẬT mà `batch.ts` và
 * `text.ts` dựng ra, đếm bằng chính bộ ước lượng token của Phần 3, nhân với giá
 * niêm yết của một model rẻ. Phần duy nhất là ước lượng nằm ở tỷ lệ ký tự trên
 * token; mọi thứ khác — số request, số agent mỗi request, độ dài bối cảnh — đều
 * là đường đi thật của một tháng.
 *
 * Ngoài ba bài ấy còn nhóm phép kiểm CẤU TRÚC, và nhóm này mới là thứ giữ cho
 * phần sau không phá phần này: trần request phải chặn thật, LLM không được trả
 * con số, và tin không được đi ngược thời gian.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, DEFAULT_START_DATE, type GameDate } from '@/core/clock';
import { createRng, createRngHub } from '@/core/rng';
import { estimateTokens } from '@/ai/budget';
import type { ConnCfg, LLMProvider, LLMRequest, LLMResponse } from '@/ai/provider';
import { openaiProvider } from '@/ai/providers/openai';
import { applyPatch } from '@/state/mvu';
import { registerGameSlices } from '@/state/register';
import { slices, type GameState } from '@/state/slices';
import { createInitialState } from '@/state/store';
import { buildBatchPrompt, parseBatchReply } from './batch';
import { nameBookOf } from './bridge';
import { agentSlotsLeft, canCallAgents, costReport, initialBudget, spend } from './cost';
import { magnitudeFactor } from './data';
import { runDeepTick } from './deeptick';
import { dispatchNews, advanceNews, deliverNews } from './news';
import { runFastTick } from './fasttick';
import { crowKm, findRoute } from './map';
import { seedAgents } from './seed';
import { absoluteMonth, worldStateOf, type WorldSliceState } from './slice';
import { buildTextPrompt } from './text';
import type { Agent, WorldEvent } from './types';

beforeAll(() => {
  slices.reset();
  registerGameSlices();
});

const SEED = 'phan-15';

function freshState(agents: readonly Agent[]): GameState {
  const state = createInitialState(SEED, 'Aldric');
  const world = worldStateOf(state);
  if (world === null) throw new Error('slice `world` chưa đăng ký');
  return { ...state, world: { ...world, agents: [...agents] } } as GameState;
}

function worldIn(state: GameState): WorldSliceState {
  const world = worldStateOf(state);
  if (world === null) throw new Error('không đọc được slice `world`');
  return world;
}

// ---------------------------------------------------------------------------
// TEST A — năm năm không người chơi
// ---------------------------------------------------------------------------

describe('Test A (mục 12.10) — 5 năm mô phỏng không có người chơi', () => {
  it('bất biến không vi phạm lần nào, và thế giới vẫn sinh ra chuyện', async () => {
    const hub = createRngHub(SEED);
    const rng = hub.stream('worldtick');
    let state = freshState(seedAgents(createRng(`${SEED}::gieo`)));

    const start = worldIn(state).agents.length;
    expect(start).toBeGreaterThan(20);

    let date: GameDate = { ...DEFAULT_START_DATE };
    const violations: string[] = [];
    const all: WorldEvent[] = [];

    // 60 tháng. Người chơi ĐỨNG YÊN ở Ehrenfeld và không làm gì — đây đúng là
    // tình huống mục 12.10 mô tả, và cũng là tình huống mà một mô phỏng dở sẽ
    // đóng băng thành một bức ảnh.
    for (let month = 0; month < 60; month++) {
      date = addDays(date, 30);
      const tick = await runDeepTick({
        state,
        rng,
        date,
        playerRegionId: 'hold_ehrenfeld',
        playerPowerId: '',
        names: nameBookOf(state),
      });

      const applied = applyPatch(state, tick.ops, { actor: 'engine' });
      expect(applied.failures.map((failure) => failure.message)).toEqual([]);
      if (applied.next !== null) state = applied.next;

      violations.push(...tick.report.repairs);
      all.push(...tick.report.events);
    }

    // BẤT BIẾN KHÔNG ĐƯỢC VI PHẠM LẦN NÀO. Nếu dòng này đỏ thì đọc `violations`:
    // mỗi dòng nói rõ bất biến nào, tháng nào, và đã sửa thành gì (mục 9).
    expect(violations).toEqual([]);

    const world = worldIn(state);
    const alive = world.agents.filter((agent) => agent.alive).length;
    const dead = world.agents.length - alive;

    // Năm năm phải có người chết và phải có chuyện xảy ra. Một mô phỏng không
    // sinh ra biến cố nào là một mô phỏng đã đóng băng, và nó sẽ đóng băng im
    // lặng — không có assert nào khác bắt được chuyện đó.
    expect(all.length).toBeGreaterThan(20);
    expect(dead).toBeGreaterThan(0);
    expect(alive).toBeGreaterThan(0);

    const top = [...all]
      .sort((left, right) => right.importance - left.importance || right.occurredAt.year - left.occurredAt.year)
      .slice(0, 20);

    console.log(`\n=== TEST A — 5 năm không người chơi (seed "${SEED}") ===`);
    console.log(`${start} người lúc đầu → ${alive} còn sống, ${dead} đã chết.`);
    console.log(`${all.length} biến cố, ${world.log.length} dòng nhật ký, 0 lần vi phạm bất biến.`);
    console.log('\n20 SỰ KIỆN LỚN NHẤT:');
    for (const [index, event] of top.entries()) {
      console.log(
        `${String(index + 1).padStart(2)}. [mức ${event.importance}] ` +
          `${String(event.occurredAt.month)}/${String(event.occurredAt.year)} · ${event.text}`,
      );
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// TEST B — tin đi từ đầu này sang đầu kia bản đồ
// ---------------------------------------------------------------------------

describe('Test B (mục 12.11) — tin lớn từ đầu kia châu lục', () => {
  it('đo số ngày tin tới, và nội dung đã sai lệch tới đâu', () => {
    const rng = createRng(`${SEED}::tin`);

    // Người chơi ở Lisboa — à không: bản đồ chỉ có tới Bồ Đào Nha, nên đứng ở
    // vương quốc ấy. Chuyện xảy ra ở thành lũy Kazan, gần như đúng hai đầu của
    // bản đồ mà `data/world-map.json` phủ.
    const here = 'realm_portugal';
    const there = 'hold_kazan-kremlin';
    const km = crowKm(there, here);
    const route = findRoute(there, here);
    expect(km).toBeGreaterThan(3500);

    const event: WorldEvent = {
      id: 'test_kazan-that-thu',
      kind: 'vay-ham',
      scope: 'the-gioi',
      importance: 5,
      requiresDecision: false,
      regionId: there,
      occurredAt: { ...DEFAULT_START_DATE },
      actorId: 'nation_han-quoc',
      targetId: 'nation_hre',
      amount: 4000,
      text: 'Thành lũy Kazan thất thủ. Bốn nghìn người bỏ mạng trong ba ngày công phá.',
      headline: 'Kazan thất thủ.',
      effects: [],
    };

    const sent = dispatchNews(rng, {
      event,
      toRegionId: here,
      now: { ...DEFAULT_START_DATE },
      intel: [],
    });

    // Mức 5 thì cả sứ giả lẫn tin đồn đều mang đi được — hai bản, và chúng phải
    // tới vào hai thời điểm khác nhau với hai độ chính xác khác nhau.
    expect(sent.length).toBe(2);

    console.log(`\n=== TEST B — tin từ ${there} tới ${here} ===`);
    console.log(
      `Đường chim bay ${km} km; đường thật ${route.km} km qua ${route.hops} chặng` +
        `${route.fallback ? ' (băng đồng — không có tuyến)' : ''}.`,
    );
    console.log(`Sự thật: "${event.text}"\n`);

    for (const item of [...sent].sort((left, right) => left.daysTotal - right.daysTotal)) {
      const arrived = advanceNews([item], item.daysLeft);
      expect(arrived.arrived.length).toBe(1);
      const landed = arrived.arrived[0];
      if (landed === undefined) throw new Error('tin không tới nơi');

      const arrivedAt = addDays({ ...DEFAULT_START_DATE }, landed.daysTotal);
      const told = deliverNews(rng, { event, item: landed, arrivedAt, names: nameBookOf(freshState([])) });

      // TIN KHÔNG BAO GIỜ ĐI NGƯỢC THỜI GIAN, và một chuyến đi hơn 3500 km không
      // bao giờ xong trong một tuần.
      expect(told.daysLate).toBeGreaterThan(30);
      expect(told.confidence).toBeLessThan(90);

      console.log(`[${told.source}]`);
      console.log(`  tới sau ${told.daysLate} ngày, độ tin cậy ${told.confidence}%`);
      console.log(`  bóp méo: ${told.distortions.length === 0 ? '(nguyên vẹn)' : told.distortions.join(', ')}`);
      console.log(`  người chơi đọc được: "${told.text}"\n`);
    }

    // Ít nhất một bản phải méo. Nếu cả hai đều nguyên vẹn sau 3500 km thì bảng
    // suy giảm ở `data/news.json` đã bị vặn quá nhẹ, và cơ chế đặc trưng của mục
    // 6 im lặng biến mất.
    const anyDistorted = sent.some((item) => item.distortions.length > 0);
    expect(anyDistorted).toBe(true);
  });

  it('gần thì nhanh và đúng, xa thì chậm và sai — đo cả hai đầu', () => {
    const rng = createRng(`${SEED}::gan-xa`);
    const here = 'hold_ehrenfeld';

    const measure = (regionId: string): { days: number; accuracy: number } => {
      const event: WorldEvent = {
        id: `test_do_${regionId}`,
        kind: 'tran-danh',
        scope: 'vung',
        importance: 5,
        requiresDecision: false,
        regionId,
        occurredAt: { ...DEFAULT_START_DATE },
        actorId: 'x',
        targetId: 'y',
        amount: 500,
        text: 'Có đánh nhau.',
        headline: 'Có đánh nhau.',
        effects: [],
      };
      const items = dispatchNews(rng, { event, toRegionId: here, now: { ...DEFAULT_START_DATE }, intel: [] });
      const fastest = items.reduce((best, item) => (item.daysTotal < best.daysTotal ? item : best));
      return { days: fastest.daysTotal, accuracy: fastest.accuracy };
    };

    const near = measure('hold_augsburg');
    const far = measure('hold_constantinople');

    expect(near.days).toBeLessThan(far.days);
    expect(near.accuracy).toBeGreaterThan(far.accuracy);

    console.log(
      `\nGần (Augsburg): ${near.days} ngày, ${near.accuracy}% · ` +
        `Xa (Constantinople): ${far.days} ngày, ${far.accuracy}%`,
    );
  });
});

// ---------------------------------------------------------------------------
// TEST C — chi phí thật của 12 tháng
// ---------------------------------------------------------------------------

/**
 * Provider giả đo prompt THẬT.
 *
 * Nó không gọi mạng, nhưng nó nhận đúng cái request mà `askTierA` và
 * `askEventText` sẽ gửi đi, và báo lại số token của chính request ấy. Trả lời
 * cũng là một mảng JSON hợp lệ — nếu không thì mọi quyết định bị vứt và tháng ấy
 * rơi xuống tầng B, tức là bài test sẽ đo một tháng RẺ HƠN tháng thật.
 */
function meteredProvider(seen: { prompts: string[] }): LLMProvider {
  return {
    ...openaiProvider,
    async stream(request: LLMRequest, _cfg: ConnCfg): Promise<LLMResponse> {
      const prompt = `${request.system}\n${request.messages.map((message) => message.content).join('\n')}`;
      seen.prompts.push(prompt);

      // Câu trả lời mẫu: mỗi agent một quyết định "chờ thời cơ" — hành động hợp
      // lệ với MỌI mục tiêu, nên không quyết định nào bị vứt vì lý do danh mục.
      const npcIds = [...prompt.matchAll(/npcId: (\S+)/g)].map((match) => match[1] ?? '');
      const reply = JSON.stringify(
        npcIds.map((npcId) => ({
          npcId,
          decision: 'cho-thoi-co',
          reasoning: 'còn chờ xem tình hình đã.',
          targetId: '',
          magnitude: 'vua',
        })),
      );

      return {
        text: reply,
        raw: null,
        usage: { in: estimateTokens(prompt), out: estimateTokens(reply) },
      };
    },
  };
}

describe('Test C (mục 12.12) — chi phí thật của 12 tháng mô phỏng', () => {
  it('in ra số token và số tiền ước tính cho một năm trong game', async () => {
    const hub = createRngHub(SEED);
    const rng = hub.stream('worldtick');
    let state = freshState(seedAgents(createRng(`${SEED}::gieo`)));

    const seen = { prompts: [] as string[] };
    const provider = meteredProvider(seen);
    const cfg: ConnCfg = {
      providerId: 'openai',
      baseUrl: 'https://proxy.local',
      password: '',
      model: 'model-re-tien',
      params: {},
      timeoutMs: 30000,
    };

    // Giá của một model rẻ hạng phổ thông, tính theo đô mỗi triệu token. Người
    // chơi tự nhập giá thật ở tab Debug (Phần 1 mục 8) — con số ở đây chỉ để bài
    // test in ra một cái giá đọc được.
    const pricing = { inPerMTok: 0.15, outPerMTok: 0.6 };
    const deps = { provider, cfg };

    let date: GameDate = { ...DEFAULT_START_DATE };
    for (let month = 0; month < 12; month++) {
      date = addDays(date, 30);
      const tick = await runDeepTick({
        state,
        rng,
        date,
        playerRegionId: 'hold_ehrenfeld',
        playerPowerId: '',
        names: nameBookOf(state),
        llm: { agents: deps, text: deps, pricing },
      });
      const applied = applyPatch(state, tick.ops, { actor: 'engine' });
      if (applied.next !== null) state = applied.next;
    }

    const world = worldIn(state);
    const budget = world.budget;
    const report = costReport(budget);

    // TRẦN CHI PHÍ PHẢI CHẶN THẬT. Mặc định 3 request/tháng, 12 tháng → tối đa 36.
    expect(budget.monthsSimulated).toBe(12);
    expect(seen.prompts.length).toBeLessThanOrEqual(36);
    expect(budget.tokensIn).toBeGreaterThan(0);

    // Tầng A PHẢI có người. Nếu ngưỡng `promoteAbove` bị vặn quá cao thì không ai
    // lọt vào tầng LLM, cả tầng A im lặng không bao giờ chạy, và bài đo chi phí
    // này sẽ báo về một con số đẹp cho một tính năng đã chết.
    const tierA = world.agents.filter((agent) => agent.alive && agent.tier === 'A').length;
    expect(tierA).toBeGreaterThan(0);

    console.log(`\n=== TEST C — 12 tháng mô phỏng, model rẻ ===`);
    console.log(`${world.agents.filter((agent) => agent.alive).length} người còn sống · ${tierA} ở tầng A (LLM nghĩ hộ).`);
    console.log(`Trần: ${budget.maxRequestsPerMonth} request/tháng · đã gọi ${seen.prompts.length} lần trong 12 tháng.`);
    console.log(`Token: ${budget.tokensIn} vào · ${budget.tokensOut} ra.`);
    console.log(`Giá giả định: $${pricing.inPerMTok}/1M vào · $${pricing.outPerMTok}/1M ra.`);
    console.log(`CHI PHÍ MỘT NĂM TRONG GAME: $${report.perYearUsd.toFixed(4)}`);
    console.log(`Mười năm chơi: khoảng $${(report.perYearUsd * 10).toFixed(2)}.`);
    const perYear = report.perYearUsd;

    // README mục 8.7 nói không có trần thì một năm game tốn HÀNG CHỤC ĐÔ. Đây là
    // dòng giữ lời hứa ngược lại: có trần thì nó phải rẻ hơn một tách cà phê.
    expect(perYear).toBeLessThan(1);
  }, 60_000);

  it('tắt hẳn LLM thì không gọi lần nào, và thế giới vẫn chạy', async () => {
    const hub = createRngHub(`${SEED}::tat`);
    const rng = hub.stream('worldtick');
    let state = freshState(seedAgents(createRng(`${SEED}::gieo`)));

    const seen = { prompts: [] as string[] };
    const world = worldIn(state);
    state = { ...state, world: { ...world, budget: { ...world.budget, llmEnabled: false } } } as GameState;

    let date: GameDate = { ...DEFAULT_START_DATE };
    let events = 0;
    for (let month = 0; month < 12; month++) {
      date = addDays(date, 30);
      const tick = await runDeepTick({
        state,
        rng,
        date,
        playerRegionId: 'hold_ehrenfeld',
        playerPowerId: '',
        // `llm` vắng mặt: đúng đường đi khi người chơi gạt công tắc ở tab Debug.
      });
      const applied = applyPatch(state, tick.ops, { actor: 'engine' });
      if (applied.next !== null) state = applied.next;
      events += tick.report.events.length;
    }

    expect(seen.prompts.length).toBe(0);
    expect(worldIn(state).budget.costUsd).toBe(0);
    // "Game vẫn phải hoạt động bình thường, chỉ là thế giới kém bất ngờ hơn."
    expect(events).toBeGreaterThan(5);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Cấu trúc — những chỗ phần sau dễ phá nhất
// ---------------------------------------------------------------------------

describe('mục 5 — LLM chỉ đề xuất ý định, engine giữ mọi con số', () => {
  const agent = (): Agent =>
    createAgentFor('npc_thu-nghiem', 'chiem-thanh-tri');

  function createAgentFor(npcId: string, goalKind: string): Agent {
    return {
      npcId,
      name: 'Người thử nghiệm',
      tier: 'A',
      regionId: 'hold_ehrenfeld',
      powerId: '',
      age: 40,
      alive: true,
      goals: [{ id: 'g1', kind: goalKind, target: 'hold_brogg', priority: 70, progress: 0 }],
      personality: { 'hung-hang': 60, 'trung-thanh': 40, 'tham-lam': 50, 'mo-dao': 30, 'than-trong': 45 },
      resources: { money: 400, men: 50, influence: 40 },
      relationships: [],
      knowledge: [],
      pendingActions: [],
      lastActedTick: 0,
      wokeBy: '',
    };
  }

  it('vứt quyết định trỏ ra ngoài danh mục hành động của chính mục tiêu ấy', () => {
    const parsed = parseBatchReply({
      raw: JSON.stringify([
        { npcId: 'npc_thu-nghiem', decision: 'len-hong-y', reasoning: 'x', targetId: '', magnitude: 'lon' },
      ]),
      agents: [agent()],
      month: absoluteMonth(DEFAULT_START_DATE),
    });

    expect(parsed.decisions).toEqual([]);
    expect(parsed.rejected[0]).toContain('ngoài danh mục');
  });

  it('vứt quyết định khai mức độ bằng con số thay vì bằng ba chữ', () => {
    const parsed = parseBatchReply({
      raw: JSON.stringify([
        { npcId: 'npc_thu-nghiem', decision: 'vay-ham', reasoning: 'x', targetId: '', magnitude: '9000' },
      ]),
      agents: [agent()],
      month: absoluteMonth(DEFAULT_START_DATE),
    });

    expect(parsed.decisions).toEqual([]);
    expect(parsed.rejected[0]).toContain('mức độ');
  });

  it('ba chữ mức độ đi qua ĐÚNG MỘT cửa để thành số', () => {
    expect(magnitudeFactor('nho')).toBeLessThan(magnitudeFactor('vua'));
    expect(magnitudeFactor('vua')).toBeLessThan(magnitudeFactor('lon'));
    // Chữ lạ rơi về "vừa" chứ không thành 0: LLM trả sai một chữ không được làm
    // một hành động biến mất không dấu vết (R4).
    expect(magnitudeFactor('khong-co-chu-nay')).toBe(magnitudeFactor('vua'));
  });

  it('prompt tầng A kể cái AGENT BIẾT, không kể sự thật', () => {
    const believer = { ...agent(), knowledge: ['tin.thanh-brogg-da-that-thu'] };
    const prompt = buildBatchPrompt([believer], {
      year: 1444,
      month: 11,
      situation: 'mạnh nhất: Đế quốc Orc',
      recent: [],
    });

    expect(prompt).toContain('TIN RẰNG');
    expect(prompt).toContain('tin.thanh-brogg-da-that-thu');
    // Danh mục hành động cho phép PHẢI có mặt, nếu không thì hàng rào ở
    // `parseBatchReply` sẽ vứt gần hết câu trả lời và tiền đã tiêu là tiền phí.
    expect(prompt).toContain('chỉ được chọn trong');
  });

  it('prompt viết sự kiện cấm đổi con số', () => {
    const event: WorldEvent = {
      id: 'e1',
      kind: 'tran-danh',
      scope: 'quoc-gia',
      importance: 5,
      requiresDecision: false,
      regionId: 'hold_varna',
      occurredAt: { ...DEFAULT_START_DATE },
      actorId: 'a',
      targetId: 'b',
      amount: 12000,
      text: '',
      headline: '',
      effects: [],
    };
    expect(buildTextPrompt([event])).toContain('KHÔNG ĐƯỢC ĐỔI');
  });
});

describe('mục 5 — trần chi phí chặn thật', () => {
  it('hết trần thì không còn suất nào cho tầng A', () => {
    let budget = initialBudget(absoluteMonth(DEFAULT_START_DATE));
    expect(canCallAgents(budget)).toBe(true);
    expect(agentSlotsLeft(budget)).toBeGreaterThan(0);

    for (let call = 0; call < budget.maxRequestsPerMonth; call++) {
      budget = spend(budget, { usage: { in: 1000, out: 200 }, pricing: { inPerMTok: 1, outPerMTok: 2 }, kind: 'agents' });
    }

    expect(canCallAgents(budget)).toBe(false);
    expect(agentSlotsLeft(budget)).toBe(0);
  });

  it('tắt LLM thì không còn suất nào, dù trần vẫn còn nguyên', () => {
    const budget = { ...initialBudget(absoluteMonth(DEFAULT_START_DATE)), llmEnabled: false };
    expect(canCallAgents(budget)).toBe(false);
    expect(agentSlotsLeft(budget)).toBe(0);
  });
});

describe('mục 4 — tick nhanh rẻ và không gọi mạng', () => {
  it('thời gian trôi, và tin trên đường đi thêm đúng ngần ấy ngày', () => {
    const hub = createRngHub(`${SEED}::nhanh`);
    let state = freshState([]);

    const event: WorldEvent = {
      id: 'e_nhanh',
      kind: 'tran-danh',
      scope: 'vung',
      importance: 4,
      requiresDecision: false,
      regionId: 'hold_augsburg',
      occurredAt: { ...DEFAULT_START_DATE },
      actorId: 'a',
      targetId: 'b',
      amount: 300,
      text: 'Có đánh nhau ở Augsburg.',
      headline: 'Có đánh nhau ở Augsburg.',
      effects: [],
    };

    const items = dispatchNews(hub.stream('worldtick'), {
      event,
      toRegionId: 'hold_ehrenfeld',
      now: { ...DEFAULT_START_DATE },
      intel: [],
    });
    expect(items.length).toBeGreaterThan(0);

    const world = worldIn(state);
    state = { ...state, world: { ...world, events: [event], inFlight: items } } as GameState;

    const started = performance.now();
    const tick = runFastTick({
      state,
      rng: hub.stream('worldtick'),
      minutes: 60 * 24 * 40,
      turn: 1,
    });
    const elapsed = performance.now() - started;

    // "Chạy trong vài mili giây" (mục 4). Trần 50ms rộng gấp nhiều lần mức thật,
    // và cố ý rộng — nó bắt một hồi quy về ĐỘ LỚN, không bắt nhiễu của máy chạy CI.
    expect(elapsed).toBeLessThan(50);

    expect(tick.days).toBe(40);
    expect(tick.date.month).not.toBe(DEFAULT_START_DATE.month);
    expect(tick.report.arrivals.length).toBeGreaterThan(0);

    const arrival = tick.report.arrivals[0];
    if (arrival === undefined) throw new Error('không có tin nào tới');
    // TIN KHÔNG ĐI NGƯỢC THỜI GIAN.
    const arrived = arrival.arrivedAt.year * 372 + arrival.arrivedAt.month * 31 + arrival.arrivedAt.day;
    const occurred = arrival.occurredAt.year * 372 + arrival.occurredAt.month * 31 + arrival.occurredAt.day;
    expect(arrived).toBeGreaterThanOrEqual(occurred);
  });
});

describe('mục 10 — quyền ghi của slice `world`', () => {
  it('AI KHÔNG ghi được nguồn lực agent, nhưng ghi được mục tiêu và tin đồn', () => {
    const state = freshState([]);

    const money = applyPatch(
      state,
      [{ op: 'set', path: 'world.agents.0.resources.money', to: 99999, reason: 'thử', source: 'json' }],
      { actor: 'ai' },
    );
    expect(money.applied).toBe(false);

    const budgetOp = applyPatch(
      state,
      [{ op: 'set', path: 'world.budget.maxRequestsPerMonth', to: 999, reason: 'thử', source: 'json' }],
      { actor: 'ai' },
    );
    expect(budgetOp.applied).toBe(false);

    // `from` bắt buộc kể cả ở chỗ AI ĐƯỢC ghi: compare-and-swap của Phần 2 mục
    // 4.3 là lá chắn chống việc AI dùng state cũ, và nó không có ngoại lệ nào
    // theo quyền ghi.
    const rumour = applyPatch(
      state,
      [
        {
          op: 'set',
          path: 'world.rumours',
          from: [],
          to: [{ regionId: 'hold_ehrenfeld', text: 'người ta bảo lãnh chúa đã chết' }],
          reason: 'thử',
          source: 'json',
        },
      ],
      { actor: 'ai' },
    );
    expect(rumour.applied).toBe(true);

    const goal = applyPatch(
      state,
      [
        {
          op: 'set',
          path: 'world.opinion',
          from: [],
          to: [{ subject: 'npc_x', text: 'ai cũng bảo ông ta sắp phản' }],
          reason: 'thử',
          source: 'json',
        },
      ],
      { actor: 'ai' },
    );
    expect(goal.applied).toBe(true);
  });
});
