import { describe, expect, it } from 'vitest';
import type { GameState } from '@/state/slices';
import { runCampaignTick } from './tick';
import { handleAiMarchOrders, parseMarchOrders, stripMarchOrders } from './tags';
import {
  advanceMarches,
  advanceSieges,
  beginSiege,
  campaignConfig,
  campaignNode,
  campaignRoute,
  campaignSize,
  canCapture,
  captureObjective,
  childrenOfNode,
  conquestOf,
  controllerOf,
  deployArmy,
  emptyCampaign,
  holderOf,
  isObjective,
  linkBetween,
  moveArmyFromNarrative,
  nodesAtLevel,
  objectivesUnder,
  orderMarch,
  paintOf,
  placementOf,
  seatDistrictOf,
  statusOf,
  submitAsVassal,
  type CampaignSliceState,
} from './index';

/** Một vùng có thật để bám vào — Champagne của Pháp có trong regions.json. */
const VUNG = 'vung_champagne';
const QUOC_GIA = 'qg_france';

function chiemHet(campaign: CampaignSliceState, nodeId: string, factionId: string): CampaignSliceState {
  let next = campaign;
  // Thủ phủ đổ sau cùng, nên cứ quét đi quét lại tới khi không còn gì lấy được.
  for (let vong = 0; vong < 12; vong++) {
    const conLai = conquestOf(next, nodeId, factionId).remaining;
    if (conLai.length === 0) break;
    let doiDuoc = false;
    for (const id of conLai) {
      const result = captureObjective(next, id, factionId);
      if (result.refused === '') {
        next = result.campaign;
        doiDuoc = true;
      }
    }
    if (!doiDuoc) throw new Error(`kẹt: không lấy được gì thêm ở ${nodeId}`);
  }
  return next;
}

