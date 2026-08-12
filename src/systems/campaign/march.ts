/**
 * HÀNH QUÂN — và luật quan trọng nhất của cả chiến đồ: KHÔNG AI DỊCH CHUYỂN.
 *
 * Một đạo quân không đổi ô vì người kể chuyện nói nó đã tới nơi. Nó nhận một
 * LỆNH HÀNH QUÂN gồm cả con đường, rồi bò trên con đường ấy mỗi ngày một quãng
 * — và trong lúc bò, vị trí của nó là một điểm nằm GIỮA hai ô, nhìn thấy được
 * trên bản đồ, chặn được bằng một đạo quân khác.
 *
 * Vì sao phải cứng đến thế: cả cơ chế vây thành, cắt đường tiếp tế và cứu viện
 * chỉ có nghĩa nếu quãng đường tốn thời gian. Cho phép một cú nhảy, dù chỉ một
 * lần, dù chỉ "cho tiện", là xoá sạch ba cơ chế ấy trong đúng một lượt. Đó là lý
 * do `moveArmyFromNarrative` — cửa duy nhất mà người kể chuyện chạm được vào vị
 * trí quân — trả về một lệnh hành quân chứ không phải một vị trí mới (R1, R2).
 *
 * Chỉ có MỘT ngoại lệ, và nó không phải một cú nhảy: `deployArmy` đặt quân lần
 * đầu lúc dựng ván. Trước đó đạo quân ấy chưa tồn tại, nên nó không đi từ đâu
 * tới cả.
 */

import type { SeasonId } from '@/core/clock';
import { campaignConfig, campaignNode, childrenOfNode, linkBetween, linksOf, terrainRow } from './data';
import { withChronicle, type CampaignSliceState } from './slice';
import type { CampaignArmy, CampaignLevel, MarchOrder } from './types';

export interface CampaignRoute {
  path: string[];
  km: number;
  /** Số ngày ước tính theo tốc độ đã cho, đã tính địa hình và loại đường. */
  days: number;
  needsShip: boolean;
  /** Không có đường nào nối hai nơi. `path` khi ấy rỗng. */
  unreachable: boolean;
}

export interface MarchOutcome {
  campaign: CampaignSliceState;
  lines: string[];
  refused: string;
  route: CampaignRoute | null;
}

/** Vị trí để VẼ một đạo quân: hoặc đứng ở một ô, hoặc nằm giữa hai ô. */
export interface ArmyPlacement {
  armyId: string;
  /** Ô đang đứng, hoặc ô xuất phát của chặng đang đi. */
  fromId: string;
  /** Ô sắp tới. Rỗng khi đang đứng yên. */
  toId: string;
  /** 0…1 trên chặng hiện tại. 0 khi đứng yên. */
  t: number;
  moving: boolean;
  /** Km và ngày còn lại của cả chuyến, không phải của chặng. */
  kmLeft: number;
  daysLeft: number;
  /** Ô gần nhất — dùng cho câu "đang ở gần X". */
  nearestId: string;
}

const DI_BO = () => campaignConfig().march.kmPerDayFoot;

/** Tốc độ thật trên một chặng: đường xấu và địa hình xấu đều bóp nó lại. */
function heSoChang(fromId: string, toId: string): number {
  const link = linkBetween(fromId, toId);
  const kind = link === null ? 1 : (campaignConfig().linkKind[link.kind]?.speed ?? 1);
  const dich = campaignNode(toId);
  const terrain = dich === null ? 1 : terrainRow(dich.terrain).speed;
  return Math.max(0.1, kind * terrain);
}

function heSoMua(season: SeasonId | undefined): number {
  if (season === undefined) return 1;
  return campaignConfig().march.seasonFactor[season] ?? 1;
}

/**
 * Huyện đại diện cho một nút bất kỳ.
 *
 * Người kể chuyện nói "kéo quân về Pháp" chứ không nói "kéo quân về huyện
 * Aubicourt". Một mệnh lệnh ở tầng quốc gia phải hạ xuống được một ô có thật,
 * nếu không thì nó không đi đâu cả — và thủ phủ là chỗ đúng nhất để hạ xuống.
 */
export function seatDistrictOf(nodeId: string): string {
  const node = campaignNode(nodeId);
  if (node === null) return '';
  if (node.level === 3) return node.id;
  const con = childrenOfNode(node.id);
  const thuPhu = con.find((row) => row.seat) ?? con[0];
  return thuPhu === undefined ? '' : seatDistrictOf(thuPhu.id);
}

