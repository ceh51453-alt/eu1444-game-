/**
 * NẠP BA FILE DATA CỦA PHẦN 15 theo R5.
 *
 *   `data/world-map.json`  toạ độ và tuyến đường — dùng để ĐO khoảng cách
 *   `data/news.json`       người đưa tin, suy giảm chính xác, bóp méo, mẫu văn bản
 *   `data/sim.json`        ba tầng agent, mục tiêu, hành động, trần biến động, trần chi phí
 *
 * SÁU PHÉP KIỂM THAM CHIẾU, và cả sáu đều rút ra từ một chỗ hỏng có thật:
 *
 *  1. **MỌI `nodes.id` PHẢI LÀ MỘT VÙNG CÓ THẬT** trong `data/regions.json`. Một
 *     toạ độ trỏ vào vùng không tồn tại là một nơi mà tin đi tới rồi biến mất.
 *  2. **MỌI ĐẦU TUYẾN PHẢI CÓ TOẠ ĐỘ.** Một tuyến treo lơ lửng thì Dijkstra vẫn
 *     chạy, chỉ là con đường ấy không bao giờ được chọn — hỏng im lặng.
 *  3. **MỌI `terrain` PHẢI CÓ TRONG `terrainFactor`.** Thiếu một khoá là cả một
 *     loại địa hình lặng lẽ chạy ở tốc độ mặc định, và không ai thấy.
 *  4. **MỌI `importance.carriers` PHẢI LÀ NGƯỜI ĐƯA TIN CÓ KHAI.** Sai một chữ là
 *     biến cố ở mức ấy không có ai mang đi, và nó không bao giờ tới nơi.
 *  5. **MỌI `goals.kinds[].actions` PHẢI CÓ TRONG `actions.catalogue`**, và mọi
 *     `tierB.rules[].action` cũng vậy. Đây là chỗ giữ R1 ở tầng mô phỏng: danh
 *     mục hành động là TẬP ĐÓNG, cả cây quyết định lẫn LLM đều chỉ chọn trong đó.
 *  6. **MỌI `tierB.rules[].goal` PHẢI LÀ MỘT MỤC TIÊU CÓ KHAI**, nếu không thì
 *     luật ấy không bao giờ khớp và agent im lặng rơi xuống `fallback`.
 *
 * Cả sáu nổ LÚC KHỞI ĐỘNG chứ không phải giữa một tick sâu: một mô phỏng chạy sáu
 * mươi năm rồi mới lộ ra là nó đã đi sai từ tháng đầu là thứ không ai gỡ nổi.
 */

import { z } from 'zod';
import mapFile from '@data/world-map.json';
import newsFile from '@data/news.json';
import simFile from '@data/sim.json';
import { allRegions } from '@/lore/regions';
import { DIFFICULTY_BANDS, type DifficultyBand } from '@/systems/check';

export class SimDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimDataError';
  }
}

const meter = z.number().min(0).max(100);

// ---------------------------------------------------------------------------
// world-map.json
// ---------------------------------------------------------------------------

const mapNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(''),
  x: z.number(),
  y: z.number(),
  terrain: z.string().min(1),
  roads: z.number().int().min(0),
});

const laneSchema = z.object({
  a: z.string().min(1),
  b: z.string().min(1),
  kind: z.string().min(1),
});

const mapSchema = z.object({
  config: z.object({
    terrainFactor: z.record(z.string(), z.number().min(0.05)),
    roadFactor: z.array(z.number().min(0.05)).min(1),
    laneFactor: z.record(z.string(), z.number().min(0.05)),
    seasonFactor: z.record(z.string(), z.number().min(0.05)),
    hierarchyFactor: z.number().min(0.05),
    fallbackFactor: z.number().min(0.05),
  }),
  lanes: z.array(laneSchema).default([]),
  nodes: z.array(mapNodeSchema).min(1),
});

