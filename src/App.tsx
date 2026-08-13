import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppShell } from '@/ui/shell/AppShell';
import { NarrativeStage } from '@/ui/shell/NarrativeStage';
import { StatusPanel } from '@/ui/shell/StatusPanel';
import { SettingsPanel } from '@/ui/settings/SettingsPanel';
import { StartMenu, type StartMenuView } from '@/ui/start';
import { CharacterCreator } from '@/ui/character/CharacterCreator';
import { SkillsScreen } from '@/ui/skills';
import { EquipmentScreen } from '@/ui/items';
import { DuelScreen } from '@/ui/duel';
import { createSparringDuel } from '@/ui/duel/spar';
import { BattleScreen, createFieldBattle } from '@/ui/battle';
import { SiegeScreen, createCastleSiege } from '@/ui/siege';
import { HoldingScreen, openHoldings } from '@/ui/holding';
import { RealmScreen, createJudicialDuel, openRealm, type OpenRealm } from '@/ui/realm';
import { EventCards, WorldScreen, openWorld, useWorld, type OpenWorld } from '@/ui/world';
import { knowledgeOf } from '@/lore/knowledge';
import { worldStateOf } from '@/sim';
import { HOLDING_STREAM, type Holding } from '@/systems/holding';
import { createRngHub } from '@/core/rng';
import { applyPatch } from '@/state/mvu';
import { useGameStore } from '@/state/store';
import { useTurnStore } from '@/state/turn';
import { DUEL_STREAM, type DuelState } from '@/minigames/duel';
import { BATTLE_STREAM, type BattleState } from '@/minigames/battle';
import { SIEGE_STREAM, type SiegeSide, type SiegeState } from '@/systems/siege';
import { characterOf } from '@/systems/character';
import type { JudicialDuelRequest } from '@/systems/realm';
import { usePromptStore } from '@/state/prompts';
import { useSettingsStore } from '@/state/settings';
import {
  battleSummary,
  duelSummary,
  siegeSummary,
  type BuiltEncounter,
  type CombatSummary,
} from '@/systems/encounter';

