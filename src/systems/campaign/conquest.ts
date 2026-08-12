/**
 * LUẬT CHINH PHỤC — vì sao một ô đổi màu, và khi nào cả một tầng đổ theo.
 *
 * MỘT CÂU LUẬT DUY NHẤT, và mọi thứ trong file này chỉ là cách phát biểu lại nó:
 *
 *   Chiếm được một VÙNG khi mọi THÀNH TRÌ và THỊ TRẤN bên trong đã đổi chủ,
 *   hoặc khi chủ của nó chịu làm CHƯ HẦU. Chiếm được một QUỐC GIA khi mọi vùng
 *   của nó đã đổ theo đúng hai đường ấy.
 *
 * Làng không tính. Một đạo quân đi qua ba cái làng vẫn chưa lấy được gì cả — và
 * đó là chủ ý: nếu làng cũng tính thì chiến dịch biến thành cuộc chạy đua giẫm
 * lên đất trống, không ai cần vây thành nữa.
 *
 * MÀU SUY RA CHỨ KHÔNG LƯU. Slice chỉ ghi những mục tiêu đã đổi chủ; màu của
 * vùng và của quốc gia tính lại từ đó mỗi lần vẽ. Lưu màu là lưu một bản sao của
 * một thứ tính được, và bản sao ấy sẽ lệch đúng vào lúc một chư hầu phản bội.
 *
 * HAI CHỮ "GIỮ" KHÁC NHAU, và lẫn chúng là làm hỏng cả hệ:
 *   `holderOf`      — phe THẬT SỰ cầm ô ấy trong tay.
 *   `controllerOf`  — tôn chủ trên cùng của phe ấy. Đây mới là màu nền của ô.
 * Một ô của Burgundy khi Burgundy làm chư hầu Pháp sẽ có nền Pháp và sọc
 * Burgundy: nhìn một cái là biết đất ấy nghe lệnh ai, và vẫn còn của ai.
 */

import { campaignConfig, campaignNode, factionColor, factionName, isObjective, nodesAtLevel, objectivesUnder } from './data';
import { withChronicle, type CampaignSliceState } from './slice';
import type { CampaignNode, ConquestProgress, NodeStatus } from './types';

export interface ConquestOutcome {
  campaign: CampaignSliceState;
  lines: string[];
  /** Rỗng khi hành động được chấp nhận. */
  refused: string;
}

// ---------------------------------------------------------------------------
// Chư hầu
// ---------------------------------------------------------------------------

/** Chuỗi tôn chủ tính từ phe này đi lên, KHÔNG gồm chính nó. Có chốt chống vòng. */
export function overlordChain(campaign: CampaignSliceState, factionId: string): string[] {
  const rows: string[] = [];
  const seen = new Set<string>([factionId]);
  let current = campaign.vassals[factionId] ?? '';
  for (let guard = 0; guard < 16 && current !== '' && !seen.has(current); guard++) {
    rows.push(current);
    seen.add(current);
    current = campaign.vassals[current] ?? '';
  }
  return rows;
}

/** Tôn chủ trên cùng. Phe độc lập trả về chính nó. */
export function topLiegeOf(campaign: CampaignSliceState, factionId: string): string {
  if (factionId === '') return '';
  const chain = overlordChain(campaign, factionId);
  return chain[chain.length - 1] ?? factionId;
}

/** `factionId` có nằm dưới trướng `overlordId` không (kể cả gián tiếp). */
export function isUnder(campaign: CampaignSliceState, factionId: string, overlordId: string): boolean {
  if (factionId === '' || overlordId === '') return false;
  if (factionId === overlordId) return true;
  return overlordChain(campaign, factionId).includes(overlordId);
}