export type MapNode = z.infer<typeof mapNodeSchema>;
export type MapLane = z.infer<typeof laneSchema>;
export type MapConfig = z.infer<typeof mapSchema>['config'];

// ---------------------------------------------------------------------------
// news.json
// ---------------------------------------------------------------------------

const carrierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kmPerDay: z.number().min(1),
  lossPer100Km: z.number().min(0),
  lossPerHop: z.number().min(0),
  baseAccuracy: meter,
  reachFactor: z.number().min(0.1),
});

const importanceSchema = z.object({
  level: z.number().int().min(1).max(5),
  reachKm: z.number().min(1),
  speedFactor: z.number().min(0.1),
  carriers: z.array(z.string().min(1)).min(1),
});

const intelKindSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  speedBonus: z.number().min(1),
  accuracyBonus: z.number().min(0),
  upkeepPerMonth: z.number().min(0),
  note: z.string().default(''),
});

const distortionSchema = z.object({
  id: z.string().min(1),
  belowAccuracy: meter,
  weight: z.number().min(0),
  kind: z.enum(['so-lieu', 'chi-tiet', 'dia-danh', 'nhan-vat', 'them-thao', 'ket-cuc']),
  numberFactor: z.tuple([z.number(), z.number()]).optional(),
  note: z.string().default(''),
});

const newsSchema = z.object({
  config: z.object({
    rumourBelow: meter,
    minAccuracy: meter,
    maxDaysInFlight: z.number().int().min(1),
    feedLimit: z.number().int().min(10),
    cardLimit: z.number().int().min(1),
  }),
  carriers: z.array(carrierSchema).min(1),
  importance: z.array(importanceSchema).length(5),
  intel: z.object({ kinds: z.array(intelKindSchema).min(1) }),
  distortions: z.object({
    templates: z.array(distortionSchema).min(1),
    omens: z.array(z.string().min(1)).min(1),
    hedges: z.array(z.string().min(1)).min(1),
  }),
  templates: z.object({ byKind: z.record(z.string(), z.array(z.string().min(1)).min(1)) }),
  prompts: z.object({
    systemText: z.string().min(1),
    systemAgents: z.string().min(1),
    maxTokensText: z.number().int().min(64),
    maxTokensAgents: z.number().int().min(64),
  }),
});

export type Carrier = z.infer<typeof carrierSchema>;
export type ImportanceRow = z.infer<typeof importanceSchema>;
export type IntelKind = z.infer<typeof intelKindSchema>;
export type DistortionTemplate = z.infer<typeof distortionSchema>;
export type NewsConfig = z.infer<typeof newsSchema>['config'];
export type NewsPrompts = z.infer<typeof newsSchema>['prompts'];

// ---------------------------------------------------------------------------
// sim.json
// ---------------------------------------------------------------------------

const goalKindSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  horizonMonths: z.number().int().min(1),
  priorityBase: meter,
  actions: z.array(z.string().min(1)).min(1),
});

const actionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cost: z.number().min(0),
  dc: z.string().min(1),
  progress: z.number().min(0),
  eventKind: z.string().min(1),
  importance: z.number().int().min(1).max(5),
  noisy: z.boolean(),
});

const traitGateSchema = z.object({ axis: z.string().min(1), value: meter });

const tierBRuleSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  minTrait: traitGateSchema.optional(),
  maxTrait: traitGateSchema.optional(),
  minResources: z.number().min(0).optional(),
  action: z.string().min(1),
  magnitude: z.string().min(1),
});