export function App(): ReactNode {
  const finalized = useGameStore((state) => characterOf(state)?.identity.finalized ?? false);
  const booted = useTurnStore((state) => state.booted);
  const activeSlotId = useTurnStore((state) => state.activeSlotId);
  const slots = useTurnStore((state) => state.slots);
  const [menuOpen, setMenuOpen] = useState(true);
  const [menuView, setMenuView] = useState<StartMenuView>('main');
  const [campaignEntered, setCampaignEntered] = useState(false);
  // Mở lại được sau khi đã chốt: người chơi muốn bắt đầu một ván khác thì không
  // phải tải lại trang. Đóng lại thì ván đang chạy vẫn nguyên vẹn.
  const [reopened, setReopened] = useState(false);
  // Tab Kỹ năng của Phần 8 mục 11 mở thành lớp phủ toàn màn hình: đồ thị nhánh
  // cần chiều ngang, và một graph kéo thả nhét vào cột phải 320px thì kéo thả
  // cũng vô ích.
  const [skillsOpen, setSkillsOpen] = useState(false);
  // Màn trang bị của Phần 16 mục 18, cùng lý do: hình người hai mươi vùng kèm
  // ba thanh chống, bảng vừa người, bảng hư hỏng và bảng phân bổ tải không nhét
  // vừa cột phải 320px — mà chế độ xem che phủ thì càng không: nó là màn hình
  // người chơi nhìn lâu nhất trước mỗi trận.
  const [gearOpen, setGearOpen] = useState(false);
  // Màn hình đấu của Phần 9 mục 11, cùng lý do: một lưới 9×9 kèm bảng hành động
  // và nhật ký hiệp không nhét vừa cột phải.
  const [duel, setDuel] = useState<DuelState | null>(null);
  const judicialResolverRef = useRef<((winnerId: string) => void) | null>(null);
  // Màn hình dã chiến của Phần 10 mục 14 — cùng lý do: một lưới tới 50×50 kèm
  // bảng khởi động và bảng tướng không nhét vừa cột phải.
  const [battle, setBattle] = useState<BattleState | null>(null);
  // Màn hình vây hãm của Phần 11 mục 9, cùng lý do và nặng hơn: hai bảng đối
  // xứng, một sơ đồ mặt cắt, một bảng hành động chín dòng và một trục thời gian
  // không có cách nào nhét vừa cột phải.
  const [siege, setSiege] = useState<SiegeState | null>(null);
  // Màn hình thành trì của Phần 12 mục 11: một lưới tới 16×16 kèm bảng chọn công
  // trình, hàng đợi xây dựng và bốn bảng bên phải — cùng lý do với ba màn hình
  // trên, không có cách nào nhét vừa cột phải 320px.
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  // Màn hình lãnh thổ của Phần 13 mục 11: bản đồ vùng theo tỉnh, bảng chư hầu,
  // sổ nghĩa vụ, tòa án và cây kế vị — cùng lý do với bốn màn hình trên, và thêm
  // một lý do riêng: BẢNG ĐỔI THEO TƯỚC VỊ, nên nó cần cả chiều ngang để một
  // Công tước không thấy bảng của mình bị cắt mất ba mục.
  const [realm, setRealm] = useState<OpenRealm | null>(null);
  // Tab Thế giới của Phần 14 mục 8: tám thẻ quốc gia, tám bảng trạng thái khác
  // hẳn nhau, bản đồ tôn giáo và dòng thời gian châu lục. Cùng lý do chiều ngang
  // với năm màn hình trên, và thêm một lý do riêng: đây là màn hình DUY NHẤT mở
  // được từ lượt đầu tiên dù người chơi chưa là ai cả (mục 1) — nên nó không đứng
  // sau `creating` như các màn hình kia.
  const [world, setWorld] = useState<OpenWorld | null>(null);
  // Cột cài đặt thu gọn được: 384px cố định là gần một phần ba màn hình 1366px,
  // và sau khi cấu hình xong thì người chơi không mở lại nó trong hàng giờ.
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(false);
  const creating = campaignEntered && (!finalized || reopened);

  useEffect(() => {
    void Promise.all([
      useSettingsStore.getState().hydrate(),
      usePromptStore.getState().hydrate(),
      useTurnStore.getState().boot(),
    ]);
  }, []);

  const enterCampaign = (): void => {
    setCampaignEntered(true);
    setMenuOpen(false);
    setMenuView('main');
  };

  const startNewCampaign = async (): Promise<void> => {
    await useTurnStore.getState().newCampaign();
    setReopened(false);
    enterCampaign();
  };

  const continueCampaign = async (): Promise<void> => {
    if (!booted || slots.length === 0) return;
    await useTurnStore.getState().loadSlot(activeSlotId);
    setReopened(false);
    enterCampaign();
  };

  /**
   * Mở một buổi đấu tập.
   *
   * Dòng xúc sắc RIÊNG (`DUEL_STREAM`): số lần tung trong một trận thay đổi theo
   * cách người chơi đánh, và trên dòng `main` thì nó đẩy lệch mọi cú tung của
   * mọi lượt sau (R3).
   */
  const openDuel = (): void => {
    const snapshot = useGameStore.getState().snapshot();
    const hub = createRngHub(snapshot.meta.seed, snapshot.meta.rng);
    setDuel(createSparringDuel(snapshot, hub.stream(DUEL_STREAM), snapshot.meta.turn));
  };

  /** Ra trận cùng lãnh chúa. Dòng xúc sắc riêng của dã chiến, cùng lý do (R3). */
  const openBattle = (): void => {
    const snapshot = useGameStore.getState().snapshot();
    const hub = createRngHub(snapshot.meta.seed, snapshot.meta.rng);
    setBattle(createFieldBattle(snapshot, hub.stream(BATTLE_STREAM), snapshot.meta.turn));
  };

  /** Tới trước một lâu đài đá. Dòng xúc sắc riêng của công thành, cùng lý do (R3). */
  const openSiege = (side: SiegeSide = 'vay'): void => {
    const snapshot = useGameStore.getState().snapshot();
    const hub = createRngHub(snapshot.meta.seed, snapshot.meta.rng);
    setSiege(createCastleSiege(snapshot, hub.stream(SIEGE_STREAM), snapshot.meta.turn, side));
  };

  /**
   * Mở thành trì đang sở hữu. Dòng xúc sắc riêng, cùng lý do (R3): số lần tung
   * trong một năm xây dựng thay đổi theo cách người chơi quy hoạch.
   */
  const openHolding = (): void => {
    const snapshot = useGameStore.getState().snapshot();
    const hub = createRngHub(snapshot.meta.seed, snapshot.meta.rng);
    setHoldings(openHoldings(snapshot, hub.stream(HOLDING_STREAM)));
  };

  /**
   * Mở bảng cai trị. KHÔNG có thái ấp nào thì không mở gì cả — mục 11 nói thẳng:
   * tước nào chưa đạt thì bảng đó KHÔNG TỒN TẠI, không phải hiện ra rồi khóa.
   */
  const openRealmScreen = (): void => {
    setRealm(openRealm(useGameStore.getState().snapshot()));
  };

  const openJudicialDuel = (request: JudicialDuelRequest, onResult: (winnerId: string) => void): void => {
    const snapshot = useGameStore.getState().snapshot();
    const hub = createRngHub(snapshot.meta.seed, snapshot.meta.rng);
    judicialResolverRef.current = onResult;
    setDuel(createJudicialDuel(request, snapshot, hub.stream(DUEL_STREAM), snapshot.meta.turn));
  };

  /**
   * Mở tab Thế giới. KHÔNG có dòng xúc sắc nào ở đây, khác năm cửa trên: mở bảng
   * để NHÌN thì không tung gì cả. Một năm của châu lục chạy ở `advanceWorldYear`
   * với dòng riêng của nó, và đó là chỗ duy nhất tầng này đụng tới xúc sắc (R3).
   */
  const openWorldScreen = (): void => {
    setWorld(openWorld(useGameStore.getState().snapshot()));
  };

  /**
   * CỬA THỨ TƯ, và là cửa duy nhất không phải một cái nút: người chơi nhận lời
   * mời mà AI vừa phát ra giữa đoạn văn (`/src/systems/encounter`).
   *
   * Ván đã được dựng xong ở store — chỗ này chỉ mở đúng màn hình tương ứng.
   */
  const openEncounter = (built: BuiltEncounter): void => {
    if (built.kind === 'duel') setDuel(built.duel);
    else if (built.kind === 'battle') setBattle(built.battle);
    else setSiege(built.siege);
  };

  /**
   * Kết cục của một trận chảy ngược vào dòng diễn biến.
   *
   * Đúng cho CẢ BA cửa, không riêng cửa từ truyện: một buổi đấu tập mà người kể
   * chuyện không biết là đã diễn ra thì lượt sau nó sẽ tả ngài lành lặn bước ra
   * khỏi một buổi chiều mà ngài vừa gãy hai xương sườn.
   */
  const reportCombat = (told: CombatSummary): void => {
    useTurnStore.getState().logCombat(told);
  };

  const openFromStatus = (open: () => void): void => {
    setStatusDrawerOpen(false);
    open();
  };

  const statusPanel = (
    <StatusPanel
      onCreateCharacter={() => openFromStatus(() => setReopened(true))}
      onOpenSkills={() => openFromStatus(() => setSkillsOpen(true))}
      onOpenGear={() => openFromStatus(() => setGearOpen(true))}
      onOpenDuel={() => openFromStatus(openDuel)}
      onOpenBattle={() => openFromStatus(openBattle)}
      onOpenSiege={() => openFromStatus(() => openSiege('vay'))}
      onOpenDefence={() => openFromStatus(() => openSiege('thu'))}
      onOpenHolding={() => openFromStatus(openHolding)}
      onOpenRealm={() => openFromStatus(openRealmScreen)}
      onOpenWorld={() => openFromStatus(openWorldScreen)}
    />
  );
  const fullScreenOpen = creating || skillsOpen || gearOpen || duel !== null || battle !== null || siege !== null
    || holdings !== null || realm !== null || world !== null || menuOpen;

  return (
    <>
      <AppShell
        settingsCollapsed={settingsCollapsed}
        settings={
          <SettingsPanel
            collapsed={settingsCollapsed}
            onToggleCollapsed={() => setSettingsCollapsed((previous) => !previous)}
          />
        }
        narrative={<NarrativeStage onPlayEncounter={openEncounter} />}
        status={statusPanel}
      />
      {campaignEntered && !menuOpen && (
        <button
          type="button"
          onClick={() => {
            setMenuView('main');
            setMenuOpen(true);
          }}
          className="fixed top-2 left-1/2 z-40 -translate-x-1/2 rounded border border-oak-light bg-oak/90 px-3 py-1 text-xs tracking-widest text-brass shadow hover:bg-oak-light"
        >
          MENU
        </button>
      )}
      {creating && <CharacterCreator onClose={finalized ? () => setReopened(false) : undefined} />}
      {skillsOpen && !creating && <SkillsScreen onClose={() => setSkillsOpen(false)} />}
      {gearOpen && !creating && !skillsOpen && <EquipmentScreen onClose={() => setGearOpen(false)} />}
      {duel !== null && !creating && !skillsOpen && battle === null && (
        <DuelScreen
          duel={duel}
          playerSide="a"
          hideCommit={judicialResolverRef.current !== null}
          onFinish={(done) => {
            const resolve = judicialResolverRef.current;
            if (resolve === null || done.winner === '') return;
            reportCombat(duelSummary(done, 'a'));
            const store = useGameStore.getState();
            const snapshot = store.snapshot();
            store.commitRng({
              streams: { ...snapshot.meta.rng.streams, [DUEL_STREAM]: done.rngState },
            });
            resolve(done.winner === 'a' ? done.a.id : done.b.id);
            judicialResolverRef.current = null;
          }}
          onCommit={(done) => {
            if (judicialResolverRef.current === null) reportCombat(duelSummary(done, 'a'));
          }}
          onClose={() => {
            judicialResolverRef.current = null;
            setDuel(null);
          }}
        />
      )}
      {battle !== null && !creating && !skillsOpen && siege === null && (
        <BattleScreen
          battle={battle}
          onCommit={(done) => reportCombat(battleSummary(done, done.playerSide))}
          onClose={() => setBattle(null)}
        />
      )}
      {siege !== null && !creating && !skillsOpen && (
        <SiegeScreen
          siege={siege}
          onCommit={(done) => reportCombat(siegeSummary(done))}
          onClose={() => setSiege(null)}
        />
      )}
      {holdings !== null && !creating && !skillsOpen && siege === null && (
        <HoldingScreen
          holdings={holdings}
          date={useGameStore.getState().meta.gameDate}
          onClose={() => setHoldings(null)}
        />
      )}
      {realm !== null && !creating && !skillsOpen && holdings === null && (
        <RealmScreen
          realm={realm.realm}
          vassals={realm.vassals}
          titles={realm.titles}
          date={realm.date}
          military={realm.military}
          militaryResources={realm.militaryResources}
          onJudicialDuel={openJudicialDuel}
          onClose={() => setRealm(null)}
        />
      )}
      {world !== null && realm === null && holdings === null && (
        <WorldScreen
          nations={world.nations}
          religions={world.religions}
          economy={world.economy}
          titles={world.titles}
          year={world.year}
          factionId={knowledgeOf(useGameStore.getState().snapshot()).factionId}
          confidence={Object.fromEntries(
            Object.entries(knowledgeOf(useGameStore.getState().snapshot()).known).map(([id, fact]) => [id, fact.confidence]),
          )}
          feed={world.feed}
          knowledge={world.knowledge}
          hereRegionId={world.hereRegionId}
          campaign={world.campaign}
          onOpenBattle={() => {
            setWorld(null);
            openBattle();
          }}
          onOpenSiege={() => {
            setWorld(null);
            openSiege('vay');
          }}
          onClose={() => setWorld(null)}
        />
      )}
      {/*
        CHỒNG THẺ — LUỒNG 1 của Phần 15 mục 7, và là thứ DUY NHẤT trong cả game
        được phép ập vào giữa lúc người chơi đang đọc. Nó đứng CUỐI danh sách nên
        nó nằm trên mọi lớp phủ khác: một tuyên bố vạ tuyệt thông không được nấp
        sau màn hình vây thành.
      */}
      <PendingEventCards />
      {menuOpen && (
        <StartMenu
          view={menuView}
          canClose={campaignEntered}
          onView={setMenuView}
          onNewGame={startNewCampaign}
          onContinue={continueCampaign}
          onPlayLoaded={enterCampaign}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {!creating && !menuOpen && (
        <button
          type="button"
          onClick={() => setStatusDrawerOpen(true)}
          aria-expanded={statusDrawerOpen}
          aria-controls="global-status-drawer"
          className={`fixed right-3 bottom-3 z-[90] rounded border border-brass bg-oak px-3 py-2 text-xs font-semibold tracking-widest text-brass shadow-2xl hover:bg-oak-light ${fullScreenOpen ? '' : 'xl:hidden'}`}
        >
          Trạng thái
        </button>
      )}
      {!creating && !menuOpen && statusDrawerOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-ink/75" role="dialog" aria-modal="true" aria-label="Bảng trạng thái">
          <button
            type="button"
            aria-label="Đóng bảng trạng thái"
            onClick={() => setStatusDrawerOpen(false)}
            className="min-w-0 flex-1"
          />
          <aside id="global-status-drawer" className="relative h-full w-[min(24rem,94vw)] overflow-y-auto border-l border-brass/50 bg-oak shadow-2xl">
            <button
              type="button"
              onClick={() => setStatusDrawerOpen(false)}
              className="sticky top-2 z-10 float-right mr-2 rounded border border-oak-light bg-oak px-2 py-1 text-xs text-vellum"
            >
              Đóng
            </button>
            {statusPanel}
          </aside>
        </div>
      )}
    </>
  );
}

/**
 * Chồng thẻ nối thẳng vào store.
 *
 * `world.cards` do `stackCards` xếp ở tick nhanh; ở đây chỉ tra ngược ra biến cố
 * và giữ nguyên thứ tự ấy. Component KHÔNG tự sắp xếp lại — luật "cái gì gấp
 * hơn" nằm ở `sim/events.ts`, và để nó ở hai chỗ là hai chỗ sẽ lệch nhau.
 */
function PendingEventCards(): ReactNode {
  const world = useWorld();
  if (world === null || world.cards.length === 0) return null;

  const byId = new Map(world.events.map((event) => [event.id, event]));
  const events = world.cards
    .map((id) => byId.get(id))
    .filter((event): event is NonNullable<typeof event> => event !== undefined);
  if (events.length === 0) return null;

  /**
   * Lật xong một tấm thì gỡ nó khỏi chồng.
   *
   * Đi qua MVU như mọi thay đổi khác (R2): `world.cards` nằm trong save, nên một
   * `set()` thẳng vào store là một thay đổi mà undo không tua lại được — người
   * chơi undo một lượt và tấm thẻ họ vừa quyết sẽ không quay lại.
   */
  const choose = (eventId: string): void => {
    const store = useGameStore.getState();
    const snapshot = store.snapshot();
    const current = worldStateOf(snapshot);
    if (current === null) return;

    const applied = applyPatch(
      snapshot,
      [
        {
          op: 'set',
          path: 'world.cards',
          from: current.cards,
          to: current.cards.filter((id) => id !== eventId),
          reason: 'người chơi đã lật xong một tấm thẻ sự kiện',
          source: 'json',
        },
      ],
      { actor: 'engine' },
    );
    if (applied.applied && applied.next !== null) store.commitBatch(applied.next);
  };

  return <EventCards events={events} onChoose={(eventId) => choose(eventId)} />;
}