/**
 * TÌM ĐƯỜNG trên đồ thị huyện — Dijkstra theo THỜI GIAN chứ không theo km.
 *
 * Cùng lý do như `sim/map.ts`: con đường ngắn nhất không phải con đường nhanh
 * nhất. Vòng qua một cái đèo thấp xa hơn mà tới sớm hơn nhiều so với leo thẳng
 * qua núi, và một đạo quân chọn sai chỗ ấy sẽ tới nơi sau khi thành đã thất thủ.
 *
 * Hàng đợi quét tuyến tính: đồ thị có gần bảy trăm đỉnh và hàm này chạy vài lần
 * mỗi lượt chơi. Một heap ở đây là bốn chục dòng code để tiết kiệm micro giây.
 */
export function campaignRoute(fromId: string, toId: string, kmPerDay = DI_BO()): CampaignRoute {
  const from = seatDistrictOf(fromId);
  const to = seatDistrictOf(toId);
  const rong: CampaignRoute = { path: [], km: 0, days: 0, needsShip: false, unreachable: true };
  if (from === '' || to === '') return rong;
  if (from === to) return { path: [from], km: 0, days: 0, needsShip: false, unreachable: false };

  const ngay = new Map<string, number>([[from, 0]]);
  const truoc = new Map<string, string>();
  const xong = new Set<string>();
  const bien: { id: string; days: number }[] = [{ id: from, days: 0 }];

  while (bien.length > 0) {
    let tot = 0;
    for (let index = 1; index < bien.length; index++) {
      const ungVien = bien[index];
      const dangTot = bien[tot];
      if (ungVien !== undefined && dangTot !== undefined && ungVien.days < dangTot.days) tot = index;
    }
    const hienTai = bien.splice(tot, 1)[0];
    if (hienTai === undefined) break;
    if (xong.has(hienTai.id)) continue;
    xong.add(hienTai.id);
    if (hienTai.id === to) break;

    for (const link of linksOf(hienTai.id)) {
      const ke = link.a === hienTai.id ? link.b : link.a;
      if (xong.has(ke)) continue;
      const them = link.km / Math.max(1, kmPerDay * heSoChang(hienTai.id, ke));
      const moi = hienTai.days + them;
      if (moi >= (ngay.get(ke) ?? Infinity)) continue;
      ngay.set(ke, moi);
      truoc.set(ke, hienTai.id);
      bien.push({ id: ke, days: moi });
    }
  }

  if (!xong.has(to)) return rong;

  const path = [to];
  for (let guard = 0; guard < 2048; guard++) {
    const buoc = truoc.get(path[0] ?? '');
    if (buoc === undefined) break;
    path.unshift(buoc);
    if (buoc === from) break;
  }

  let km = 0;
  let needsShip = false;
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1];
    const b = path[index];
    if (a === undefined || b === undefined) continue;
    const link = linkBetween(a, b);
    if (link === null) continue;
    km += link.km;
    if (campaignConfig().linkKind[link.kind]?.needsShip === true) needsShip = true;
  }

  return { path, km: Math.round(km), days: Math.max(1, Math.round(ngay.get(to) ?? 0)), needsShip, unreachable: false };
}

// ---------------------------------------------------------------------------
// Lệnh hành quân
// ---------------------------------------------------------------------------

function armyOf(campaign: CampaignSliceState, armyId: string): CampaignArmy | null {
  return campaign.armies.find((row) => row.id === armyId) ?? null;
}

function thayArmy(campaign: CampaignSliceState, armyId: string, next: CampaignArmy): CampaignSliceState {
  return { ...campaign, armies: campaign.armies.map((row) => (row.id === armyId ? next : row)) };
}

/** Đặt một đạo quân MỚI lên bản đồ. Ngoại lệ duy nhất, và chỉ cho quân chưa có. */
export function deployArmy(
  campaign: CampaignSliceState,
  army: Omit<CampaignArmy, 'stance' | 'march' | 'siegeNodeId'>,
): MarchOutcome {
  if (armyOf(campaign, army.id) !== null) {
    return { campaign, lines: [], refused: `đạo quân ${army.id} đã có trên chiến đồ — muốn dời nó thì ra lệnh hành quân`, route: null };
  }
  const node = campaignNode(army.nodeId);
  if (node === null) return { campaign, lines: [], refused: `không có ô ${army.nodeId}`, route: null };
  if (node.level !== 3) return { campaign, lines: [], refused: 'quân chỉ đứng ở tầng huyện', route: null };

  const next: CampaignArmy = { ...army, stance: 'dong-quan', march: null, siegeNodeId: '' };
  return {
    campaign: { ...campaign, armies: [...campaign.armies, next] },
    lines: [`${army.name} tập kết tại ${node.name}.`],
    refused: '',
    route: null,
  };
}