const simSchema = z.object({
  tiers: z.object({
    maxA: z.number().int().min(1),
    maxB: z.number().int().min(1),
    nearKm: z.number().min(1),
    farKm: z.number().min(1),
    weights: z.object({
      khoangCach: z.number().min(0),
      lienQuan: z.number().min(0),
      quyenLuc: z.number().min(0),
      mocQuanTrong: z.number().min(0),
    }),
    promoteAbove: meter,
    demoteBelow: meter,
    wakeMilestones: z.array(z.string().min(1)).min(1),
  }),
  personality: z.object({
    axes: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) }).loose()).min(1),
  }),
  goals: z.object({ kinds: z.array(goalKindSchema).min(1) }),
  actions: z.object({
    catalogue: z.array(actionSchema).min(1),
    magnitude: z.record(z.string(), z.number().min(0)),
  }),
  tierB: z.object({
    rules: z.array(tierBRuleSchema).min(1),
    fallback: z.object({ action: z.string().min(1), magnitude: z.string().min(1) }),
  }),
  tierC: z.object({
    monthly: z.object({
      chet: z.array(z.object({ maxAge: z.number().int().min(0), chance: z.number().min(0).max(1) })).min(1),
      cuoi: z.object({ minAge: z.number().int().min(0), maxAge: z.number().int().min(0), chance: z.number().min(0).max(1) }),
      doiChuc: z.object({ chance: z.number().min(0).max(1) }),
      giauLen: z.object({ chance: z.number().min(0).max(1), factor: z.number().min(0) }),
      ngheoDi: z.object({ chance: z.number().min(0).max(1), factor: z.number().min(0) }),
    }),
  }),
  drift: z.object({
    maxLandLossPct: z.number().min(0),
    maxLandGainPct: z.number().min(0),
    maxMeterDelta: z.number().min(0),
    maxTreasuryFactor: z.number().min(0),
    warExempt: z.boolean(),
    logLimit: z.number().int().min(10),
  }),
  invariants: z.object({
    checks: z.array(z.object({ id: z.string().min(1), note: z.string().default('') })).min(1),
  }),
  cost: z.object({
    maxRequestsPerMonth: z.number().int().min(0),
    llmEnabledDefault: z.boolean(),
    agentsPerRequest: z.number().int().min(1),
    eventsPerTextRequest: z.number().int().min(1),
    maxTextRequestsPerMonth: z.number().int().min(0),
  }),
});

export type GoalKind = z.infer<typeof goalKindSchema>;
export type ActionSpec = z.infer<typeof actionSchema>;
export type TierBRule = z.infer<typeof tierBRuleSchema>;
export type TierConfig = z.infer<typeof simSchema>['tiers'];
export type TierCConfig = z.infer<typeof simSchema>['tierC'];
export type DriftConfig = z.infer<typeof simSchema>['drift'];
export type CostConfig = z.infer<typeof simSchema>['cost'];

// ---------------------------------------------------------------------------
// Nạp một lần, kiểm tham chiếu một lần
// ---------------------------------------------------------------------------

function parse<T>(schema: z.ZodType<T>, raw: unknown, file: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first === undefined ? '' : ` tại "${first.path.join('.')}": ${first.message}`;
    throw new SimDataError(`${file} sai định dạng${where}`);
  }
  return parsed.data;
}

const MAP = parse(mapSchema, mapFile, 'data/world-map.json');
const NEWS = parse(newsSchema, newsFile, 'data/news.json');
const SIM = parse(simSchema, simFile, 'data/sim.json');

const NODES = new Map(MAP.nodes.map((node) => [node.id, node]));
const CARRIERS = new Map(NEWS.carriers.map((carrier) => [carrier.id, carrier]));
const ACTIONS = new Map(SIM.actions.catalogue.map((action) => [action.id, action]));
const GOALS = new Map(SIM.goals.kinds.map((goal) => [goal.id, goal]));
const INTEL = new Map(NEWS.intel.kinds.map((kind) => [kind.id, kind]));

