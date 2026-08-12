/**
 * SLICE `body` (Phần 7 mục 2 và 3) — TOÀN QUYỀN `engine`.
 *
 * Mục 3 nói thẳng: AI TUYỆT ĐỐI không được ghi vào slice này. Không có một
 * đường dẫn nào quyền `ai`, và đó là chỗ khác biệt lớn nhất so với slice
 * `character` — ở đó AI còn được viết quan hệ, bí mật và tính cách. Ở đây thì
 * không, vì mỗi ô trong này là một con số đi thẳng vào công thức (R1).
 *
 * Đường DUY NHẤT để truyện tác động vào cơ thể là event `body.requestInjury`
 * (mục 3, cài ở `events.ts`): AI ĐỀ NGHỊ, engine tung xúc sắc và PHÁN QUYẾT.
 *
 * KHÔNG CÓ MỘT THANH MÁU TỔNG (mục 2). `blood` là lượng máu CÒN LẠI chứ không
 * phải "hp", và nó chỉ là một trong năm cửa tử của mục 9. Người chơi phải nhìn
 * vào cơ thể chứ không nhìn vào một con số.
 *
 * Vì sao `blood` và `fever` là STATE còn `pain`, `shock`, `consciousness`,
 * `mobility`, `grip` là BIẾN PHỤ: hai cái đầu tích lũy qua thời gian và không
 * suy lại được từ danh sách thương tích hiện tại — một vết đã lành vẫn để lại
 * lượng máu đã mất. Năm cái sau thì LÀ hàm của cơ thể lúc này, nên giữ thêm một
 * bản sao chỉ là chuẩn bị cho ngày hai bên lệch nhau (Phần 2 mục 7).
 */

import { z } from 'zod';
import type { GameState, SliceDefinition } from '@/state/slices';
import { readPath } from '@/state/slices';
import { INJURY_TYPES, complicationOf, permanentOf, wholeBodyTuning } from './catalog';
import { regionOf } from './regions';
import {
  bloodMax,
  consciousnessOf,
  gripOf,
  injuryCount,
  mobilityOf,
  painOf,
  shockOf,
  staminaOf,
} from './vitals';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Biến chứng đang chạy trên một vết thương (mục 7).
 *
 * `startedTurn` cần thiết cho ba luật đếm lượt khác nhau: hoại tử lan sau mấy
 * lượt, uốn ván giết sau mấy lượt, và gãy xương liền lệch sau mấy lượt không
 * nẹp. Không có nó thì cả ba biến thành "xảy ra ngay hoặc không bao giờ".
 */
export const complicationSchema = z.object({
  /** Id trong `data/injuries.json`. */
  id: z.string().max(60),
  startedTurn: z.int().min(0),
  /**
   * Đã lan sang vùng khác ở lượt nào — hoại tử dùng để không lan hai lần một
   * chỗ. `-1` là "chưa lan lần nào", nên sàn phải là `-1` chứ không phải `0`:
   * lượt 0 là một lượt có thật.
   */
  spreadTurn: z.int().min(-1).default(-1),
  note: z.string().max(200).default(''),
});

export const injurySchema = z.object({
  id: z.string().max(60),
  regionId: z.string().max(40),
  inflictedTurn: z.int().min(0),
  /** Nguyên nhân bằng lời — thứ hiện ở dòng thời gian của mục 10. */
  source: z.string().max(160).default(''),
  type: z.enum(INJURY_TYPES),
  severity: z.int().min(1).max(5),
  /** Điểm máu mất mỗi lượt. Tự đông lại dần, trừ khi có biến chứng `dut-dong-mach`. */
  bleeding: z.number().min(0).max(100),
  infection: z.number().min(0).max(100),
  pain: z.number().min(0).max(100),
  treated: z.boolean().default(false),
  treatmentQuality: z.int().min(1).max(5).optional(),
  treatedTurn: z.int().min(0).optional(),
  /** Phương pháp đã dùng — `lien-lech` tra chỗ này để biết đã nẹp chưa. */
  treatments: z.array(z.string().max(60)).max(20).default([]),
  healProgress: z.number().min(0).max(100).default(0),
  /**
   * Tạng chí mạng đã bị phá hủy hoàn toàn, nếu có (mục 9).
   *
   * Ghi vào chính vết gây ra nó chứ không phải một danh sách riêng: cái chết
   * phải truy ngược được về ĐÚNG một nhát đâm cụ thể, không phải về một cờ
   * "tim hỏng" không biết từ đâu ra.
   */
  organDestroyed: z.string().max(60).optional(),
  complications: z.array(complicationSchema).max(12).default([]),
  /** Tàn phế mà chính vết này để lại, id trong `data/injuries.json`. */
  permanent: z.string().max(60).optional(),
  /**
   * Vết do VŨ KHÍ BẠC gây ra (Phần 16 mục 6, Phần 14b mục D).
   *
   * Một cờ trên chính vết chứ không phải một danh sách riêng: luật hồi phục đọc
   * nó ngay trong vòng lặp lành thương, và một danh sách riêng thì sẽ có ngày
   * lệch khỏi danh sách thương tích khi một vết được chữa khỏi và bị xóa đi.
   */
  silver: z.boolean().default(false),
});

