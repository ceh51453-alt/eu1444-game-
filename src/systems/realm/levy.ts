/**
 * GỌI QUÂN (mục 8) — và đây là chỗ mục 12.5 nối SỐ NGÀY QUÂN DỊCH sang Phần 11.
 *
 * > "Hợp đồng phong kiến hai chiều: người chơi cũng NỢ lãnh chúa cấp trên (thuế,
 * > số ngày quân dịch — CHÍNH LÀ CON SỐ PHẦN 11 DÙNG, hầu tòa)."
 *
 * Một đạo quân phong kiến không tan vì thua trận. Nó tan vì HẾT HẠN. Phần 11 mục
 * 3 đã có sẵn `serviceDaysLeft` đếm ngược mỗi tuần vây hãm và cho chư hầu về nhà
 * HỢP PHÁP khi hết; thứ nó thiếu là con số ban đầu, và con số ấy phải đến từ tầng
 * cai trị chứ không từ một mặc định trong `data/fortifications.json`.
 *
 * LUẬT CỦA ĐẠO QUÂN: nó ở lại đúng bằng HẠN NGẮN NHẤT trong các cánh quân. Không
 * phải trung bình, không phải hạn của người chơi — vì cánh quân đầu tiên quay ngựa
 * kéo theo cả những cánh còn phân vân, và mục 8 của Phần 10 gọi đúng đó là vỡ trận
 * lan truyền. Một lãnh chúa muốn vây lâu thì phải NÂNG hạn của người yếu nhất, chứ
 * không phải đếm tổng.
 *
 * File này chạm tới Phần 12 đúng một chỗ: `import type { Tribute }`. Nó nhận
 * những tờ giấy nộp nghĩa vụ, không nhận một `Holding` nào.
 */

import type { Tribute } from '@/systems/holding/interfaces';
import { obligationConfig, type HeldTitle } from '@/systems/titles';
import { foldLaws } from './laws';
import type { Vassal } from './types';
import { addGrievance } from './vassals';

export interface Contingent {
  /** Ai mang cánh quân này tới. */
  source: string;
  name: string;
  /** Số ngày họ ở lại — hết là về, và về HỢP PHÁP. */
  days: number;
  men: number;
  /** Vì sao con số này nhỏ hơn hoặc lớn hơn thường lệ. */
  note: string;
}

export interface HostCall {
  /** Số ngày CẢ ĐẠO QUÂN ở lại — con số Phần 11 nhận qua `SiegeSetup.attacker.serviceDays`. */
  days: number;
  men: number;
  contingents: Contingent[];
  /** Cánh quân yếu nhất về hạn — kẻ quyết định cả cuộc vây kéo dài bao lâu. */
  weakest: string;
  /** Gọi vượt hạn khế ước: họ vẫn đi, và họ ghi một mối hận (mục 7). */
  broke: string[];
  /** Trạng thái chư hầu sau khi ghi số ngày đã bị triệu tập và mọi mối hận do bẻ khế ước. */
  vassals: Vassal[];
  lines: string[];
}

export interface CallHostInput {
  /** Tước đang giữ — nghĩa vụ của CHÍNH NGƯỜI CHƠI với lãnh chúa trên. */
  titles: readonly HeldTitle[];
  vassals: readonly Vassal[];
  /** Nghĩa vụ các thành trì nộp lên — giao diện `holding → realm` của Phần 12. */
  tributes?: readonly Tribute[];
  /** Luật đang áp: `luat_quan-dich-mo-rong` cộng thẳng vào đây. */
  laws?: readonly string[];
  /** Số ngày muốn gọi. Vượt hạn khế ước thì `broke` có tên. */
  wantedDays?: number;
  /** Năm hiện tại, dùng để ghi mối hận khi gọi quá hạn. */
  year?: number;
  /** Năng lực điều quân của triều đình; chỉ nhân số người tới, không đổi hạn khế ước. */
  levyFactor?: number;
}

/**
 * TRIỆU TẬP.
 *
 * Ba nguồn quân, ba loại hạn khác nhau:
 *
 *   chư hầu     `obligations.levyDays` — hạn ghi trên tờ giấy của chính họ
 *   thành trì   `Tribute.obligationDays` — hạn của tầng dưới, đi vào qua giao diện
 *   bản thân    nghĩa vụ của người chơi với lãnh chúa trên, khi ĐI THEO người khác
 *
 * Không nguồn nào đọc state của nguồn kia. Tất cả là dữ liệu thuần đi vào qua
 * tham số, và đó là lý do hàm này thuần và test được mà không cần dựng cả một ván.
 */