function checkReferences(): void {
  const problems: string[] = [];

  // 1. Toạ độ phải trỏ vào vùng có thật.
  const regionIds = new Set(allRegions().map((region) => region.id));
  for (const node of MAP.nodes) {
    if (!regionIds.has(node.id)) problems.push(`world-map: "${node.id}" không có trong regions.json`);
  }

  // 2. Đầu tuyến phải có toạ độ.
  for (const lane of MAP.lanes) {
    if (!NODES.has(lane.a)) problems.push(`world-map: tuyến trỏ vào "${lane.a}" không có toạ độ`);
    if (!NODES.has(lane.b)) problems.push(`world-map: tuyến trỏ vào "${lane.b}" không có toạ độ`);
    if (MAP.config.laneFactor[lane.kind] === undefined) {
      problems.push(`world-map: loại tuyến "${lane.kind}" không có hệ số`);
    }
  }

  // 3. Địa hình phải có hệ số.
  for (const node of MAP.nodes) {
    if (MAP.config.terrainFactor[node.terrain] === undefined) {
      problems.push(`world-map: địa hình "${node.terrain}" của "${node.id}" không có hệ số`);
    }
  }

  // 4. Người đưa tin của mỗi mức quan trọng phải có khai.
  for (const row of NEWS.importance) {
    for (const carrierId of row.carriers) {
      if (!CARRIERS.has(carrierId)) {
        problems.push(`news: mức ${String(row.level)} gọi người đưa tin "${carrierId}" không có khai`);
      }
    }
  }
  for (const level of [1, 2, 3, 4, 5]) {
    if (!NEWS.importance.some((row) => row.level === level)) {
      problems.push(`news: thiếu mức quan trọng ${String(level)}`);
    }
  }

  // 5. Hành động là TẬP ĐÓNG.
  for (const goal of SIM.goals.kinds) {
    for (const actionId of goal.actions) {
      if (!ACTIONS.has(actionId)) {
        problems.push(`sim: mục tiêu "${goal.id}" gọi hành động "${actionId}" không có trong danh mục`);
      }
    }
  }
  for (const rule of SIM.tierB.rules) {
    if (!ACTIONS.has(rule.action)) {
      problems.push(`sim: luật "${rule.id}" gọi hành động "${rule.action}" không có trong danh mục`);
    }
    // 6. Mục tiêu của luật phải có khai.
    if (!GOALS.has(rule.goal)) {
      problems.push(`sim: luật "${rule.id}" nói về mục tiêu "${rule.goal}" không có khai`);
    }
    if (SIM.actions.magnitude[rule.magnitude] === undefined) {
      problems.push(`sim: luật "${rule.id}" dùng mức độ "${rule.magnitude}" không có trong bảng`);
    }
  }
  if (!ACTIONS.has(SIM.tierB.fallback.action)) {
    problems.push(`sim: fallback gọi hành động "${SIM.tierB.fallback.action}" không có trong danh mục`);
  }

  // Bậc độ khó phải nằm trong thang chuẩn hoá của Phần 5 mục 8. Một bậc gõ sai ở
  // đây là `difficulty()` ném lỗi GIỮA một tick sâu, tức là giữa lượt chơi.
  const bands = new Set<string>(DIFFICULTY_BANDS);
  for (const action of SIM.actions.catalogue) {
    if (!bands.has(action.dc)) {
      problems.push(`sim: hành động "${action.id}" khai bậc khó "${action.dc}" không có trong thang Phần 5`);
    }
    if (NEWS.templates.byKind[action.eventKind] === undefined) {
      problems.push(`sim: hành động "${action.id}" loan biến cố "${action.eventKind}" không có mẫu văn bản`);
    }
  }

  if (problems.length > 0) {
    throw new SimDataError(`Dữ liệu Phần 15 sai tham chiếu:\n  ${problems.join('\n  ')}`);
  }
}

checkReferences();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function mapConfig(): MapConfig {
  return MAP.config;
}

export function mapNodes(): readonly MapNode[] {
  return MAP.nodes;
}

export function mapNode(id: string): MapNode | null {
  return NODES.get(id) ?? null;
}

