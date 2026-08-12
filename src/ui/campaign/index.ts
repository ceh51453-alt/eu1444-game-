/**
 * CHIẾN ĐỒ — bản đồ chinh phục ba tầng.
 *
 * Tên khác hẳn `MedievalMap` của tab Thế giới là cố ý: hai màn hình trả lời hai
 * câu hỏi khác nhau và không cái nào thay được cái nào. `MedievalMap` là "ta
 * đang ở đâu trên châu Âu"; chiến đồ là "đất này của ai, và muốn lấy nó thì phải
 * hạ những chỗ nào".
 */

export { CampaignMap, remainingLabels, objectiveCount, type CampaignMapProps } from './CampaignMap';
export { CampaignScreen, type CampaignScreenProps } from './CampaignScreen';
export {
  commitCampaign,
  openCampaign,
  syncPlayerArmies,
  type OpenCampaign,
  type PlayerForceRow,
} from './campaign';
