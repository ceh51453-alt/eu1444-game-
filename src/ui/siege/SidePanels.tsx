/**
 * HAI BẢNG ĐỐI XỨNG (Phần 11 mục 9) — và chúng đối xứng ở CHỖ ĐỨNG, không ở nội dung.
 *
 * Mục 9 khai thẳng hai danh sách khác nhau: bên vây hiện "lương, bệnh, hạn nghĩa
 * vụ, máy móc, hầm"; bên thủ hiện "lương, nước, sĩ khí dân, sĩ khí quân, tường".
 * Chỉ có một dòng chung là lương, và ngay cả dòng ấy cũng đo hai thứ khác nhau:
 * bên vây đếm lương trong TRẠI (tải từ xa, hết là đói ngay), bên thủ đếm lương
 * trong KHO (không tải thêm được, chỉ có mỗi cách chia nhỏ ra).
 *
 * Đó chính là thế bất đối xứng của mục 1 hiện thành hai cột số. Nếu hai bảng này
 * hiện cùng một danh sách chỉ tiêu thì người chơi sẽ chơi hai vai như một.
 */

import type { ReactNode } from 'react';
import {
  campSupplyWeeks,
  foodWeeksLeft,
  garrisonMen,
  liveEngines,
  rationOf,
  wallShare,
  type SiegeState,
} from '@/systems/siege';

function Row({ label, value, tone = '' }: { label: string; value: string; tone?: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="truncate text-parchment/55">{label}</span>
      <span className={`shrink-0 font-mono text-[0.7rem] ${tone === '' ? 'text-parchment' : tone}`}>{value}</span>
    </div>
  );
}

function warn(bad: boolean, worse = false): string {
  if (worse) return 'text-[#b8332b]';
  return bad ? 'text-[#d9a441]' : '';
}

/** Bên vây: chống lại THỜI GIAN và DỊCH BỆNH (mục 1). */
export function BesiegerPanel({ siege }: { siege: SiegeState }): ReactNode {
  const supply = campSupplyWeeks(siege);
  const engines = liveEngines(siege);
  const building = siege.attacker.engines.filter((engine) => !engine.built && !engine.destroyed);
  const mine = siege.attacker.mines.find((entry) => !entry.collapsed && !entry.fired);
  const share = siege.attacker.startTroops <= 0 ? 0 : siege.attacker.troops / siege.attacker.startTroops;

  return (
    <div className="flex flex-col gap-0.5">
      <Row
        label="Quân còn"
        value={`${String(siege.attacker.troops)} / ${String(siege.attacker.startTroops)}`}
        tone={warn(share < 0.7, share < 0.45)}
      />
      <Row label="Sĩ khí" value={`${String(Math.round(siege.attacker.morale))}/100`} tone={warn(siege.attacker.morale < 45, siege.attacker.morale < 25)} />
      <Row label="Lương trong trại" value={`${supply.toFixed(1)} tuần`} tone={warn(supply < 2, supply < 1)} />
      <Row
        label="Vệ sinh trại"
        value={`${String(Math.round(siege.attacker.hygiene))}/100${siege.attacker.outbreakWeeks > 0 ? ' · DỊCH' : ''}`}
        tone={warn(siege.attacker.hygiene < 45, siege.attacker.outbreakWeeks > 0)}
      />
      <Row
        label="Hạn nghĩa vụ"
        value={siege.attacker.levyLeft ? 'chư hầu đã về' : `còn ${String(Math.max(0, siege.attacker.serviceDaysLeft))} ngày`}
        tone={warn(siege.attacker.serviceDaysLeft <= 14, siege.attacker.levyLeft)}
      />
      <Row label="Kho bạc" value={String(Math.round(siege.attacker.treasury))} tone={warn(siege.attacker.treasury < 500)} />
      <Row label="Vòng vây" value={`${String(siege.attacker.circumvallation)}/3`} />
      <Row
        label="Máy công thành"
        value={engines.length === 0 ? '—' : engines.map((engine) => engine.name).join(', ')}
      />
      {building.length > 0 && (
        <Row
          label="Đang dựng"
          value={building.map((engine) => `${engine.name} ${String(Math.round(engine.progress * 100))}%`).join(', ')}
        />
      )}
      <Row
        label="Đường hầm"
        value={mine === undefined ? 'chưa đào' : `${String(Math.round(mine.progress * 100))}%${mine.detected ? ' · ĐÃ LỘ' : ''}`}
        tone={warn(mine?.detected === true)}
      />
      <div className="mt-1 border-t border-oak-light pt-1">
        <p className="text-[0.55rem] tracking-widest text-brass uppercase">Sổ tử</p>
        <Row label="Chết vì bệnh" value={String(siege.attacker.losses.disease)} tone="text-[#b8332b]" />
        <Row label="Chết vì đánh nhau" value={String(siege.attacker.losses.combat)} />
        <Row label="Chết đói · rét" value={`${String(siege.attacker.losses.hunger)} · ${String(siege.attacker.losses.winter)}`} />
        <Row label="Đào ngũ" value={String(siege.attacker.losses.desertion)} />
        <Row label="Hết hạn, về nhà" value={String(siege.attacker.losses.departed)} />
      </div>
    </div>
  );
}

