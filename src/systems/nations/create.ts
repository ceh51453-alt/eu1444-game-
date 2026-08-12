/**
 * DỰNG THẾ GIỚI — tám thế lực, ma trận quan hệ, bản đồ tôn giáo.
 *
 * Chạy MỘT LẦN lúc bắt đầu ván, và mọi thứ nó dựng đều đến từ data (R5): không
 * một tên riêng, một con số, hay một tỷ lệ nào nằm trong file này. Đổi cán cân
 * khởi đầu của cả châu lục là sửa `data/nations.json`, không phải sửa đây.
 *
 * Thứ tự dựng cũng là thứ tự phụ thuộc: bảng minigame cần hạt giống của thế lực,
 * ma trận quan hệ cần danh sách thế lực, bản đồ tôn giáo cần biết vùng nào có
 * chủ. Ngược lại thì không — bản đồ tôn giáo không quyết định ai cai trị ở đâu.
 */

import { minigameOf } from '@/nations';
import { powerRows } from './data';
import { createGroup } from './demographics';
import { seedAreas } from './religion';
import { seedRelations } from './relations';
import type { NationsSliceState, ReligionsSliceState } from './slice';
import type { PowerState } from './types';

export interface CreatedWorld {
  nations: NationsSliceState;
  religions: ReligionsSliceState;
}

/** Tám thế lực lúc năm 1444 bắt đầu. */
export function createPowers(): PowerState[] {
  return powerRows().map((row) => ({
    id: row.nationId,
    minigame: row.minigame,
    treasury: row.state.treasury,
    income: row.state.income,
    prestige: row.state.prestige,
    stability: row.state.stability,
    cohesion: row.state.cohesion,
    military: row.state.military,
    land: row.state.land,
    groups: row.demographics.groups.map((group) => createGroup(group)),
    dominantMood: 55,
    board: minigameOf(row.minigame).create(row.board),
    fallen: false,
  }));
}

export function createWorld(): CreatedWorld {
  const powers = createPowers();
  const relations = seedRelations(powers.map((power) => power.id));

  // Uy tín tôn giáo khởi đầu: Giáo hội lấy đúng uy tín thiêng liêng trên bảng của
  // Giáo triều, vì hai con số ấy PHẢI là một — nếu tách ra thì một ngày bảng nói
  // Giáo hoàng đang mạnh trong khi bản đồ nói dị giáo đang bùng, và không ai biết
  // cái nào đúng.
  const papacy = powers.find((power) => power.board.kind === 'mat-nghi');
  const churchPrestige = papacy?.board.kind === 'mat-nghi' ? papacy.board.spiritualPrestige : 60;

  return {
    nations: {
      powers,
      relations,
      timeline: [],
      exiles: [],
      viewing: powers[0]?.id ?? '',
      courtRumours: [],
      opinion: [],
    },
    religions: {
      areas: seedAreas(),
      prestige: { 'rel_giao-hoi': churchPrestige },
      echoes: [],
      prophecies: [],
      miracleRumours: [],
    },
  };
}
