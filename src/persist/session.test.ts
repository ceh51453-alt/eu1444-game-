import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET } from '@/ai/budget';
import { emptyScene } from '@/ai/query';
import {
  closeSessionStorage,
  loadActiveSlot,
  loadCampaignSession,
  saveActiveSlot,
  saveCampaignSession,
} from './session';

describe('campaign session persistence', () => {
  beforeEach(async () => {
    closeSessionStorage();
    await indexedDB.deleteDatabase('eu1444-sessions');
  });

  afterEach(() => closeSessionStorage());

  it('khôi phục chat và slot đang chơi sau khi mở lại', async () => {
    await saveCampaignSession('slot-a', {
      version: 1,
      entries: [
        {
          turn: 1,
          gameDate: { year: 1444, month: 11, day: 15, hour: 7 },
          action: 'Bước vào quán trọ',
          narrative: 'Cánh cửa gỗ mở ra.',
          outcome: '',
        },
      ],
      scene: { ...emptyScene(), place: 'Quán trọ' },
      budget: DEFAULT_BUDGET,
      charName: 'Aldric',
      tickNote: 'đã chạy',
      previousRegionId: 'region_swabia',
    });
    await saveActiveSlot('slot-a');
    closeSessionStorage();

    expect((await loadCampaignSession('slot-a'))?.entries[0]?.narrative).toBe('Cánh cửa gỗ mở ra.');
    expect((await loadCampaignSession('slot-a'))?.scene.place).toBe('Quán trọ');
    expect(await loadActiveSlot()).toBe('slot-a');
  });
});