/**
 * RA LỆNH HÀNH QUÂN. Đây là cách DUY NHẤT một đạo quân đổi chỗ.
 *
 * Đích có thể là một ô ở bất cứ tầng nào: lệnh "về Pháp" hạ xuống thủ phủ của
 * Pháp. Không tới được thì lệnh bị từ chối, và đạo quân đứng nguyên chỗ cũ —
 * không có chuyện "đi được nửa đường rồi tính sau".
 */
export function orderMarch(
  campaign: CampaignSliceState,
  params: { armyId: string; toNodeId: string; kmPerDay?: number },
): MarchOutcome {
  const army = armyOf(campaign, params.armyId);
  if (army === null) return { campaign, lines: [], refused: `không có đạo quân ${params.armyId}`, route: null };

  const kmPerDay = params.kmPerDay ?? DI_BO();
  const dich = seatDistrictOf(params.toNodeId);
  if (dich === '') return { campaign, lines: [], refused: `không có ô ${params.toNodeId}`, route: null };
  if (dich === army.nodeId && army.march === null) {
    return { campaign, lines: [], refused: `${army.name} đã ở đó rồi`, route: null };
  }

  const route = campaignRoute(army.nodeId, dich, kmPerDay);
  if (route.unreachable || route.path.length < 2) {
    const ten = campaignNode(dich)?.name ?? dich;
    return { campaign, lines: [], refused: `không có đường từ chỗ ${army.name} tới ${ten}`, route: null };
  }

  const march: MarchOrder = {
    path: route.path,
    legIndex: 0,
    legProgress: 0,
    kmPerDay,
    kmDone: 0,
    kmTotal: route.km,
    needsShip: route.needsShip,
  };

  const next: CampaignArmy = { ...army, stance: 'hanh-quan', march, siegeNodeId: '' };
  const tenDich = campaignNode(dich)?.name ?? dich;
  const lines = [
    `${army.name} nhổ trại đi ${tenDich}: ${String(route.km)} km, ${String(route.path.length - 1)} chặng, chừng ${String(route.days)} ngày${
      route.needsShip ? ' — có chặng đường biển, phải có thuyền' : ''
    }.`,
  ];

  return {
    campaign: withChronicle(
      // Nhấc vây khi rời đi: một đạo quân đang trên đường thì không còn vây ai.
      { ...thayArmy(campaign, army.id, next), sieges: campaign.sieges.filter((row) => row.armyId !== army.id) },
      lines,
    ),
    lines,
    refused: '',
    route,
  };
}

/**
 * CỬA DUY NHẤT CHO NGƯỜI KỂ CHUYỆN.
 *
 * AI đọc được câu "đạo quân tiến về Vienna" từ chính văn bản nó vừa viết ra, và
 * nó sẽ muốn ghi thẳng vị trí mới. Hàm này nhận đúng ý định ấy và đổi nó thành
 * một lệnh hành quân: hướng đi là của người kể, còn thời gian là của engine.
 *
 * Trả về `refused` khi không có đường — và khi ấy đạo quân KHÔNG nhúc nhích,
 * đúng như R4: thà một câu văn sai còn hơn một state sai.
 */
export function moveArmyFromNarrative(campaign: CampaignSliceState, armyId: string, destNodeId: string): MarchOutcome {
  const army = armyOf(campaign, armyId);
  if (army === null) return { campaign, lines: [], refused: `không có đạo quân ${armyId}`, route: null };
  const kmPerDay = army.march?.kmPerDay ?? DI_BO();
  return orderMarch(campaign, { armyId, toNodeId: destNodeId, kmPerDay });
}

/**
 * Cho thời gian trôi: mọi đạo quân đang đi tiến thêm `days` ngày.
 *
 * Mùa nhân vào tốc độ, đúng bảng của `config.march.seasonFactor`: mùa đông
 * đường lầy và đèo đóng, một chuyến bốn ngày mùa hè thành gần bảy ngày.
 */