export const permanentEntrySchema = z.object({
  /** Id trong bảng `permanent` của `data/injuries.json`. */
  id: z.string().max(60),
  regionId: z.string().max(40),
  turn: z.int().min(0),
  cause: z.string().max(160).default(''),
});

/**
 * Bệnh truyền nhiễm — MÓC SẴN CHO PHẦN 15 (mục 7).
 *
 * Để riêng khỏi `injuries` vì nó không có vùng, không có vũ khí gây ra, và lây
 * từ môi trường. Nhét dịch hạch vào danh sách thương tích là bắt Phần 15 phải
 * bịa ra một "vùng bị dịch hạch" trên bản đồ cơ thể.
 */
export const diseaseEntrySchema = z.object({
  id: z.string().max(60),
  startedTurn: z.int().min(0),
  /** Còn ủ bệnh thì chưa sinh triệu chứng. */
  incubating: z.boolean().default(true),
  source: z.string().max(160).default(''),
});

export const bodyLogSchema = z.object({
  turn: z.int().min(0),
  kind: z.enum(['thuong-tich', 'chua-tri', 'bien-chung', 'tan-phe', 'lanh', 'benh', 'tu-vong']),
  text: z.string().max(300),
  regionId: z.string().max(40).default(''),
});

export const bodySchema = z.object({
  /**
   * Tay thuận. Mục 5 chia hiệu ứng thành "tay thuận" và "tay còn lại", nên phải
   * có chỗ nói tay nào là tay nào. Nằm ở đây chứ không ở `character` vì nó chỉ
   * có nghĩa với bản đồ cơ thể.
   */
  dominantHand: z.enum(['trai', 'phai']).default('phai'),
  /** Máu CÒN LẠI, không phải máu đã mất. 0 là một trong năm cửa tử của mục 9. */
  blood: z.number().min(0).max(100).default(100),
  fever: z.number().min(0).max(100).default(0),
  /** Số lượt liên tiếp sốt đã chạm trần — luật tử vong đếm bằng cái này. */
  feverTurns: z.int().min(0).default(0),
  injuries: z.array(injurySchema).max(120).default([]),
  permanent: z.array(permanentEntrySchema).max(40).default([]),
  /** Chân giả, tay sắt, bịt mắt, nạng, xe lăn (mục 8). */
  prosthetics: z.array(z.string().max(60)).max(20).default([]),
  diseases: z.array(diseaseEntrySchema).max(20).default([]),
  /** Cầu nguyện và thánh tích: WIL tạm thời, hết hạn ở `untilTurn` (mục 6). */
  will: z
    .object({ bonus: z.number().min(-50).max(50).default(0), untilTurn: z.int().min(0).default(0) })
    .default({ bonus: 0, untilTurn: 0 }),
  dead: z.boolean().default(false),
  deathCause: z.string().max(120).default(''),
  deathTurn: z.int().min(0).default(0),
  /** Bộ đếm để sinh id thương tích mà không phải rút xúc sắc (R3). */
  nextInjuryNo: z.int().min(1).default(1),
  /** Trần đề nghị của AI trong MỘT lượt (mục 3). */
  aiRequests: z.object({ turn: z.int().min(0).default(0), used: z.int().min(0).default(0) }).default({ turn: 0, used: 0 }),
  /**
   * Dòng thời gian thương tích của mục 10.
   *
   * Trần schema (400) rộng hơn trần thật (`LOG_SOFT_LIMIT`, 200) có chủ ý: vòng
   * lượt cắt bớt sổ tay ở đầu lô op, rồi mới nối thêm dòng mới trong CÙNG lô đó.
   * Nếu hai con số bằng nhau thì một lô hợp lệ vẫn bị B6 từ chối chỉ vì thứ tự
   * op bên trong nó — và R4 sẽ hủy cả lượt vì một chuyện không ai làm sai.
   */
  log: z.array(bodyLogSchema).max(400).default([]),
});