export function mapLanes(): readonly MapLane[] {
  return MAP.lanes;
}

export function newsConfig(): NewsConfig {
  return NEWS.config;
}

export function carriers(): readonly Carrier[] {
  return NEWS.carriers;
}

export function carrierOf(id: string): Carrier | null {
  return CARRIERS.get(id) ?? null;
}

export function importanceRow(level: number): ImportanceRow {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  const row = NEWS.importance.find((candidate) => candidate.level === clamped);
  // `checkReferences` đã bảo đảm cả năm mức đều có mặt, nên nhánh này không tới
  // được. Ném thay vì trả mức 1 là để một ngày nào đó nó THẬT SỰ tới được thì
  // người sửa data biết ngay, thay vì thấy mọi biến cố lớn chỉ đi được 150 km.
  if (row === undefined) throw new SimDataError(`thiếu mức quan trọng ${String(clamped)}`);
  return row;
}

export function intelKinds(): readonly IntelKind[] {
  return NEWS.intel.kinds;
}

export function intelKindOf(id: string): IntelKind | null {
  return INTEL.get(id) ?? null;
}

export function distortionTemplates(): readonly DistortionTemplate[] {
  return NEWS.distortions.templates;
}

export function omens(): readonly string[] {
  return NEWS.distortions.omens;
}

export function hedges(): readonly string[] {
  return NEWS.distortions.hedges;
}

export function templatesFor(kind: string): readonly string[] {
  return NEWS.templates.byKind[kind] ?? NEWS.templates.byKind['khac'] ?? ['Có chuyện xảy ra.'];
}

/** Mọi loại biến cố có mẫu — ô lọc "chủ đề" của mục 7 dựng từ danh sách này. */
export function eventKinds(): readonly string[] {
  return Object.keys(NEWS.templates.byKind);
}

export function newsPrompts(): NewsPrompts {
  return NEWS.prompts;
}

export function tierConfig(): TierConfig {
  return SIM.tiers;
}

export function personalityAxes(): readonly string[] {
  return SIM.personality.axes.map((axis) => axis.id);
}

export function goalKinds(): readonly GoalKind[] {
  return SIM.goals.kinds;
}

export function goalKindOf(id: string): GoalKind | null {
  return GOALS.get(id) ?? null;
}

export function actionCatalogue(): readonly ActionSpec[] {
  return SIM.actions.catalogue;
}

export function actionOf(id: string): ActionSpec | null {
  return ACTIONS.get(id) ?? null;
}

/** Bậc khó của một hành động, đã kiểm là hợp lệ lúc khởi động. */
export function actionBand(action: ActionSpec): DifficultyBand {
  return action.dc as DifficultyBand;
}

/**
 * MỨC ĐỘ → SỐ, và đây là CỬA DUY NHẤT mà một chữ của LLM biến thành một con số
 * (mục 5 B2). Chữ lạ thì rơi về "vừa" chứ không ném: LLM trả sai một chữ không
 * được phép làm chết cả tick sâu (R4), nhưng cũng không được im lặng thành 0.
 */
export function magnitudeFactor(word: string): number {
  return SIM.actions.magnitude[word] ?? SIM.actions.magnitude['vua'] ?? 1;
}

export function magnitudeWords(): readonly string[] {
  return Object.keys(SIM.actions.magnitude);
}

export function tierBRules(): readonly TierBRule[] {
  return SIM.tierB.rules;
}

export function tierBFallback(): { action: string; magnitude: string } {
  return SIM.tierB.fallback;
}

export function tierCConfig(): TierCConfig {
  return SIM.tierC;
}

export function driftConfig(): DriftConfig {
  return SIM.drift;
}

export function invariantNotes(): ReadonlyMap<string, string> {
  return new Map(SIM.invariants.checks.map((check) => [check.id, check.note]));
}

export function costConfig(): CostConfig {
  return SIM.cost;
}
