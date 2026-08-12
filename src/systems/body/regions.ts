/**
 * HAI MƯƠI VÙNG CƠ THỂ (Phần 7 mục 1) — nạp từ `/data/body-regions.json` theo R5.
 *
 * Hai thứ ở file này là hợp đồng cứng với phần còn lại của game:
 *
 *  1. TỔNG TRỌNG SỐ = 100. Loader nổ ngay lúc khởi động nếu lệch. Một tổng 103
 *     thì bảng d100 có ba vùng cuối không bao giờ trúng được, và không có gì
 *     trên màn hình nói ra điều đó — đúng loại bug im lặng mà README mục 3.5
 *     bảo phải bắt bằng test.
 *
 *  2. `armorCell` dùng ĐÚNG id trong `data/gear.json`. Phần 16 dựng bản đồ che
 *     phủ giáp trên chính những id đó, nên hai bên không cần một bảng dịch —
 *     mà một bảng dịch thì sẽ có ngày lệch.
 *
 * `domainSets` là chỗ mục 5 sống: vùng nào chi phối miền kiểm định nào. Khai
 * thành nhóm dùng chung chứ không chép lại ở từng vùng, vì hai mươi bản sao của
 * cùng một danh sách là hai mươi chỗ sẽ quên cập nhật khi Phần 8 thêm kỹ năng.
 */

import { z } from 'zod';
import regionsFile from '@data/body-regions.json';

export const organSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Phá hủy hoàn toàn là chết ngay (mục 9). Chỉ tim, não, cột sống cổ. */
  vital: z.boolean().default(false),
  /** Tạng lớn: hỏng thì rất nặng, nhưng chết qua biến chứng chứ không tức thì. */
  major: z.boolean().default(false),
  note: z.string().default(''),
});

export const regionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().default(''),
  side: z.enum(['trai', 'phai', 'giua']),
  /** Vùng hiện ở mặt nào của bản đồ cơ thể (mục 4). */
  view: z.enum(['truoc', 'sau', 'ca-hai']),
  group: z.string().min(1),
  hitWeight: z.int().min(0),
  /** Ô giáp che — id trong `data/gear.json`. Phần 16 nối vào đây. */
  armorCell: z.string().default(''),
  organs: z.array(z.string()).default([]),
  stats: z.array(z.string()).default([]),
  /** Nhóm miền bị phạt khi vùng này thuộc tay thuận, hoặc khi nó không phải tay. */
  penalizes: z.array(z.string()).default([]),
  /** Nhóm miền bị phạt khi vùng này thuộc tay còn lại (mục 5). */
  penalizesOffhand: z.array(z.string()).default([]),
  /** Bên tay mà vùng này chi phối khả năng cầm nắm. */
  grip: z.enum(['trai', 'phai']).nullable().default(null),
  /**
   * Vùng này góp bao nhiêu vào khả năng cầm nắm của bên tay đó.
   * Bàn tay là 1; càng lên vai càng nhẹ, vì một cái vai đau vẫn nắm chặt được.
   */
  gripWeight: z.number().min(0).max(1).default(0),
  limb: z.enum(['tay', 'chan']).nullable().default(null),
  amputable: z.boolean().default(false),
  bone: z.string().nullable().default(null),
  bleedFactor: z.number().min(0).default(1),
  infectionFactor: z.number().min(0).default(1),
  painFactor: z.number().min(0).default(1),
  /** Phần đóng góp vào `mobility` — tổng không cần bằng 1, engine tự chuẩn hóa. */
  mobilityWeight: z.number().min(0).default(0),
  staminaWeight: z.number().min(0).default(0),
  /** Có tạng chí mạng bên trong. */
  vital: z.boolean().default(false),
  /** Chí mạng cao — cổ. */
  critical: z.boolean().default(false),
  /** Cột sống: nguy cơ liệt. */
  spine: z.boolean().default(false),
  /** Thân mình: hoại tử lan tới đây là hết cửa (mục 9). */
  trunk: z.boolean().default(false),
  /** Vùng kề, để hoại tử lan (mục 7). */
  neighbours: z.array(z.string()).default([]),
  note: z.string().default(''),
});

const fileSchema = z.object({
  organs: z.array(organSchema).default([]),
  groups: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  domainSets: z.record(z.string(), z.array(z.string())).default({}),
  regions: z.array(regionSchema).min(1),
});

export type Organ = z.infer<typeof organSchema>;
export type BodyRegion = z.infer<typeof regionSchema>;
export type RegionSide = BodyRegion['side'];
export type Hand = 'trai' | 'phai';

