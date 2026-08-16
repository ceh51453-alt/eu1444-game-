/** Dựng dã chiến từ đạo quân thật và vị trí thật trên chiến đồ. */
import type { Rng } from '@/core/rng';
import type { GameState } from '@/state/slices';
import { characterOf } from '@/systems/character';
import { campaignNode, campaignStateOf } from '@/systems/campaign';
import { militaryStateOf, type MilitaryForce } from '@/systems/military';
import { primaryTitleOf } from '@/systems/titles';
import { createBattle, type BattleState, type ForceSpec, type WingId } from '@/minigames/battle';

const WINGS: readonly WingId[] = ['ta', 'trung', 'huu', 'du-bi'];

/**
 * ĐỘI HÌNH CHUẨN cho một đạo quân mà state KHÔNG mô hình hoá tới từng đơn vị.
 *
 * Quân của AI trên chiến đồ chỉ mang một con số `troops` để vẽ nhãn — chúng
 * không có `forceId`, nên không có danh sách đơn vị nào trong slice `military`
 * để đọc. Đó là một lỗ hổng có thật của mô hình dữ liệu, không phải chỗ này
 * lười; khai ra ở đây thay vì giấu.
 *
 * Cái hàm này KHÔNG BAO GIỜ bịa quân số. `troops` luôn là con số thật lấy từ
 * chiến đồ; thứ duy nhất được suy ra là TỈ LỆ binh chủng. Bản trước có một
 * tham số `troops = 1800` mặc định, và cái mặc định ấy chính là chỗ người chơi
 * nhìn thấy 1.800 quân của mình trong khi slice `military` nói không có ai.
 */
function standingOrderOfBattle(name: string, troops: number, commanderName: string): ForceSpec {
  return {
    name,
    troops: Math.max(1, Math.round(troops)),
    composition: [
      { typeId: 'unit_hiep-si-giap-tam', share: 1, wing: 'ta' },
      { typeId: 'unit_bo-binh-thue', share: 3, wing: 'trung' },
      { typeId: 'unit_cung-thu', share: 2, wing: 'huu' },
      { typeId: 'unit_bo-binh-lang', share: 2, wing: 'du-bi' },
    ],
    commanderName,
  };
}

function forceSpec(force: MilitaryForce, commanderName: string, faction: string): ForceSpec | null {
  const alive = force.units.filter((unit) => unit.strength > 0);
  const troops = alive.reduce((sum, unit) => sum + unit.strength, 0);
  if (troops <= 0) return null;
  const byType = new Map<string, number>();
  for (const unit of alive) byType.set(unit.typeId, (byType.get(unit.typeId) ?? 0) + unit.strength);
  return {
    name: force.name,
    faction,
    troops,
    composition: [...byType].map(([typeId, strength], index) => ({
      typeId,
      share: strength,
      wing: WINGS[index % WINGS.length] ?? 'trung',
    })),
    commanderName: force.commander || commanderName,
  };
}

/**
 * Kẻ địch ĐANG ĐỨNG TRƯỚC MẶT trên chiến đồ.
 *
 * Tìm theo ô, không theo phe: hai đạo quân cùng một ô là hai đạo quân nhìn thấy
 * nhau. `availableEncounters().battle` đã bảo đảm có một cái ở đó trước khi màn
 * hình này mở, nên nhánh "không có ai" dưới đây chỉ còn là lưới an toàn cho
 * đường gọi từ truyện.
 */
function enemySpec(state: GameState, playerForceId: string, ourTroops: number): { force: ForceSpec; place: string } {
  const campaign = campaignStateOf(state);
  const playerArmy = campaign?.armies.find((army) => army.forceId === playerForceId);
  const enemy = playerArmy === undefined
    ? undefined
    : campaign?.armies.find((army) => army.nodeId === playerArmy.nodeId && army.factionId !== playerArmy.factionId);
  if (enemy !== undefined) {
    return {
      force: standingOrderOfBattle(enemy.name, Math.max(80, enemy.troops), 'Chủ soái đối phương'),
      place: campaignNode(enemy.nodeId)?.name ?? 'vị trí tranh chấp trên chiến đồ',
    };
  }
  return {
    force: standingOrderOfBattle('Đạo quân đối phương', Math.max(80, Math.round(ourTroops * 0.9)), 'Chủ soái đối phương'),
    place: 'vùng biên đang tranh chấp',
  };
}

export function createFieldBattle(state: GameState, rng: Rng, turn: number): BattleState {
  const character = characterOf(state);
  const name = character?.identity.name ?? '';
  const military = militaryStateOf(state);
  const campaign = campaignStateOf(state);
  const contested = campaign?.armies.find((army) =>
    army.factionId === campaign.playerFactionId
    && campaign.armies.some((other) => other.nodeId === army.nodeId && other.factionId !== army.factionId),
  );
  const land = military?.forces.find((force) => force.id === contested?.forceId)
    ?? military?.forces.find((force) => force.kind === 'land' && force.units.some((unit) => unit.strength > 0));
  const faction = campaign?.playerFactionId ?? character?.allegiance.nationId ?? '';
  // QUÂN CỦA NGƯỜI CHƠI luôn đọc từ slice `military` — từng đơn vị, từng người
  // còn sống. Không có thì lấy con số ước lượng trên chiến đồ, và chỉ khi cả hai
  // đều không có mới tới lượt số 1. Không có đường nào ở đây sinh ra một quân
  // số không nằm trong state, vì sau trận `battleCampaignOps` sẽ ghi thương
  // vong NGƯỢC về chính những con số ấy.
  const ours =
    (land === undefined ? null : forceSpec(land, name === '' ? 'Chủ soái' : name, faction)) ??
    standingOrderOfBattle(
      contested?.name ?? 'Đạo quân của người chơi',
      contested?.troops ?? 1,
      name === '' ? 'Chủ soái' : name,
    );
  const enemy = enemySpec(state, land?.id ?? '', ours.troops);
  const title = primaryTitleOf(state);
  const commander = land?.commander || name || 'Chủ soái';

  return createBattle(rng, {
    a: ours,
    b: enemy.force,
    fieldId: 'field_suon-doi',
    playerSide: 'a',
    titleId: title?.titleId ?? 'hiep-si',
    playerWing: 'huu',
    lordName: commander,
    state,
    turn,
    stakes: campaign === null ? 'quyền kiểm soát vùng biên và sự sống còn của đạo quân' : 'vị trí quân sự trên chiến đồ',
    setting: {
      place: enemy.place,
      witnesses: name === '' ? 'dân cư quanh chiến trường' : `binh sĩ hai bên và những người biết mặt ${name}`,
    },
  });
}
