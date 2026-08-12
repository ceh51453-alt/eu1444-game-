/**
 * NẠP `data/campaign-map.json` THEO R5, VÀ KIỂM NÓ CHO GÃY NGAY LÚC KHỞI ĐỘNG.
 *
 * File dữ liệu do `tools/tao-chien-do.mjs` sinh ra, nhưng "sinh ra bởi script"
 * không phải một lời bảo đảm: script còn được sửa, và một bảng khai tay sai một
 * dòng vẫn ra một file JSON hợp lệ về cú pháp. Tám phép kiểm dưới đây là chỗ mọi
 * cái sai ấy phải nổ — nổ lúc mở game, không phải lúc người chơi bấm vào một
 * vùng và thấy nó nằm dưới một vùng khác.
 *
 *  1. TIỀN TỐ ĐÚNG TẦNG. `qg_` tầng 1, `vung_` tầng 2, `huyen_` tầng 3. Nhìn id
 *     là biết tầng, đúng tinh thần README mục 7.1.
 *  2. CHA TỒN TẠI VÀ ĐÚNG MỘT TẦNG TRÊN. Một huyện treo dưới một quốc gia là một
 *     ô không bao giờ hiện ra trên bất cứ màn hình nào.
 *  3. CẠNH KHÔNG CHÉO TẦNG. Đồ thị hành quân là đồ thị tầng 3; một cạnh nối
 *     xuống tầng 2 là một cái cổng dịch chuyển.
 *  4. KHÔNG HAI Ô ANH EM NÀO ĐÈ NHAU. Đây là yêu cầu hình học của cả bản đồ:
 *     hai đĩa chồng nhau thì cái nằm dưới không click được, và người chơi không
 *     bao giờ biết mình đã bỏ sót một vùng.
 *  5. MỖI VÙNG PHẢI CÓ ÍT NHẤT MỘT THÀNH TRÌ. Luật chinh phục đòi hạ hết mục
 *     tiêu; một vùng không có mục tiêu nào thì hạ xong ngay từ lượt đầu và nó sẽ
 *     rơi vào tay bất cứ ai đi ngang qua.
 *  6. ĐỒ THỊ HUYỆN LIỀN MỘT KHỐI. Một cụm huyện không nối vào đâu là một nơi
 *     không đạo quân nào tới được, và cuộc chinh phục sẽ đứng lại ở đó mãi mãi.
 *  7. MÀU CỦA PHE LÀ DUY NHẤT. Hai phe cùng màu thì bản đồ nói dối.
 *  8. MỌI KHOÁ TRA CỨU PHẢI CÓ KHAI: địa hình, loại đường, loại điểm, chủ sở
 *     hữu. Thiếu một khoá là một ô lặng lẽ chạy theo giá trị mặc định.
 */

import { z } from 'zod';
import mapFile from '@data/campaign-map.json';
import { regionOf } from '@/lore/regions';
import type {
  CampaignConfig,
  CampaignFaction,
  CampaignLevel,
  CampaignLink,
  CampaignNode,
  LinkKind,
  SiteKind,
} from './types';

export class CampaignDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignDataError';
  }
}

const terrainSchema = z.object({ name: z.string().min(1), speed: z.number().min(0.05), mau: z.string().min(4) });
const linkKindSchema = z.object({ name: z.string().min(1), speed: z.number().min(0.05), needsShip: z.boolean() });
const siteSchema = z.object({
  name: z.string().min(1),
  objective: z.boolean(),
  siegeWeeks: z.number().int().min(0),
  note: z.string().default(''),
});

const configSchema = z.object({
  levels: z.array(z.object({ level: z.number().int().min(1).max(3), id: z.string(), name: z.string(), prefix: z.string() })).length(3),
  spacing: z.record(z.string(), z.object({ thuong: z.number().min(0), nuoc: z.number().min(0), dao: z.number().min(0) })),
  terrain: z.record(z.string(), terrainSchema),
  linkKind: z.record(z.string(), linkKindSchema),
  site: z.record(z.string(), siteSchema),
  march: z.object({
    kmPerDayFoot: z.number().min(1),
    kmPerDayHorse: z.number().min(1),
    kmPerDaySea: z.number().min(1),
    seasonFactor: z.record(z.string(), z.number().min(0.05)),
  }),
  conquest: z.object({
    needAllObjectives: z.boolean(),
    vassalCountsAsHeld: z.boolean(),
    occupyDaysTown: z.number().int().min(0),
    seatFallsLast: z.boolean(),
  }),
});

const nodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  parentId: z.string().nullable(),
  regionId: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  gx: z.number(),
  gy: z.number(),
  radius: z.number().min(1),
  terrain: z.string().min(1),
  water: z.boolean(),
  island: z.boolean(),
  site: z.enum(['thanh-tri', 'thi-tran', 'lang', '']),
  siteName: z.string().default(''),
  fort: z.number().int().min(0).max(5),
  seat: z.boolean(),
  port: z.boolean().default(false),
  ownerId: z.string().default(''),
});

const linkSchema = z.object({
  a: z.string().min(1),
  b: z.string().min(1),
  kind: z.enum(['duong-bo', 'duong-nui', 'duong-song', 'duong-bien']),
  km: z.number().min(1),
});

const factionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/u, 'màu phải là mã hex 6 chữ số'),
  homeNodeId: z.string().min(1),
});

const fileSchema = z.object({
  version: z.number().int().min(1),
  config: configSchema,
  factions: z.array(factionSchema).min(1),
  nodes: z.array(nodeSchema).min(1),
  links: z.array(linkSchema).min(1),
});

const parsed = fileSchema.safeParse(mapFile);
if (!parsed.success) {
  const first = parsed.error.issues[0];
  throw new CampaignDataError(
    `campaign-map.json sai schema: ${first === undefined ? 'không rõ' : `${first.path.join('.')} — ${first.message}`}`,
  );
}

const FILE = parsed.data;
const CONFIG: CampaignConfig = FILE.config;

const NODES = new Map<string, CampaignNode>();
for (const row of FILE.nodes) {
  NODES.set(row.id, {
    ...row,
    level: row.level as CampaignLevel,
    site: row.site as SiteKind,
  });
}

const FACTIONS = new Map<string, CampaignFaction>(FILE.factions.map((row) => [row.id, row]));

const CHILDREN = new Map<string, CampaignNode[]>();
for (const node of NODES.values()) {
  if (node.parentId === null) continue;
  const list = CHILDREN.get(node.parentId);
  if (list === undefined) CHILDREN.set(node.parentId, [node]);
  else list.push(node);
}
for (const list of CHILDREN.values()) list.sort((left, right) => left.id.localeCompare(right.id));

const LINKS: CampaignLink[] = FILE.links.map((row) => ({ ...row, kind: row.kind as LinkKind }));
const NEIGHBOURS = new Map<string, CampaignLink[]>();
for (const link of LINKS) {
  const forward = NEIGHBOURS.get(link.a);
  if (forward === undefined) NEIGHBOURS.set(link.a, [link]);
  else forward.push(link);
  const backward = NEIGHBOURS.get(link.b);
  if (backward === undefined) NEIGHBOURS.set(link.b, [link]);
  else backward.push(link);
}

// ---------------------------------------------------------------------------
// Tám phép kiểm
// ---------------------------------------------------------------------------

const PREFIX: Readonly<Record<number, string>> = { 1: 'qg_', 2: 'vung_', 3: 'huyen_' };

function kheHoToiThieu(a: CampaignNode, b: CampaignNode): number {
  const row = CONFIG.spacing[String(a.level)];
  if (row === undefined) return 0;
  if (a.water || b.water) return row.nuoc;
  if (a.island || b.island) return row.dao;
  return row.thuong;
}