export type BodyState = z.infer<typeof bodySchema>;
export type Injury = z.infer<typeof injurySchema>;
export type InjuryComplication = z.infer<typeof complicationSchema>;
export type PermanentEntry = z.infer<typeof permanentEntrySchema>;
export type DiseaseEntry = z.infer<typeof diseaseEntrySchema>;
export type BodyLogEntry = z.infer<typeof bodyLogSchema>;

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

/** Cơ thể hiện tại, hoặc null khi slice chưa đăng ký (test của phần khác). */
export function bodyOf(state: GameState | null | undefined): BodyState | null {
  if (state === null || state === undefined) return null;
  const raw = readPath(state, 'body');
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  return raw as BodyState;
}

/** Chỉ số của nhân vật, đọc qua đường dẫn để `body` không phải import slice khác. */
export function statOf(state: GameState | null | undefined, stat: string): number {
  const value = readPath(state ?? {}, `character.stats.${stat}`);
  return typeof value === 'number' ? value : 10;
}

/** Vết thương chưa lành hẳn. */
export function openInjuries(body: BodyState): Injury[] {
  return body.injuries.filter((injury) => injury.healProgress < 100);
}

export function defaultBody(): BodyState {
  return {
    dominantHand: 'phai',
    blood: bloodMax(),
    fever: 0,
    feverTurns: 0,
    injuries: [],
    permanent: [],
    prosthetics: [],
    diseases: [],
    will: { bonus: 0, untilTurn: 0 },
    dead: false,
    deathCause: '',
    deathTurn: 0,
    nextInjuryNo: 1,
    aiRequests: { turn: 0, used: 0 },
    log: [],
  };
}

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export const bodySlice: SliceDefinition = {
  id: 'body',
  version: 1,
  schema: bodySchema,
  defaults: () => defaultBody() as unknown as Record<string, unknown>,

  // Mục 3: TOÀN BỘ quyền `engine`. Khai đủ từng nhánh thay vì dựa vào mặc định
  // của `permissionFor` — mặc định là một quy ước, còn bảng này là một lời hứa.
  permissions: {
    dominantHand: 'engine',
    blood: 'engine',
    fever: 'engine',
    feverTurns: 'engine',
    injuries: 'engine',
    'injuries.*': 'engine',
    permanent: 'engine',
    'permanent.*': 'engine',
    prosthetics: 'engine',
    diseases: 'engine',
    'diseases.*': 'engine',
    'will.*': 'engine',
    dead: 'engine',
    deathCause: 'engine',
    deathTurn: 'engine',
    nextInjuryNo: 'engine',
    'aiRequests.*': 'engine',
    log: 'engine',
    'log.*': 'engine',
  },

  constraints: [
    {
      /**
       * Hai vết trùng id là hai vết đè lên nhau lúc chữa trị: người chơi bấm
       * chữa vết này, engine tìm thấy vết kia. Đây là loại lỗi chỉ lộ ra sau
       * khi đã chữa nhầm vài lượt.
       */
      id: 'thuong-tich-khong-trung-id',
      check(state) {
        const body = bodyOf(state);
        if (body === null) return null;
        const ids = body.injuries.map((injury) => injury.id);
        return new Set(ids).size === ids.length ? null : 'hai thương tích trùng id';
      },
    },
    {
      id: 'thuong-tich-phai-o-vung-co-that',
      check(state) {
        const body = bodyOf(state);
        if (body === null) return null;
        for (const injury of body.injuries) {
          if (regionOf(injury.regionId) === null) {
            return `thương tích "${injury.id}" nằm ở vùng "${injury.regionId}" không có trên bản đồ cơ thể`;
          }
        }
        for (const entry of body.permanent) {
          if (entry.regionId !== '' && regionOf(entry.regionId) === null) {
            return `tàn phế "${entry.id}" nằm ở vùng "${entry.regionId}" không có trên bản đồ cơ thể`;
          }
        }
        return null;
      },
    },
    {
      id: 'bien-chung-va-tan-phe-phai-co-trong-bang',
      check(state) {
        const body = bodyOf(state);
        if (body === null) return null;
        for (const injury of body.injuries) {
          for (const complication of injury.complications) {
            if (complicationOf(complication.id) === null) {
              return `biến chứng "${complication.id}" không có trong data/injuries.json`;
            }
          }
        }
        for (const entry of body.permanent) {
          if (permanentOf(entry.id) === null) {
            return `tàn phế "${entry.id}" không có trong data/injuries.json`;
          }
        }
        return null;
      },
    },
    {
      /**
       * Chết mà không có nguyên nhân là đúng thứ mục 9 cấm: cái chết phải truy
       * ra được về một trong năm cửa, không bao giờ là "máu về 0" chung chung.
       */
      id: 'chet-phai-co-nguyen-nhan',
      check(state) {
        const body = bodyOf(state);
        if (body === null) return null;
        return body.dead && body.deathCause.trim() === '' ? 'đã chết nhưng không ghi nguyên nhân' : null;
      },
    },
  ],

  // Trạng thái toàn thân của mục 2. Chúng là HÀM của cơ thể lúc này, dựng lại
  // mỗi lượt, và AI không ghi được vào — vì không có gì để ghi vào.
  derived: [
    {
      /** Đau tổng, ĐÃ trừ theo WIL (mục 2 và mục 5). */
      id: 'mucDau',
      deps: ['body.injuries', 'body.diseases', 'body.will', 'character.stats.wil', 'meta.turn'],
      compute(state) {
        const body = bodyOf(state);
        return body === null ? 0 : painOf(body, statOf(state, 'wil'), state.meta.turn);
      },
    },
    {
      id: 'mucSoc',
      deps: ['body.injuries', 'body.blood', 'body.will', 'body.diseases', 'character.stats.wil', 'meta.turn'],
      compute(state) {
        const body = bodyOf(state);
        if (body === null) return 0;
        return shockOf(body, statOf(state, 'wil'), state.meta.turn);
      },
    },
    {
      /** `tỉnh` · `choáng` · `lơ mơ` · `hôn mê` (mục 2). */
      id: 'yThuc',
      deps: [
        'body.injuries',
        'body.blood',
        'body.fever',
        'body.diseases',
        'body.will',
        'character.stats.wil',
        'meta.turn',
      ],
      compute(state) {
        const body = bodyOf(state);
        return body === null ? 'tỉnh' : consciousnessOf(body, statOf(state, 'wil'), state.meta.turn).name;
      },
    },
    {
      /** Khả năng di chuyển 0–100%. Ảnh hưởng cả hành quân cấp chiến dịch (mục 5). */
      id: 'vanDong',
      deps: ['body.injuries', 'body.blood', 'body.permanent', 'body.prosthetics'],
      compute(state) {
        const body = bodyOf(state);
        return body === null ? 100 : mobilityOf(body);
      },
    },
    {
      id: 'camNamTrai',
      deps: ['body.injuries', 'body.permanent', 'body.prosthetics'],
      compute(state) {
        const body = bodyOf(state);
        return body === null ? 100 : gripOf(body, 'trai');
      },
    },
    {
      id: 'camNamPhai',
      deps: ['body.injuries', 'body.permanent', 'body.prosthetics'],
      compute(state) {
        const body = bodyOf(state);
        return body === null ? 100 : gripOf(body, 'phai');
      },
    },
    {
      /** Thể lực — một trong năm thanh của mục 10. */
      id: 'theLuc',
      deps: ['body.injuries', 'body.blood', 'body.fever'],
      compute(state) {
        const body = bodyOf(state);
        return body === null ? 100 : staminaOf(body);
      },
    },
    {
      id: 'soThuongTich',
      deps: ['body.injuries'],
      compute(state) {
        const body = bodyOf(state);
        return body === null ? 0 : injuryCount(body);
      },
    },
  ],
};

/** Trần máu, để UI vẽ thanh mà không phải import bảng data. */
export const BLOOD_MAX = wholeBodyTuning().bloodMax;