/** Phe ấy cộng mọi chư hầu trực tiếp và gián tiếp của nó. */
export function loyalTo(campaign: CampaignSliceState, overlordId: string): Set<string> {
  const rows = new Set<string>([overlordId]);
  for (const vassalId of Object.keys(campaign.vassals)) {
    if (isUnder(campaign, vassalId, overlordId)) rows.add(vassalId);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Ai đang giữ ô nào
// ---------------------------------------------------------------------------

/** Phe thật sự cầm ô này. Ô suy ra từ con thì trả về chủ chung của các con. */
export function holderOf(campaign: CampaignSliceState, nodeId: string): string {
  const node = campaignNode(nodeId);
  if (node === null) return '';
  if (node.water) return '';

  if (node.level === 3) {
    if (isObjective(node)) return campaign.control[node.id] ?? node.ownerId;
    // Làng và ô trống đi theo vùng của chúng: chúng không phải mục tiêu, nên
    // không có tiếng nói riêng về việc ai đang cai quản.
    return node.parentId === null ? node.ownerId : holderOf(campaign, node.parentId);
  }

  const mucTieu = objectivesUnder(node.id);
  if (mucTieu.length === 0) return node.ownerId;

  const chu = new Set(mucTieu.map((row) => campaign.control[row.id] ?? row.ownerId));
  const dau = [...chu][0];
  if (chu.size === 1 && dau !== undefined) return dau;

  // Còn tranh chấp: đất vẫn thuộc chủ cũ cho tới khi mục tiêu cuối cùng đổ.
  return node.ownerId;
}

/** Tôn chủ trên cùng của phe đang giữ ô — chính là MÀU NỀN của ô trên bản đồ. */
export function controllerOf(campaign: CampaignSliceState, nodeId: string): string {
  return topLiegeOf(campaign, holderOf(campaign, nodeId));
}

export function statusOf(campaign: CampaignSliceState, nodeId: string): NodeStatus {
  const node = campaignNode(nodeId);
  if (node === null || node.water) return 'nguyen-ven';

  if (node.level === 3) {
    if (!isObjective(node)) return node.parentId === null ? 'nguyen-ven' : statusOf(campaign, node.parentId);
    const holder = campaign.control[node.id] ?? node.ownerId;
    return holder === node.ownerId ? 'nguyen-ven' : 'da-doi-chu';
  }

  const mucTieu = objectivesUnder(node.id);
  if (mucTieu.length === 0) return 'nguyen-ven';
  const doiChu = mucTieu.filter((row) => (campaign.control[row.id] ?? row.ownerId) !== row.ownerId);
  if (doiChu.length === 0) return 'nguyen-ven';
  return doiChu.length === mucTieu.length ? 'da-doi-chu' : 'tranh-chap';
}

export interface NodePaint {
  /** Màu nền: tôn chủ trên cùng. */
  fill: string;
  /** Màu sọc, rỗng nếu không cần sọc. Chư hầu và vùng tranh chấp thì có. */
  stripe: string;
  status: NodeStatus;
  holderId: string;
  controllerId: string;
}

/**
 * MÀU CỦA MỘT Ô — một chỗ duy nhất tính, để bản đồ và bảng chú giải không bao
 * giờ nói hai điều khác nhau.
 */
export function paintOf(campaign: CampaignSliceState, nodeId: string): NodePaint {
  const node = campaignNode(nodeId);
  const status = statusOf(campaign, nodeId);
  const holderId = holderOf(campaign, nodeId);
  const controllerId = topLiegeOf(campaign, holderId);

  if (node !== null && node.water) {
    return { fill: '#2c4a5e', stripe: '', status: 'nguyen-ven', holderId: '', controllerId: '' };
  }

  let stripe = '';
  if (holderId !== '' && controllerId !== '' && holderId !== controllerId) {
    // Chư hầu: nền tôn chủ, sọc màu cũ.
    stripe = factionColor(holderId);
  } else if (status === 'tranh-chap') {
    // Tranh chấp: sọc màu của kẻ đang nắm nhiều mục tiêu nhất trong vùng.
    stripe = factionColor(leadingAttackerOf(campaign, nodeId));
  }

  // NỀN LÀ MÀU TÔN CHỦ, không phải màu người cầm ô: đất của một chư hầu nghe
  // lệnh ai thì trên bản đồ nó phải mang màu của người ấy, còn chuyện nó vẫn
  // của ai thì sọc nói.
  return { fill: factionColor(controllerId === '' ? holderId : controllerId), stripe, status, holderId, controllerId };
}

/** Phe ngoài đang nắm nhiều mục tiêu nhất bên trong nút này. */
export function leadingAttackerOf(campaign: CampaignSliceState, nodeId: string): string {
  const node = campaignNode(nodeId);
  if (node === null) return '';
  const dem = new Map<string, number>();
  for (const row of objectivesUnder(nodeId)) {
    const holder = campaign.control[row.id] ?? row.ownerId;
    if (holder === row.ownerId || holder === '') continue;
    dem.set(holder, (dem.get(holder) ?? 0) + 1);
  }
  let tot = '';
  let nhieuNhat = 0;
  for (const [phe, so] of dem) {
    if (so > nhieuNhat) {
      tot = phe;
      nhieuNhat = so;
    }
  }
  return tot;
}

// ---------------------------------------------------------------------------
// Tiến độ chinh phục
// ---------------------------------------------------------------------------

/**
 * "Muốn lấy chỗ này thì còn phải hạ những gì."
 *
 * THỦ PHỦ LUÔN XẾP CUỐI trong `remaining` (`conquest.seatFallsLast`): người chơi
 * đọc danh sách từ trên xuống là ra đúng thứ tự phải đánh, và cái tên cuối cùng
 * luôn là cái tên đáng sợ nhất.
 */
export function conquestOf(campaign: CampaignSliceState, nodeId: string, attackerId: string): ConquestProgress {
  const node = campaignNode(nodeId);
  const rong: ConquestProgress = {
    nodeId,
    attackerId,
    total: 0,
    held: 0,
    byVassal: 0,
    remaining: [],
    fallen: false,
    byHomage: false,
  };
  if (node === null || attackerId === '') return rong;

  // Chủ của cả nút này đã thần phục: cả vùng đổi màu mà không mất một mũi tên.
  const chuNut = node.ownerId;
  const byHomage = chuNut !== '' && chuNut !== attackerId && isUnder(campaign, chuNut, attackerId);

  const mucTieu = objectivesUnder(nodeId);
  const trungThanh = loyalTo(campaign, attackerId);
  const remaining: CampaignNode[] = [];
  let held = 0;
  let byVassal = 0;

  for (const row of mucTieu) {
    const holder = campaign.control[row.id] ?? row.ownerId;
    if (trungThanh.has(holder)) {
      held += 1;
      if (holder !== attackerId) byVassal += 1;
      continue;
    }
    remaining.push(row);
  }

  remaining.sort((left, right) => Number(left.seat) - Number(right.seat) || left.name.localeCompare(right.name));

  return {
    nodeId,
    attackerId,
    total: mucTieu.length,
    held,
    byVassal,
    remaining: remaining.map((row) => row.id),
    fallen: byHomage || (mucTieu.length > 0 && remaining.length === 0),
    byHomage,
  };
}

/** Mọi vùng và quốc gia mà phe này đang kiểm soát trọn vẹn. */
export function realmsHeldBy(campaign: CampaignSliceState, factionId: string): { level2: string[]; level1: string[] } {
  const level2 = nodesAtLevel(2)
    .filter((node) => !node.water && conquestOf(campaign, node.id, factionId).fallen)
    .map((node) => node.id);
  const level1 = nodesAtLevel(1)
    .filter((node) => !node.water && conquestOf(campaign, node.id, factionId).fallen)
    .map((node) => node.id);
  return { level2, level1 };
}

// ---------------------------------------------------------------------------
// Hành động
// ---------------------------------------------------------------------------

/**
 * Ô này có chiếm được ngay bây giờ không, và nếu không thì vì sao.
 *
 * Câu trả lời "vì sao" quan trọng ngang câu trả lời có/không: người chơi đứng
 * trước một thành trì mà nút bấm bị mờ đi không lời giải thích sẽ đi tìm lỗi
 * trong game chứ không đi đánh nốt cái thị trấn còn lại.
 */
export function canCapture(campaign: CampaignSliceState, nodeId: string, factionId: string): string {
  const node = campaignNode(nodeId);
  if (node === null) return 'không có ô này trên chiến đồ';
  if (node.level !== 3) return 'chỉ chiếm được ở tầng huyện — vùng và quốc gia đổ theo mục tiêu bên trong';
  if (!isObjective(node)) return `${node.name} không phải thành trì hay thị trấn, chiếm nó không đổi được gì`;
  if (factionId === '') return 'chưa rõ phe nào đang chiếm';

  const holder = campaign.control[node.id] ?? node.ownerId;
  if (holder === factionId) return 'ô này đã trong tay ngài';
  if (isUnder(campaign, holder, factionId)) return 'ô này của chư hầu ngài — lấy nó là quay lưng với lời thề';

  if (campaignConfig().conquest.seatFallsLast && node.seat && node.parentId !== null) {
    const conLai = conquestOf(campaign, node.parentId, factionId).remaining.filter((id) => id !== node.id);
    if (conLai.length > 0) {
      const ten = conLai
        .map((id) => campaignNode(id)?.siteName ?? id)
        .slice(0, 3)
        .join(', ');
      return `${node.siteName} là thủ phủ, nó đổ sau cùng — còn ${String(conLai.length)} nơi phải hạ trước: ${ten}`;
    }
  }

  return '';
}

/** Đổi chủ một mục tiêu, rồi báo lại nếu cú đánh ấy làm đổ cả vùng hoặc cả nước. */
export function captureObjective(campaign: CampaignSliceState, nodeId: string, factionId: string): ConquestOutcome {
  const refused = canCapture(campaign, nodeId, factionId);
  if (refused !== '') return { campaign, lines: [], refused };

  const node = campaignNode(nodeId);
  if (node === null) return { campaign, lines: [], refused: 'không có ô này trên chiến đồ' };

  const truoc = campaign.control[nodeId] ?? node.ownerId;
  let next: CampaignSliceState = {
    ...campaign,
    control: { ...campaign.control, [nodeId]: factionId },
    sieges: campaign.sieges.filter((row) => row.nodeId !== nodeId),
    armies: campaign.armies.map((army) =>
      army.siegeNodeId === nodeId ? { ...army, stance: 'chiem-dong' as const, siegeNodeId: '' } : army,
    ),
  };

  const lines = [`${node.siteName === '' ? node.name : node.siteName} đổi chủ: ${tenPhe(truoc)} → ${tenPhe(factionId)}.`];

  const vung = node.parentId === null ? null : campaignNode(node.parentId);
  if (vung !== null) {
    const tienDo = conquestOf(next, vung.id, factionId);
    if (tienDo.fallen) {
      lines.push(`${vung.name} đã đổ hoàn toàn về tay ${tenPhe(factionId)}.`);
      const quocGia = vung.parentId === null ? null : campaignNode(vung.parentId);
      if (quocGia !== null && conquestOf(next, quocGia.id, factionId).fallen) {
        lines.push(`${quocGia.name} không còn một thành trì nào ngoài tầm ${tenPhe(factionId)}.`);
      }
    }
  }

  next = withChronicle(next, lines);
  return { campaign: next, lines, refused: '' };
}

/**
 * KHUẤT PHỤC LÀM CHƯ HẦU — con đường thứ hai tới cùng một kết quả.
 *
 * Đất không đổi chủ, nhưng nó đổi màu và nó tính vào cuộc chinh phục của tôn
 * chủ. Cấm vòng tròn: A thần phục B rồi B thần phục A thì cả hai cùng là tôn chủ
 * của nhau, và mọi hàm leo chuỗi ở trên sẽ chạy tới hết chốt an toàn.
 */
export function submitAsVassal(campaign: CampaignSliceState, vassalId: string, overlordId: string): ConquestOutcome {
  if (vassalId === '' || overlordId === '') return { campaign, lines: [], refused: 'thiếu tên phe' };
  if (vassalId === overlordId) return { campaign, lines: [], refused: 'một phe không thể tự thần phục chính mình' };
  if (campaign.vassals[vassalId] === overlordId) return { campaign, lines: [], refused: `${tenPhe(vassalId)} đã là chư hầu rồi` };
  if (isUnder(campaign, overlordId, vassalId)) {
    return { campaign, lines: [], refused: `${tenPhe(overlordId)} đang là chư hầu của ${tenPhe(vassalId)} — thề vòng tròn thì không ai là chủ` };
  }

  const lines = [`${tenPhe(vassalId)} tuyên thệ thần phục ${tenPhe(overlordId)}.`];
  const next = withChronicle({ ...campaign, vassals: { ...campaign.vassals, [vassalId]: overlordId } }, lines);
  return { campaign: next, lines, refused: '' };
}

/** Cắt lời thề: chư hầu tách ra, đất của nó lập tức trở lại màu của chính nó. */
export function releaseVassal(campaign: CampaignSliceState, vassalId: string): ConquestOutcome {
  const overlordId = campaign.vassals[vassalId];
  if (overlordId === undefined) return { campaign, lines: [], refused: `${tenPhe(vassalId)} không thần phục ai` };
  const vassals = { ...campaign.vassals };
  delete vassals[vassalId];
  const lines = [`${tenPhe(vassalId)} cắt lời thề với ${tenPhe(overlordId)}.`];
  return { campaign: withChronicle({ ...campaign, vassals }, lines), lines, refused: '' };
}

function tenPhe(id: string): string {
  return id === '' ? 'vô chủ' : factionName(id);
}