export function callHost(input: CallHostInput): HostCall {
  const laws = foldLaws(input.laws ?? []);
  const config = obligationConfig();
  const wanted = input.wantedDays ?? 0;

  const contingents: Contingent[] = [];
  const broke: string[] = [];
  const vassals: Vassal[] = [];
  const lines: string[] = [];

  for (const vassal of input.vassals) {
    if (vassal.rebelling) {
      lines.push(`${vassal.name} đang phản — không cánh quân nào tới từ đó.`);
      vassals.push(vassal);
      continue;
    }
    // LÒNG TRUNG quyết định bao nhiêu người thật sự ra trình diện. Một chư hầu
    // giận vẫn phải đi — khế ước là khế ước — nhưng ông ta đi muộn và đi ít.
    const turnout = Math.max(0.2, Math.min(1, vassal.loyalty / 70));
    const days = Math.max(0, vassal.obligations.levyDays + laws.levyDays);
    const men = Math.round(vassal.levyMen * turnout * Math.max(0, input.levyFactor ?? 1));

    const called = vassal.obligations.levyDaysCalled + Math.max(0, wanted);
    let nextVassal: Vassal = {
      ...vassal,
      obligations: { ...vassal.obligations, levyDaysCalled: called },
    };
    if (called > days) {
      broke.push(vassal.name);
      const over = called - days;
      nextVassal = addGrievance(
        nextVassal,
        `Bị gọi quân quá hạn ${String(Math.round(over))} ngày`,
        Math.min(12, 3 + Math.ceil(over / 10)),
        input.year ?? 0,
      );
    }
    vassals.push(nextVassal);

    contingents.push({
      source: vassal.npcId,
      name: vassal.name,
      days,
      men,
      note:
        turnout < 1
          ? `lòng trung ${String(Math.round(vassal.loyalty))} — chỉ ${String(Math.round(turnout * 100))} trên trăm ra trình diện`
          : '',
    });
  }

  for (const tribute of input.tributes ?? []) {
    const days = Math.max(0, tribute.obligationDays + laws.levyDays);
    contingents.push({
      source: tribute.holdingId,
      name: `Quân của ${tribute.holdingId}`,
      days,
      men: Math.round(tribute.levyAvailable),
      note: tribute.arrearsYears > 0 ? `đang nợ nghĩa vụ ${String(tribute.arrearsYears)} năm` : '',
    });
  }

  if (contingents.length === 0) {
    // Không ai tới thì hạn là hạn của chính người chơi: ngài và tùy tùng của ngài.
    const own = input.titles[0]?.obligations.levyDays ?? 0;
    return {
      days: Math.max(0, own + laws.levyDays),
      men: 0,
      contingents: [],
      weakest: '',
      broke: [],
      vassals,
      lines: ['Không chư hầu nào tới. Đạo quân là ngài và những người ăn cơm nhà ngài.'],
    };
  }

  const weakest = contingents.reduce((worst, row) => (row.days < worst.days ? row : worst));
  const men = contingents.reduce((sum, row) => sum + row.men, 0);

  lines.push(
    `Đạo quân ước chừng ${String(Math.round(men / 10) * 10)} người, ở lại được ${String(weakest.days)} ngày — hạn của ${weakest.name}.`,
  );
  if (broke.length > 0) {
    lines.push(
      `Gọi tới ${String(wanted)} ngày là quá khế ước với ${broke.join(', ')}. Họ vẫn đi, và họ nhớ.`,
    );
  }
  if (laws.levyDays !== 0) {
    lines.push(`Luật đang áp đổi hạn nghĩa vụ ${laws.levyDays > 0 ? '+' : ''}${String(laws.levyDays)} ngày.`);
  }
  if (wanted > config.levyOverCallDays) {
    lines.push(`Gọi quá ${String(config.levyOverCallDays)} ngày trong một năm là bẻ khế ước, kể cả với người trung thành nhất.`);
  }

  return { days: weakest.days, men, contingents, weakest: weakest.name, broke, vassals, lines };
}

/**
 * Con số đưa thẳng vào `SiegeSetup.attacker.serviceDays` của Phần 11.
 *
 * Một hàm riêng, tên rất hẹp, để chỗ gọi ở Phần 11 không phải biết gì về chư hầu,
 * về luật, hay về lòng trung — nó chỉ hỏi "đám này ở được bao lâu" và nhận một số.
 */
export function siegeServiceDays(input: CallHostInput): number {
  return callHost(input).days;
}