function kiemTra(): string[] {
  const loi: string[] = [];

  for (const node of NODES.values()) {
    // 1
    const prefix = PREFIX[node.level];
    if (prefix !== undefined && !node.id.startsWith(prefix)) loi.push(`${node.id}: tầng ${String(node.level)} phải mang tiền tố ${prefix}`);
    // 2
    if (node.level === 1 && node.parentId !== null) loi.push(`${node.id}: tầng 1 không được có cha`);
    if (node.level > 1) {
      const parent = node.parentId === null ? undefined : NODES.get(node.parentId);
      if (parent === undefined) loi.push(`${node.id}: cha ${String(node.parentId)} không tồn tại`);
      else if (parent.level !== node.level - 1) loi.push(`${node.id}: cha ${parent.id} sai tầng`);
    }
    // 8
    if (CONFIG.terrain[node.terrain] === undefined) loi.push(`${node.id}: địa hình "${node.terrain}" chưa khai trong config.terrain`);
    if (node.site !== '' && CONFIG.site[node.site] === undefined) loi.push(`${node.id}: loại điểm "${node.site}" chưa khai`);
    if (node.ownerId !== '' && !FACTIONS.has(node.ownerId)) loi.push(`${node.id}: chủ "${node.ownerId}" không phải một phe có khai`);
  }

  // 3
  for (const link of LINKS) {
    const a = NODES.get(link.a);
    const b = NODES.get(link.b);
    if (a === undefined || b === undefined) {
      loi.push(`cạnh treo: ${link.a} → ${link.b}`);
      continue;
    }
    if (a.level !== b.level) loi.push(`cạnh chéo tầng: ${link.a} (tầng ${String(a.level)}) → ${link.b} (tầng ${String(b.level)})`);
    if (CONFIG.linkKind[link.kind] === undefined) loi.push(`cạnh ${link.a}→${link.b}: loại đường "${link.kind}" chưa khai`);
  }

  // 4 — hai ô anh em không được đè nhau
  const nhom = new Map<string, CampaignNode[]>([['', [...NODES.values()].filter((node) => node.level === 1)]]);
  for (const [parentId, rows] of CHILDREN) nhom.set(parentId, rows);
  for (const [parentId, rows] of nhom) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i];
        const b = rows[j];
        if (a === undefined || b === undefined) continue;
        const can = a.radius + b.radius + kheHoToiThieu(a, b);
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d + 1e-6 < can) {
          loi.push(`chồng lấn trong ${parentId === '' ? 'tầng 1' : parentId}: ${a.id} ⟷ ${b.id} (thiếu ${(can - d).toFixed(1)})`);
        }
      }
    }
  }

  // 5 — vùng nào cũng phải có thành trì
  for (const node of NODES.values()) {
    if (node.level !== 2 || node.water) continue;
    const con = CHILDREN.get(node.id) ?? [];
    if (!con.some((child) => child.site === 'thanh-tri')) loi.push(`${node.id} (${node.name}) không có thành trì nào — vùng này không bao giờ đổ`);
  }

  // 6 — đồ thị huyện phải liền một khối
  const huyen = [...NODES.values()].filter((node) => node.level === 3);
  const dau = huyen[0];
  if (dau !== undefined) {
    const daTham = new Set<string>();
    const stack = [dau.id];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined || daTham.has(id)) continue;
      daTham.add(id);
      for (const link of NEIGHBOURS.get(id) ?? []) {
        const next = link.a === id ? link.b : link.a;
        if (!daTham.has(next)) stack.push(next);
      }
    }
    if (daTham.size !== huyen.length) {
      loi.push(`đồ thị huyện vỡ mảnh: ${String(huyen.length - daTham.size)}/${String(huyen.length)} huyện không tới được`);
    }
  }

  // 7 — màu phe không được trùng
  const mauDaDung = new Map<string, string>();
  for (const faction of FACTIONS.values()) {
    const truoc = mauDaDung.get(faction.color.toLowerCase());
    if (truoc !== undefined) loi.push(`hai phe cùng màu ${faction.color}: ${truoc} và ${faction.id}`);
    else mauDaDung.set(faction.color.toLowerCase(), faction.id);
  }

  return loi;
}

const LOI = kiemTra();
if (LOI.length > 0) {
  throw new CampaignDataError(`chiến đồ không hợp lệ (${String(LOI.length)} lỗi):\n  ${LOI.slice(0, 20).join('\n  ')}`);
}

// ---------------------------------------------------------------------------
// Tra cứu
// ---------------------------------------------------------------------------

export function campaignConfig(): CampaignConfig {
  return CONFIG;
}

export function campaignNode(id: string): CampaignNode | null {
  return NODES.get(id) ?? null;
}

export function campaignNodes(): readonly CampaignNode[] {
  return [...NODES.values()];
}

export function nodesAtLevel(level: CampaignLevel): readonly CampaignNode[] {
  return [...NODES.values()].filter((node) => node.level === level);
}

export function childrenOfNode(id: string): readonly CampaignNode[] {
  return CHILDREN.get(id) ?? [];
}

/** Chuỗi từ nút này lên tới tầng 1, gồm cả chính nó. Dùng để vẽ đường dẫn. */
export function ancestryOf(id: string): CampaignNode[] {
  const rows: CampaignNode[] = [];
  let current = NODES.get(id) ?? null;
  for (let guard = 0; guard < 8 && current !== null; guard++) {
    rows.unshift(current);
    current = current.parentId === null ? null : (NODES.get(current.parentId) ?? null);
  }
  return rows;
}