export class BodyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BodyDataError';
  }
}

/** Tổng trọng số trúng đòn. Bảng d100 chỉ đúng khi nó bằng đúng con số này. */
export const HIT_TABLE_TOTAL = 100;

interface Loaded {
  regions: Map<string, BodyRegion>;
  organs: Map<string, Organ>;
  groups: { id: string; name: string }[];
  domainSets: Record<string, string[]>;
  /** Mốc cộng dồn của bảng d100: `[tới, vùng]`, sắp theo thứ tự khai báo. */
  ladder: { upTo: number; region: BodyRegion }[];
}

function load(): Loaded {
  const parsed = fileSchema.safeParse(regionsFile);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BodyDataError(
      `data/body-regions.json hỏng ở "${issue?.path.join('.') ?? '?'}": ${issue?.message ?? 'không rõ'}`,
    );
  }

  const organs = new Map<string, Organ>();
  for (const organ of parsed.data.organs) {
    if (organs.has(organ.id)) throw new BodyDataError(`tạng phủ trùng id: ${organ.id}`);
    organs.set(organ.id, organ);
  }

  const regions = new Map<string, BodyRegion>();
  const ladder: { upTo: number; region: BodyRegion }[] = [];
  let running = 0;

  for (const region of parsed.data.regions) {
    if (regions.has(region.id)) throw new BodyDataError(`vùng cơ thể trùng id: ${region.id}`);

    // Một tạng gõ sai tên thì luật tử vong của mục 9 im lặng không bao giờ khớp,
    // và nhân vật trở thành bất tử vì một lỗi chính tả. Nổ ở đây.
    for (const organId of region.organs) {
      if (!organs.has(organId)) {
        throw new BodyDataError(`vùng "${region.id}" trỏ tới tạng phủ "${organId}" không có trong bảng organs`);
      }
    }
    for (const setId of [...region.penalizes, ...region.penalizesOffhand]) {
      if (parsed.data.domainSets[setId] === undefined) {
        throw new BodyDataError(`vùng "${region.id}" trỏ tới nhóm miền "${setId}" không có trong domainSets`);
      }
    }

    regions.set(region.id, region);
    running += region.hitWeight;
    ladder.push({ upTo: running, region });
  }

  for (const region of regions.values()) {
    for (const neighbour of region.neighbours) {
      if (!regions.has(neighbour)) {
        throw new BodyDataError(`vùng "${region.id}" kề với "${neighbour}" không tồn tại — hoại tử sẽ lan vào hư vô`);
      }
    }
  }

  if (running !== HIT_TABLE_TOTAL) {
    throw new BodyDataError(
      `tổng trọng số trúng đòn là ${running}, phải là ${HIT_TABLE_TOTAL} — bảng d100 sẽ có vùng không bao giờ trúng`,
    );
  }

  return { regions, organs, groups: parsed.data.groups, domainSets: parsed.data.domainSets, ladder };
}

const DATA = load();

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export function allRegions(): BodyRegion[] {
  return [...DATA.regions.values()];
}

export function regionOf(id: string): BodyRegion | null {
  return DATA.regions.get(id) ?? null;
}

export function regionName(id: string): string {
  return DATA.regions.get(id)?.name ?? id;
}

export function regionIds(): string[] {
  return [...DATA.regions.keys()];
}

export function organOf(id: string): Organ | null {
  return DATA.organs.get(id) ?? null;
}

export function regionGroups(): { id: string; name: string }[] {
  return [...DATA.groups];
}

export function regionsInGroup(groupId: string): BodyRegion[] {
  return allRegions().filter((region) => region.group === groupId);
}

/** Vùng hiện ở một mặt của bản đồ cơ thể. */
export function regionsOnView(view: 'truoc' | 'sau'): BodyRegion[] {
  return allRegions().filter((region) => region.view === view || region.view === 'ca-hai');
}

/** Danh sách mẫu miền của một nhóm. Nhóm lạ trả về mảng rỗng, không ném. */
export function domainSet(id: string): readonly string[] {
  return DATA.domainSets[id] ?? [];
}

/**
 * Mẫu miền mà một vùng chi phối, đã tính tới tay thuận (mục 5).
 *
 * Đây là chỗ "tay thuận" và "tay còn lại" của đặc tả trở thành hai danh sách
 * khác nhau: cùng một vết ở bàn tay, nhưng nếu là tay cầm kiếm thì nó ăn vào kỹ
 * năng vũ khí, còn nếu là tay cầm khiên thì nó ăn vào khiên, cung và dây cương.
 */
