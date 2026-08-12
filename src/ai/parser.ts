/**
 * Bước 5 của vòng lặp lượt — tách narrative khỏi khối cập nhật biến.
 *
 * Bản hiện thực THẬT nằm ở `state/mvu-parse.ts`. Phần 2 phải tự viết nó để
 * dựng và test được pipeline B1→B7 của mình, mà việc "bóc `<UpdateVariable>`
 * rồi quy hai cú pháp về một" thì không có lý do gì tồn tại hai bản. File này
 * giữ lại đúng cái tên mà Phần 0 mục 7.2 đã đặt trong sơ đồ thư mục, và trỏ
 * thẳng sang đó.
 *
 * Ràng buộc không đổi: một câu trả lời không có khối nào đọc được KHÔNG phải
 * là crash. Đó là một lô bị từ chối — ghi log, state giữ nguyên (R4).
 */

export {
  parseUpdateBlock,
  parseUpdateVariables,
  stripUpdateBlocks,
  type ParseIssue,
  type ParseResult,
  type PatchOp,
  type PatchOpKind,
} from '@/state/mvu-parse';