/** Tổ tiên của `id` ở đúng tầng `level`, hoặc `null` nếu không có. */
export function ancestorAtLevel(id: string, level: CampaignLevel): CampaignNode | null {
  return ancestryOf(id).find((node) => node.level === level) ?? null;
}

/** Mọi huyện nằm dưới một nút, kể cả khi nút ấy chính là một huyện. */
export function districtsUnder(id: string): CampaignNode[] {
  const node = NODES.get(id);
  if (node === undefined) return [];
  if (node.level === 3) return [node];
  const rows: CampaignNode[] = [];
  for (const child of CHILDREN.get(id) ?? []) rows.push(...districtsUnder(child.id));
  return rows;
}

/** Huyện có thành trì hoặc thị trấn — tập MỤC TIÊU của luật chinh phục. */
export function objectivesUnder(id: string): CampaignNode[] {
  return districtsUnder(id).filter((node) => isObjective(node));
}

export function isObjective(node: CampaignNode): boolean {
  return node.site !== '' && CONFIG.site[node.site]?.objective === true;
}

const THEO_VUNG = new Map<string, CampaignNode>();
for (const node of NODES.values()) {
  if (node.regionId !== null && !THEO_VUNG.has(node.regionId)) THEO_VUNG.set(node.regionId, node);
}

/**
 * Ô trên chiến đồ ứng với một vùng của `regions.json`.
 *
 * Người chơi đứng ở `hold_ehrenfeld`, mà chiến đồ có thể không có ô riêng cho
 * nơi ấy — nó là một thành trì trong một huyện. Leo cây vùng cho tới khi gặp
 * một ô có thật thì vẫn đúng chỗ, chỉ là thô hơn một tầng; trả `null` thì marker
 * "ngài đang ở đây" biến mất khỏi bản đồ mà không ai hiểu vì sao.
 */
export function nodeForRegion(regionId: string): CampaignNode | null {
  let current = regionId;
  for (let guard = 0; guard < 12 && current !== ''; guard++) {
    const found = THEO_VUNG.get(current);
    if (found !== undefined) return found;
    const region = regionOf(current);
    if (region === null || region.parentId === null) return null;
    current = region.parentId;
  }
  return null;
}

export function campaignLinks(): readonly CampaignLink[] {
  return LINKS;
}

export function linksOf(nodeId: string): readonly CampaignLink[] {
  return NEIGHBOURS.get(nodeId) ?? [];
}

export function linkBetween(a: string, b: string): CampaignLink | null {
  // So đầu KIA của cạnh với `b`: danh sách của `a` chứa cả cạnh mà `a` đứng đầu
  // lẫn cạnh mà `a` đứng cuối, nên so thẳng `link.a === b` bỏ sót đúng một nửa.
  return (NEIGHBOURS.get(a) ?? []).find((link) => (link.a === a ? link.b : link.a) === b) ?? null;
}

export function neighbourIds(nodeId: string): string[] {
  return (NEIGHBOURS.get(nodeId) ?? []).map((link) => (link.a === nodeId ? link.b : link.a));
}

export function campaignFactions(): readonly CampaignFaction[] {
  return [...FACTIONS.values()];
}

export function campaignFaction(id: string): CampaignFaction | null {
  return FACTIONS.get(id) ?? null;
}

/** Màu của một phe. Ô vô chủ dùng màu xám của bảng màu game. */
export function factionColor(id: string): string {
  return FACTIONS.get(id)?.color ?? '#4a443c';
}

export function factionName(id: string): string {
  return FACTIONS.get(id)?.name ?? 'vô chủ';
}

export function terrainRow(id: string): { name: string; speed: number; mau: string } {
  return CONFIG.terrain[id] ?? { name: id, speed: 1, mau: '#4a443c' };
}

/** Số nút mỗi tầng — tab Debug in ra để biết chiến đồ đã nạp đủ chưa. */
export function campaignSize(): { level1: number; level2: number; level3: number; links: number; factions: number } {
  return {
    level1: nodesAtLevel(1).length,
    level2: nodesAtLevel(2).length,
    level3: nodesAtLevel(3).length,
    links: LINKS.length,
    factions: FACTIONS.size,
  };
}