export function advanceMarches(
  campaign: CampaignSliceState,
  days: number,
  season?: SeasonId,
): { campaign: CampaignSliceState; lines: string[] } {
  if (days <= 0) return { campaign, lines: [] };
  const mua = heSoMua(season);
  const lines: string[] = [];

  const armies = campaign.armies.map((army) => {
    if (army.stance !== 'hanh-quan' || army.march === null) return army;

    const march: MarchOrder = { ...army.march, path: [...army.march.path] };
    let conLai = days;
    let nodeId = army.nodeId;

    for (let guard = 0; guard < 512 && conLai > 1e-6; guard++) {
      const from = march.path[march.legIndex];
      const to = march.path[march.legIndex + 1];
      if (from === undefined || to === undefined) break;

      const link = linkBetween(from, to);
      if (link === null) {
        // Bản đồ đã đổi dưới chân một chuyến đang đi (sinh lại chiến đồ giữa
        // ván). Dừng lại ở ô hiện tại thay vì đi tiếp trên một cạnh không còn
        // tồn tại — R4: không crash, không đi bừa.
        lines.push(`${army.name} mất đường giữa chừng và dừng lại ở ${campaignNode(from)?.name ?? from}.`);
        return { ...army, nodeId: from, stance: 'dong-quan' as const, march: null };
      }

      const tocDo = Math.max(1, march.kmPerDay * mua * heSoChang(from, to));
      const conCuaChang = link.km * (1 - march.legProgress);
      const diDuoc = tocDo * conLai;

      if (diDuoc + 1e-9 >= conCuaChang) {
        conLai -= conCuaChang / tocDo;
        march.kmDone += conCuaChang;
        march.legIndex += 1;
        march.legProgress = 0;
        nodeId = to;
        if (march.legIndex >= march.path.length - 1) {
          lines.push(`${army.name} tới ${campaignNode(to)?.name ?? to}.`);
          return { ...army, nodeId: to, stance: 'dong-quan' as const, march: null };
        }
      } else {
        march.legProgress = Math.min(1, march.legProgress + diDuoc / Math.max(1, link.km));
        march.kmDone += diDuoc;
        conLai = 0;
      }
    }

    return { ...army, nodeId, march };
  });

  return { campaign: withChronicle({ ...campaign, armies }, lines), lines };
}

/** Vị trí để vẽ và để trả lời câu "đạo quân ấy đang ở đâu". */
export function placementOf(army: CampaignArmy): ArmyPlacement {
  if (army.stance !== 'hanh-quan' || army.march === null) {
    return { armyId: army.id, fromId: army.nodeId, toId: '', t: 0, moving: false, kmLeft: 0, daysLeft: 0, nearestId: army.nodeId };
  }
  const march = army.march;
  const from = march.path[march.legIndex] ?? army.nodeId;
  const to = march.path[march.legIndex + 1] ?? from;
  const kmLeft = Math.max(0, march.kmTotal - march.kmDone);
  return {
    armyId: army.id,
    fromId: from,
    toId: to,
    t: march.legProgress,
    moving: true,
    kmLeft: Math.round(kmLeft),
    daysLeft: Math.max(1, Math.round(kmLeft / Math.max(1, march.kmPerDay))),
    nearestId: march.legProgress < 0.5 ? from : to,
  };
}

/** Đạo quân đang đứng (hoặc đang vây) tại đúng ô này. */
export function armiesAt(campaign: CampaignSliceState, nodeId: string): CampaignArmy[] {
  return campaign.armies.filter((army) => army.stance !== 'hanh-quan' && army.nodeId === nodeId);
}

/**
 * Quân nhìn thấy được khi đang xem một nút ở tầng `level`.
 *
 * Ở tầng quốc gia, một đạo quân trong huyện Aubicourt phải hiện lên trên ô Pháp
 * — nếu không thì bản đồ chiến dịch không nói được câu quan trọng nhất của nó:
 * *"quân đang ở đâu"*.
 */
export function armiesUnder(campaign: CampaignSliceState, nodeId: string, level: CampaignLevel): CampaignArmy[] {
  const duoi = new Set(idsUnder(nodeId, level));
  return campaign.armies.filter((army) => {
    const placement = placementOf(army);
    return duoi.has(placement.fromId) || (placement.toId !== '' && duoi.has(placement.toId));
  });
}

function idsUnder(nodeId: string, level: CampaignLevel): string[] {
  const node = campaignNode(nodeId);
  if (node === null) return [];
  if (node.level >= level) return [node.id];
  const rows: string[] = [];
  for (const child of childrenOfNode(node.id)) rows.push(...idsUnder(child.id, level));
  return rows;
}

// ---------------------------------------------------------------------------
// Vây thành
// ---------------------------------------------------------------------------