/** Bên thủ: chống lại CÁI ĐÓI và LÒNG NGƯỜI (mục 1). */
export function DefenderPanel({ siege }: { siege: SiegeState }): ReactNode {
  const ration = rationOf(siege.defender.ration);
  const weeks = foodWeeksLeft(siege, ration.factor);
  const men = garrisonMen(siege.fort);
  const wall = wallShare(siege.fort);

  return (
    <div className="flex flex-col gap-0.5">
      <Row label="Quân đồn trú" value={String(men)} tone={warn(men < 100, men < 50)} />
      <Row label="Dân trong thành" value={String(siege.fort.population)} />
      <Row label="Sĩ khí quân" value={`${String(Math.round(siege.defender.garrisonMorale))}/100`} tone={warn(siege.defender.garrisonMorale < 40, siege.defender.garrisonMorale < 22)} />
      <Row label="Lòng dân" value={`${String(Math.round(siege.defender.populationMorale))}/100`} tone={warn(siege.defender.populationMorale < 40, siege.defender.populationMorale < 22)} />
      <Row label="Khẩu phần" value={ration.name} tone={warn(ration.factor < 1, ration.factor <= 0.35)} />
      <Row label="Lương còn" value={`${weeks.toFixed(1)} tuần`} tone={warn(weeks < 8, weeks < 3)} />
      <Row
        label="Nước"
        value={
          siege.defender.waterCutWeeks > 0
            ? `HẾT — tuần thứ ${String(siege.defender.waterCutWeeks)}`
            : `${String(siege.fort.wells)} giếng`
        }
        tone={warn(siege.fort.wells <= 0, siege.defender.waterCutWeeks > 0)}
      />
      <Row label="Tường đang giữ" value={`${String(Math.round(wall * 100))}%`} tone={warn(wall < 0.5, wall <= 0)} />
      <Row label="Vật liệu sửa chữa" value={String(Math.round(siege.fort.supplies.materials))} tone={warn(siege.fort.supplies.materials < 300)} />
      <Row
        label="Lớp đã bỏ"
        value={siege.fort.lostLayers.length === 0 ? '—' : String(siege.fort.lostLayers.length)}
        tone={warn(siege.fort.lostLayers.length > 0)}
      />
      <Row label="Đã đuổi dân ra" value={siege.defender.civiliansExpelled === 0 ? '—' : String(siege.defender.civiliansExpelled)} />
      <Row
        label="Cứu viện"
        value={siege.reliefIncoming ? `còn ${String(Math.max(0, siege.weeksToRelief))} tuần` : siege.defender.reliefHope ? 'đã gửi sứ' : '—'}
        tone={siege.reliefIncoming ? 'text-[#7d9a6a]' : ''}
      />
      <div className="mt-1 border-t border-oak-light pt-1">
        <p className="text-[0.55rem] tracking-widest text-brass uppercase">Sổ tử</p>
        <Row label="Chết đói" value={String(siege.defender.losses.hunger)} tone="text-[#b8332b]" />
        <Row label="Chết vì đánh nhau" value={String(siege.defender.losses.combat)} />
        <Row label="Chết vì bệnh" value={String(siege.defender.losses.disease)} />
      </div>
    </div>
  );
}

/** Tiếng tàn bạo và tiếng nhân từ — hệ quả lan tới toàn cục (mục 7). */
export function ReputationRow({ siege }: { siege: SiegeState }): ReactNode {
  return (
    <div className="flex flex-wrap items-baseline gap-3 text-[0.65rem]">
      <span className="text-parchment/50">
        Tiếng tàn bạo <span className="font-mono text-[#b8332b]">{Math.round(siege.cruelty)}</span>
      </span>
      <span className="text-parchment/50">
        Tiếng nhân từ <span className="font-mono text-[#7d9a6a]">{Math.round(siege.mercy)}</span>
      </span>
      <span className="text-parchment/50">
        Giáo hội <span className="font-mono text-parchment">{Math.round(siege.church)}</span>
      </span>
      <span className="text-parchment/30">các thành khác nghe tin này khi ngài tới cổng của họ</span>
    </div>
  );
}
