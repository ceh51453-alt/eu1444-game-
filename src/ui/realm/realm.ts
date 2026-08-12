/**
 * MỞ MÀN HÌNH LÃNH THỔ TỪ VÁN CHƠI ĐANG CHẠY.
 *
 * Ưu tiên state đã có. Chỉ khi chưa cai trị vùng nào thì mới dựng một vạch xuất
 * phát từ LỚP KHAI BÁO của Phần 6 (`character.fiefs`, `character.realmRole`) —
 * đúng như bảng tra của README mục 5 nói: `starting-possessions.json` là nơi
 * người chơi KHAI mình giữ cái gì, còn hệ thật là Phần 13.
 *
 * Người chơi không có thái ấp nào thì trả về `null`, và màn hình không mở. Đó là
 * mục 11: bảng của một bậc chưa đạt KHÔNG TỒN TẠI, không phải hiện ra rồi khóa.
 */

import type { GameState } from '@/state/slices';
import type { GameDate } from '@/core/clock';
import { characterOf } from '@/systems/character/slice';
import { grantTitle, heldTitles, titleOf, type HeldTitle } from '@/systems/titles';
import {
  createRealm,
  createVassal,
  defaultRates,
  realmStateOf,
  vassalsStateOf,
  type RealmSliceState,
  type VassalsSliceState,
} from '@/systems/realm';
import {
  militaryResourcesOf,
  militaryStateOf,
  ensureLogisticsNetwork,
  type MilitaryResources,
  type MilitarySliceState,
} from '@/systems/military';

export interface OpenRealm {
  realm: RealmSliceState;
  vassals: VassalsSliceState;
  titles: HeldTitle[];
  date: GameDate;
  military: MilitarySliceState;
  militaryResources: MilitaryResources;
}

/** Thế lực nào thì lấy tỉnh của thế lực ấy. Chưa khai thì mặc định Đế quốc. */
const REALM_BY_NATION: Readonly<Record<string, string>> = {
  nation_hre: 'realm_hre',
};

export function openRealm(state: GameState): OpenRealm | null {
  const date = state.meta.gameDate;
  const baseMilitary = militaryStateOf(state);
  if (baseMilitary === null) return null;
  const militaryResources = militaryResourcesOf(state);
  const military = ensureLogisticsNetwork(baseMilitary, militaryResources);
  const character = characterOf(state);

  const existingTitles = heldTitles(state);
  const existingRealm = realmStateOf(state);
  const existingVassals = vassalsStateOf(state);

  if (existingTitles.length > 0 && existingRealm !== null && existingVassals !== null) {
    return { realm: existingRealm, vassals: existingVassals, titles: existingTitles, date, military, militaryResources };
  }

  // LỚP KHAI BÁO của Phần 6: người chơi đã nói mình giữ thái ấp nào lúc tạo nhân
  // vật. Dựng tờ giấy thật từ đó — `duoc-phong` vì một khai báo lúc tạo nhân vật
  // là một thứ đã có sẵn, không phải một thứ vừa đoạt được.
  const declared = character?.fiefs ?? [];
  const titles: HeldTitle[] = declared
    .filter((fief) => titleOf(fief.title) !== null)
    .map((fief) =>
      grantTitle({
        titleId: fief.title,
        fiefName: fief.name === '' ? `Thái ấp ${titleOf(fief.title)?.name ?? fief.title}` : fief.name,
        path: 'duoc-phong',
        year: date.year,
        liege: fief.liege,
        note: fief.note,
      }),
    );

  if (titles.length === 0) return null;

  const nationId = character?.allegiance.nationId ?? '';
  const highest = titles.reduce((best, row) => ((titleOf(row.titleId)?.rank ?? 0) > (titleOf(best.titleId)?.rank ?? 0) ? row : best));
  const provinceCap = titleOf(highest.titleId)?.provinceCap ?? 0;

  const realm =
    provinceCap === 0
      ? { ...createRealm({ slug: 'chua-cai-tri', name: 'Chưa cai trị vùng nào' }), taxRates: defaultRates() }
      : createRealm({
          slug: 'khoi-dau',
          // LUÔN kèm loại từ, và KHÔNG trùng tên thành trì nào (Phụ lục A mục 9a, 9c).
          name: `${titleOf(highest.titleId)?.name ?? 'Thái ấp'} quốc Khởi Đầu`,
          fromRealmId: REALM_BY_NATION[nationId] ?? 'realm_hre',
          fiefId: highest.fiefId,
          treasury: 400,
        });

  // Chỉ giữ đúng số tỉnh mà bậc ấy cho phép: một nam tước không cai một công quốc.
  const provinces = realm.provinces.slice(0, provinceCap);

  // Chư hầu chỉ tồn tại từ bậc bá tước (mục 2). Dưới bậc ấy danh sách RỖNG, và đó
  // là một ranh giới thiết kế chứ không phải một con số cân bằng.
  const vassals: VassalsSliceState = { list: [], factions: [], rumours: [] };
  if ((titleOf(highest.titleId)?.rank ?? 0) >= 4) {
    const names = ['Reinhard', 'Otto', 'Hilda'];
    vassals.list = provinces.slice(0, names.length).map((province, index) =>
      createVassal({
        slug: `chu-hau-${String(index + 1)}`,
        name: `Nam tước ${names[index] ?? 'vô danh'}`,
        titleId: 'nam-tuoc',
        provinceIds: [province.id],
        holdingCount: 1,
        levyMen: 200,
      }),
    );
  }

  return { realm: { ...realm, provinces }, vassals, titles, date, military, militaryResources };
}