/**
 * BẮT ĐẦU VÂY. Đạo quân phải ĐANG ĐỨNG ở đúng ô ấy — không vây từ xa được.
 *
 * Cuộc vây ở đây chỉ là một cái ĐỒNG HỒ và một cái ghim trên bản đồ. Trận vây
 * thật, với tường nhiều lớp, bệnh dịch và đàm phán, là Phần 11 ở
 * `src/systems/siege/` — chiến đồ không tính lại điều đó, nó chỉ nhớ ai đang
 * ngồi trước cổng nào và đã ngồi bao lâu.
 */
export function beginSiege(campaign: CampaignSliceState, armyId: string, nodeId: string): MarchOutcome {
  const army = armyOf(campaign, armyId);
  if (army === null) return { campaign, lines: [], refused: `không có đạo quân ${armyId}`, route: null };
  const node = campaignNode(nodeId);
  if (node === null) return { campaign, lines: [], refused: `không có ô ${nodeId}`, route: null };
  if (army.nodeId !== nodeId || army.stance === 'hanh-quan') {
    return { campaign, lines: [], refused: `${army.name} chưa tới ${node.name} — vây thành thì phải đứng trước cổng`, route: null };
  }
  const site = campaignConfig().site[node.site];
  if (site === undefined || !site.objective) {
    return { campaign, lines: [], refused: `${node.name} không có gì để vây`, route: null };
  }
  if (campaign.sieges.some((row) => row.nodeId === nodeId && row.armyId === armyId)) {
    return { campaign, lines: [], refused: 'đang vây rồi', route: null };
  }

  const lines = [`${army.name} khép vòng vây quanh ${node.siteName === '' ? node.name : node.siteName}.`];
  const next = thayArmy(campaign, armyId, { ...army, stance: 'vay-thanh', siegeNodeId: nodeId, march: null });
  return {
    campaign: withChronicle(
      {
        ...next,
        sieges: [
          ...campaign.sieges.filter((row) => row.armyId !== armyId),
          { nodeId, attackerId: army.factionId, armyId, weeks: 0, weeksNeeded: site.siegeWeeks },
        ],
      },
      lines,
    ),
    lines,
    refused: '',
    route: null,
  };
}

export function liftSiege(campaign: CampaignSliceState, armyId: string): CampaignSliceState {
  return {
    ...campaign,
    sieges: campaign.sieges.filter((row) => row.armyId !== armyId),
    armies: campaign.armies.map((army) =>
      army.id === armyId && army.stance === 'vay-thanh' ? { ...army, stance: 'dong-quan', siegeNodeId: '' } : army,
    ),
  };
}

export interface SiegeTickResult {
  campaign: CampaignSliceState;
  lines: string[];
  /** Thị trấn đã hết hạn phong toả và tự đổi chủ trong tuần này. */
  fallen: { nodeId: string; factionId: string }[];
  /** Thành trì đã vây đủ tuần: tới lượt Phần 11 quyết, chiến đồ không tự quyết. */
  ready: string[];
}

/**
 * Cho đồng hồ vây chạy thêm mấy tuần.
 *
 * THỊ TRẤN tường thấp: phong toả đủ lâu là mở cổng, và chiến đồ tự xử.
 * THÀNH TRÌ thì KHÔNG: nó chỉ được đánh dấu "đã đủ tuần", còn kết cục là của
 * Phần 11. Chiến đồ tự cho một toà thành thất thủ là dựng một engine công thành
 * thứ hai chạy song song với engine thật, và hai engine ấy sẽ nói khác nhau.
 */
export function advanceSieges(campaign: CampaignSliceState, weeks: number): SiegeTickResult {
  if (weeks <= 0) return { campaign, lines: [], fallen: [], ready: [] };

  const lines: string[] = [];
  const fallen: { nodeId: string; factionId: string }[] = [];
  const ready: string[] = [];

  const sieges = campaign.sieges.map((row) => {
    const next = { ...row, weeks: row.weeks + weeks };
    const node = campaignNode(row.nodeId);
    if (node === null || next.weeks < next.weeksNeeded) return next;
    if (node.site === 'thi-tran') fallen.push({ nodeId: row.nodeId, factionId: row.attackerId });
    else if (!ready.includes(row.nodeId)) {
      ready.push(row.nodeId);
      lines.push(`${node.siteName === '' ? node.name : node.siteName} đã bị vây ${String(Math.round(next.weeks))} tuần — trong thành bắt đầu đói.`);
    }
    return next;
  });

  return { campaign: withChronicle({ ...campaign, sieges }, lines), lines, fallen, ready };
}
