/**
 * BIÊN NIÊN TRẬN ĐÁNH — hạ tầng dùng chung của Phần 9, 10 và 11.
 *
 * Phần 9 dựng nó (mục 12.7: "Làm tổng quát"), nhưng nó KHÔNG thuộc về đấu tay
 * đôi: dã chiến và công thành dùng lại y nguyên cấu trúc này. Xem `README.md`
 * cùng thư mục cho hợp đồng đọc/ghi state.
 */

export {
  HIGHLIGHT_LABELS,
  compressChronicle,
  emptyChronicle,
  participantName,
  type ChronicleAction,
  type ChronicleBattleRound,
  type ChronicleForce,
  type ChronicleOrderNote,
  type ChronicleWingNote,
  type ChronicleDigest,
  type ChronicleEntry,
  type ChronicleInjury,
  type ChronicleOutcome,
  type ChronicleParticipant,
  type ChronicleRound,
  type ChronicleSetting,
  type CombatChronicle,
  type CombatKind,
  type CompactChronicle,
  type CompressOptions,
  type Highlight,
} from './chronicle';

export {
  NARRATION_RULES,
  auditNarrative,
  narrationPrompt,
  renderChronicle,
  type NarrationOptions,
  type NarrationPrompt,
  type NarrativeIssue,
  type NarrativeIssueKind,
} from './narrate';