export function domainsFor(region: BodyRegion, dominantHand: Hand): string[] {
  const isOffhand = region.grip !== null && region.grip !== dominantHand;
  const sets = isOffhand ? region.penalizesOffhand : region.penalizes;
  const out: string[] = [];
  for (const setId of sets) out.push(...domainSet(setId));
  return [...new Set(out)];
}

/** Vùng có chứa tạng chí mạng nào không (mục 9). */
export function vitalOrgansOf(region: BodyRegion): Organ[] {
  return region.organs
    .map((id) => DATA.organs.get(id))
    .filter((organ): organ is Organ => organ !== undefined && organ.vital);
}

/** Vùng này có động mạch lớn không — điều kiện của biến chứng `dut-dong-mach`. */
export function hasArtery(region: BodyRegion): boolean {
  return region.organs.some((id) => id === 'mach-co' || id === 'dong-mach-dui') || region.critical;
}

// ---------------------------------------------------------------------------
// Bảng vị trí trúng đòn (mục 1)
// ---------------------------------------------------------------------------

/** Vùng ứng với một con d100 đã tung. `roll` ngoài 1..100 bị kẹp lại. */
export function regionForRoll(roll: number): BodyRegion {
  const value = Math.max(1, Math.min(HIT_TABLE_TOTAL, Math.round(roll)));
  for (const step of DATA.ladder) {
    if (value <= step.upTo) return step.region;
  }
  const last = DATA.ladder[DATA.ladder.length - 1];
  if (last === undefined) throw new BodyDataError('bảng vị trí trúng đòn rỗng');
  return last.region;
}

// ---------------------------------------------------------------------------
// Khoảng cách tới thân mình — dùng khi cắt cụt (mục 6 và 8)
// ---------------------------------------------------------------------------

/**
 * Độ sâu của mỗi vùng tính từ thân mình, đo bằng số bước qua `neighbours`.
 *
 * Cắt cụt ở đùi thì cẳng chân cũng đi theo — đó là chuyện hiển nhiên với người
 * đọc và hoàn toàn không hiển nhiên với code. Không có bảng độ sâu này thì mỗi
 * chỗ cần biết "vùng nào nằm xa hơn" sẽ tự viết một danh sách tay, và danh sách
 * tay thứ ba sẽ quên bàn tay.
 */
function buildDepth(): Map<string, number> {
  const depth = new Map<string, number>();
  const queue: string[] = [];

  for (const region of DATA.regions.values()) {
    if (region.trunk || region.vital) {
      depth.set(region.id, 0);
      queue.push(region.id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    const region = DATA.regions.get(current);
    if (region === undefined) continue;
    const here = depth.get(current) ?? 0;
    for (const neighbour of region.neighbours) {
      if (depth.has(neighbour)) continue;
      depth.set(neighbour, here + 1);
      queue.push(neighbour);
    }
  }

  return depth;
}

const DEPTH = buildDepth();

export function depthFromTrunk(regionId: string): number {
  return DEPTH.get(regionId) ?? 0;
}

/**
 * Vùng nằm XA thân hơn vùng đã cho, kể cả chính nó — thứ sẽ mất theo khi cắt cụt.
 *
 * Đi theo `neighbours` và chỉ nhận vùng có độ sâu LỚN HƠN, nên nhát cưa không
 * bao giờ lan ngược về phía thân.
 */
export function distalRegions(regionId: string): BodyRegion[] {
  const start = DATA.regions.get(regionId);
  if (start === undefined) return [];

  const out: BodyRegion[] = [start];
  const seen = new Set([regionId]);
  const queue = [regionId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    const region = DATA.regions.get(current);
    if (region === undefined) continue;

    for (const neighbour of region.neighbours) {
      if (seen.has(neighbour)) continue;
      if (depthFromTrunk(neighbour) <= depthFromTrunk(current)) continue;
      const next = DATA.regions.get(neighbour);
      if (next === undefined) continue;
      seen.add(neighbour);
      out.push(next);
      queue.push(neighbour);
    }
  }

  return out;
}

/** Khoảng d100 của từng vùng — bảng tra cho UI và cho test. */
export function hitTable(): { region: BodyRegion; from: number; to: number }[] {
  let from = 1;
  return DATA.ladder.map((step) => {
    const row = { region: step.region, from, to: step.upTo };
    from = step.upTo + 1;
    return row;
  });
}