describe('dữ liệu chiến đồ', () => {
  it('có đủ ba tầng và mọi vùng đều có ít nhất một thành trì', () => {
    const size = campaignSize();
    expect(size.level1).toBeGreaterThan(40);
    expect(size.level2).toBeGreaterThan(100);
    expect(size.level3).toBeGreaterThan(400);
    expect(size.factions).toBeGreaterThan(30);

    for (const vung of nodesAtLevel(2)) {
      if (vung.water) continue;
      const con = childrenOfNode(vung.id);
      expect(con.some((row) => row.site === 'thanh-tri')).toBe(true);
    }
  });

  it('không hai ô anh em nào đè lên nhau — kể cả biển và đảo, vốn còn phải xa hơn', () => {
    const spacing = campaignConfig().spacing;
    const nhom = new Map<string, string[]>();
    for (const node of nodesAtLevel(1)) nhom.set(node.id, []);

    let daKiem = 0;
    const kiem = (rows: readonly ReturnType<typeof campaignNode>[]): void => {
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          const a = rows[i];
          const b = rows[j];
          if (a === null || b === null || a === undefined || b === undefined) continue;
          const khe = spacing[String(a.level)];
          if (khe === undefined) continue;
          const can = a.radius + b.radius + (a.water || b.water ? khe.nuoc : a.island || b.island ? khe.dao : khe.thuong);
          expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThanOrEqual(can - 1e-6);
          daKiem += 1;
        }
      }
    };

    kiem(nodesAtLevel(1));
    for (const cha of [...nodesAtLevel(1), ...nodesAtLevel(2)]) kiem(childrenOfNode(cha.id));
    expect(daKiem).toBeGreaterThan(2000);
    expect(nhom.size).toBeGreaterThan(0);
  });

  it('mọi cạnh nối hai ô cùng tầng và có km dương', () => {
    for (const vung of nodesAtLevel(2).slice(0, 20)) {
      for (const huyen of childrenOfNode(vung.id)) {
        for (const ke of childrenOfNode(vung.id)) {
          const link = linkBetween(huyen.id, ke.id);
          if (link === null) continue;
          expect(link.km).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('chinh phục: phải hạ hết thành trì và thị trấn thì mới lấy được vùng', () => {
  it('lấy một phần thì vùng chỉ tranh chấp, lấy hết thì vùng đổi màu', () => {
    const mucTieu = objectivesUnder(VUNG);
    expect(mucTieu.length).toBeGreaterThan(1);
    const chuCu = holderOf(emptyCampaign(), VUNG);
    expect(chuCu).not.toBe('');

    // Một mục tiêu KHÔNG PHẢI thủ phủ đổ trước: vùng chuyển sang tranh chấp.
    const khongPhaiThuPhu = mucTieu.find((row) => !row.seat);
    expect(khongPhaiThuPhu).toBeDefined();
    const buocMot = captureObjective(emptyCampaign(), khongPhaiThuPhu?.id ?? '', 'phe_hre');
    expect(buocMot.refused).toBe('');
    expect(statusOf(buocMot.campaign, VUNG)).toBe('tranh-chap');
    expect(holderOf(buocMot.campaign, VUNG)).toBe(chuCu);
    expect(conquestOf(buocMot.campaign, VUNG, 'phe_hre').fallen).toBe(false);

    // Hạ nốt: cả vùng đổi chủ, và làng trong vùng đổi màu theo dù không ai đánh.
    const xong = chiemHet(emptyCampaign(), VUNG, 'phe_hre');
    expect(conquestOf(xong, VUNG, 'phe_hre').fallen).toBe(true);
    expect(holderOf(xong, VUNG)).toBe('phe_hre');
    expect(statusOf(xong, VUNG)).toBe('da-doi-chu');

    const lang = childrenOfNode(VUNG).find((row) => !isObjective(row));
    if (lang !== undefined) expect(holderOf(xong, lang.id)).toBe('phe_hre');
  });

  it('thủ phủ đổ sau cùng: đánh thẳng vào nó bị từ chối kèm lý do', () => {
    const thuPhu = objectivesUnder(VUNG).find((row) => row.seat);
    expect(thuPhu).toBeDefined();
    const refused = canCapture(emptyCampaign(), thuPhu?.id ?? '', 'phe_hre');
    expect(refused).toContain('thủ phủ');

    const gan = chiemHet(emptyCampaign(), VUNG, 'phe_hre');
    expect(canCapture(gan, thuPhu?.id ?? '', 'phe_hre')).not.toContain('thủ phủ');
  });

  it('làng không phải mục tiêu: chiếm nó không đổi được gì', () => {
    const lang = objectivesUnder(VUNG);
    const khongMucTieu = childrenOfNode(VUNG).find((row) => !isObjective(row));
    expect(lang.every((row) => row.site !== 'lang')).toBe(true);
    if (khongMucTieu !== undefined) {
      expect(canCapture(emptyCampaign(), khongMucTieu.id, 'phe_hre')).toContain('không phải thành trì');
    }
  });

  it('chiếm hết mọi vùng thì cả quốc gia đổ', () => {
    let campaign = emptyCampaign();
    for (const vung of childrenOfNode(QUOC_GIA)) campaign = chiemHet(campaign, vung.id, 'phe_hre');
    const tienDo = conquestOf(campaign, QUOC_GIA, 'phe_hre');
    expect(tienDo.fallen).toBe(true);
    expect(tienDo.remaining).toHaveLength(0);
    expect(controllerOf(campaign, QUOC_GIA)).toBe('phe_hre');
  });
});

describe('chư hầu: con đường thứ hai tới cùng một kết quả', () => {
  it('khuất phục làm chư hầu thì đất đổi màu mà không mất một mũi tên', () => {
    const truoc = conquestOf(emptyCampaign(), QUOC_GIA, 'phe_hre');
    expect(truoc.fallen).toBe(false);

    const thuan = submitAsVassal(emptyCampaign(), 'phe_france', 'phe_hre');
    expect(thuan.refused).toBe('');

    const sau = conquestOf(thuan.campaign, QUOC_GIA, 'phe_hre');
    expect(sau.fallen).toBe(true);
    expect(sau.byHomage).toBe(true);
    // Đất VẪN của Pháp, nhưng màu nền là màu Đế quốc và có sọc màu Pháp.
    expect(holderOf(thuan.campaign, QUOC_GIA)).toBe('phe_france');
    expect(controllerOf(thuan.campaign, QUOC_GIA)).toBe('phe_hre');
    const paint = paintOf(thuan.campaign, QUOC_GIA);
    expect(paint.stripe).not.toBe('');
    expect(paint.fill).not.toBe(paint.stripe);
  });

  it('mục tiêu của chư hầu tính vào cuộc chinh phục của tôn chủ', () => {
    const thuan = submitAsVassal(emptyCampaign(), 'phe_france', 'phe_hre');
    const tienDo = conquestOf(thuan.campaign, VUNG, 'phe_hre');
    expect(tienDo.held).toBe(tienDo.total);
    expect(tienDo.byVassal).toBe(tienDo.total);
  });

  it('cấm thề vòng tròn', () => {
    const mot = submitAsVassal(emptyCampaign(), 'phe_france', 'phe_hre');
    const hai = submitAsVassal(mot.campaign, 'phe_hre', 'phe_france');
    expect(hai.refused).not.toBe('');
    expect(hai.campaign).toBe(mot.campaign);
  });
});

describe('hành quân: không ai dịch chuyển tức thời', () => {
  const xuatPhat = seatDistrictOf('vung_normandy');
  const dich = seatDistrictOf('vung_champagne');

  function mộtĐạoQuân(): CampaignSliceState {
    const deployed = deployArmy(emptyCampaign(), {
      id: 'army_1',
      name: 'Đạo quân thứ nhất',
      factionId: 'phe_france',
      forceId: '',
      troops: 3000,
      nodeId: xuatPhat,
    });
    expect(deployed.refused).toBe('');
    return deployed.campaign;
  }

  it('tìm được đường nhiều chặng giữa hai vùng khác nhau', () => {
    const route = campaignRoute(xuatPhat, dich);
    expect(route.unreachable).toBe(false);
    expect(route.path.length).toBeGreaterThan(2);
    expect(route.km).toBeGreaterThan(50);
    expect(route.path[0]).toBe(xuatPhat);
    expect(route.path[route.path.length - 1]).toBe(dich);
    // Mỗi cặp liên tiếp phải là một cạnh CÓ THẬT — không có bước nhảy nào.
    for (let index = 1; index < route.path.length; index++) {
      expect(linkBetween(route.path[index - 1] ?? '', route.path[index] ?? '')).not.toBeNull();
    }
  });

  it('lệnh từ lời kể KHÔNG dời quân, nó chỉ mở một chuyến đi', () => {
    const campaign = mộtĐạoQuân();
    const ke = moveArmyFromNarrative(campaign, 'army_1', dich);
    expect(ke.refused).toBe('');

    const army = ke.campaign.armies[0];
    expect(army?.nodeId).toBe(xuatPhat);
    expect(army?.stance).toBe('hanh-quan');
    expect(army?.march?.path[0]).toBe(xuatPhat);
    expect(placementOf(army ?? { id: '', name: '', factionId: '', forceId: '', troops: 0, nodeId: '', stance: 'dong-quan', march: null, siegeNodeId: '' }).moving).toBe(true);
  });

  it('đi từng chặng theo ngày, và mùa đông thì chậm hơn mùa hè', () => {
    const campaign = mộtĐạoQuân();
    const ra = orderMarch(campaign, { armyId: 'army_1', toNodeId: dich });
    expect(ra.refused).toBe('');

    const haiNgay = advanceMarches(ra.campaign, 2, 'ha');
    const dangDi = haiNgay.campaign.armies[0];
    expect(dangDi?.stance).toBe('hanh-quan');
    expect(dangDi?.march?.kmDone ?? 0).toBeGreaterThan(0);
    expect(dangDi?.march?.kmDone ?? 0).toBeLessThan(dangDi?.march?.kmTotal ?? 0);

    const dong = advanceMarches(ra.campaign, 2, 'dong');
    expect(dong.campaign.armies[0]?.march?.kmDone ?? 0).toBeLessThan(dangDi?.march?.kmDone ?? 0);

    // Đủ ngày thì tới nơi, và chỉ khi ấy `nodeId` mới là đích.
    const xong = advanceMarches(ra.campaign, 400, 'ha');
    expect(xong.campaign.armies[0]?.nodeId).toBe(dich);
    expect(xong.campaign.armies[0]?.stance).toBe('dong-quan');
    expect(xong.campaign.armies[0]?.march).toBeNull();
  });

  it('vị trí lúc đang đi nằm GIỮA hai ô, và biết còn mấy ngày nữa tới', () => {
    const campaign = mộtĐạoQuân();
    const ra = orderMarch(campaign, { armyId: 'army_1', toNodeId: dich });
    const giuaDuong = advanceMarches(ra.campaign, 3, 'ha').campaign.armies[0];
    expect(giuaDuong).toBeDefined();
    if (giuaDuong === undefined) return;

    const cho = placementOf(giuaDuong);
    expect(cho.moving).toBe(true);
    expect(cho.fromId).not.toBe('');
    expect(cho.toId).not.toBe('');
    expect(cho.fromId).not.toBe(cho.toId);
    expect(cho.daysLeft).toBeGreaterThan(0);
    expect(cho.kmLeft).toBeGreaterThan(0);
    expect(linkBetween(cho.fromId, cho.toId)).not.toBeNull();
  });

  it('không có đường thì lệnh bị từ chối và quân đứng nguyên', () => {
    const campaign = mộtĐạoQuân();
    const hong = orderMarch(campaign, { armyId: 'army_1', toNodeId: 'huyen_khong-co-that' });
    expect(hong.refused).not.toBe('');
    expect(hong.campaign).toBe(campaign);
  });
});

describe('thẻ <DieuQuan> — cửa của người kể chuyện', () => {
  const xuatPhat = seatDistrictOf('vung_normandy');

  function coQuan(): CampaignSliceState {
    return deployArmy(emptyCampaign(), {
      id: 'army_1',
      name: 'Đạo quân thứ nhất',
      factionId: 'phe_france',
      forceId: '',
      troops: 1500,
      nodeId: xuatPhat,
    }).campaign;
  }

  it('đọc được thẻ và bóc nó khỏi đoạn văn', () => {
    const raw = 'Bá tước ra lệnh nhổ trại. <DieuQuan dao-quan="army_1" toi="vung_champagne" /> Đoàn quân lên đường.';
    expect(parseMarchOrders(raw)).toEqual([{ armyId: 'army_1', toNodeId: 'vung_champagne' }]);
    expect(stripMarchOrders(raw)).not.toContain('DieuQuan');
    expect(stripMarchOrders(raw)).toContain('Đoàn quân lên đường');
  });

  it('thẻ chỉ mở một chuyến đi — quân KHÔNG có mặt sẵn ở đích', () => {
    const state = { meta: {}, player: {}, campaign: coQuan() } as unknown as GameState;
    const outcome = handleAiMarchOrders(state, '<DieuQuan dao-quan="army_1" toi="vung_champagne" />');
    expect(outcome.ops).toHaveLength(1);

    const sau = outcome.ops[0]?.to as CampaignSliceState;
    expect(sau.armies[0]?.nodeId).toBe(xuatPhat);
    expect(sau.armies[0]?.stance).toBe('hanh-quan');
    expect((sau.armies[0]?.march?.path.length ?? 0)).toBeGreaterThan(2);
  });

  it('thẻ trỏ vào một nơi không có thì bị từ chối, state giữ nguyên', () => {
    const state = { meta: {}, player: {}, campaign: coQuan() } as unknown as GameState;
    const outcome = handleAiMarchOrders(state, '<DieuQuan dao-quan="army_1" toi="vung_atlantis" />');
    expect(outcome.ops).toHaveLength(0);
    expect(outcome.log[0]).toContain('Từ chối');
  });
});

describe('nhịp chiến đồ trong turn loop', () => {
  const DATE = { year: 1444, month: 7, day: 2, hour: 6 } as const;

  function stateWith(campaign: CampaignSliceState): GameState {
    return { meta: {}, player: {}, campaign } as unknown as GameState;
  }

  it('không có quân thì không sinh op nào — một lượt uống rượu không được đụng vào save', () => {
    const tick = runCampaignTick(stateWith(emptyCampaign()), 3, DATE);
    expect(tick.ops).toHaveLength(0);
    expect(tick.lines).toHaveLength(0);
  });

  it('thời gian trôi thì quân nhích, và nó nhích qua MỘT op set duy nhất', () => {
    const xuatPhat = seatDistrictOf('vung_normandy');
    const dich = seatDistrictOf('vung_champagne');
    const deployed = deployArmy(emptyCampaign(), {
      id: 'army_tick',
      name: 'Đạo quân nhịp',
      factionId: 'phe_hre',
      forceId: '',
      troops: 2000,
      nodeId: xuatPhat,
    }).campaign;
    const ra = orderMarch(deployed, { armyId: 'army_tick', toNodeId: dich });

    const tick = runCampaignTick(stateWith(ra.campaign), 5, DATE);
    expect(tick.ops).toHaveLength(1);
    expect(tick.ops[0]?.path).toBe('campaign');

    const sau = tick.ops[0]?.to as CampaignSliceState;
    expect(sau.armies[0]?.march?.kmDone ?? 0).toBeGreaterThan(0);
    expect(sau.armies[0]?.stance).toBe('hanh-quan');
  });
});

describe('vây thành trên chiến đồ', () => {
  const thanh = objectivesUnder(VUNG).find((row) => row.site === 'thanh-tri');
  const tran = objectivesUnder(VUNG).find((row) => row.site === 'thi-tran');

  function quanTai(nodeId: string): CampaignSliceState {
    return deployArmy(emptyCampaign(), {
      id: 'army_vay',
      name: 'Đạo quân vây thành',
      factionId: 'phe_hre',
      forceId: '',
      troops: 5000,
      nodeId,
    }).campaign;
  }

  it('phải đứng trước cổng mới vây được', () => {
    if (thanh === undefined) return;
    const oKhac = childrenOfNode(VUNG).find((row) => row.id !== thanh.id);
    const campaign = quanTai(oKhac?.id ?? thanh.id);
    const tuXa = beginSiege(campaign, 'army_vay', thanh.id);
    if (oKhac !== undefined) expect(tuXa.refused).not.toBe('');

    const taiCho = beginSiege(quanTai(thanh.id), 'army_vay', thanh.id);
    expect(taiCho.refused).toBe('');
    expect(taiCho.campaign.sieges[0]?.nodeId).toBe(thanh.id);
    expect(taiCho.campaign.armies[0]?.stance).toBe('vay-thanh');
  });

  it('thị trấn phong toả đủ tuần thì mở cổng, thành trì thì chỉ báo đã đủ tuần', () => {
    if (tran !== undefined) {
      const vay = beginSiege(quanTai(tran.id), 'army_vay', tran.id);
      const tick = advanceSieges(vay.campaign, campaignConfig().site['thi-tran']?.siegeWeeks ?? 2);
      expect(tick.fallen.some((row) => row.nodeId === tran.id)).toBe(true);
    }

    if (thanh !== undefined) {
      const vay = beginSiege(quanTai(thanh.id), 'army_vay', thanh.id);
      const tick = advanceSieges(vay.campaign, 40);
      expect(tick.fallen).toHaveLength(0);
      expect(tick.ready).toContain(thanh.id);
      // Chiến đồ KHÔNG tự cho thành thất thủ: đó là việc của Phần 11.
      expect(holderOf(tick.campaign, thanh.id)).toBe(thanh.ownerId);
    }
  });

  it('chiếm được ô đang vây thì vòng vây gỡ ra và quân chuyển sang chiếm đóng', () => {
    if (tran === undefined) return;
    const vay = beginSiege(quanTai(tran.id), 'army_vay', tran.id);
    const chiem = captureObjective(vay.campaign, tran.id, 'phe_hre');
    expect(chiem.refused).toBe('');
    expect(chiem.campaign.sieges).toHaveLength(0);
    expect(chiem.campaign.armies[0]?.stance).toBe('chiem-dong');
    expect(holderOf(chiem.campaign, tran.id)).toBe('phe_hre');
  });
});
