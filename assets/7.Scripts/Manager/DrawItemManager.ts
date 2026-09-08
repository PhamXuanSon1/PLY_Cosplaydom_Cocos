import { _decorator, Component, Node, CCString, sp, EventHandler, Enum } from 'cc';
import { MakeupTarget } from '../DrawItem/MakeupTarget';
import { DrawItemController, DrawItemType } from '../DrawItem/DrawItemController';
import { FxType, Ply_SoundManager } from '../ScriptTemplate/Ply_SoundManager';
import { Ply_Pool, PoolType } from '../ScriptTemplate/Ply_Pool';
import { CharacterManager } from './CharacterManager';

const { ccclass, property } = _decorator;

/**
 * Cấu hình makeup cho từng Map (port từ DrawItemManager.MapMakeupConfig của Unity).
 */
@ccclass('MapMakeupConfig')
export class MapMakeupConfig {
    @property({ displayName: 'Map Name', tooltip: 'Tên của màn (chỉ để dễ nhìn trong Inspector)' })
    public mapName: string = 'New Map';

    @property({
        type: [MakeupTarget],
        displayName: 'Targets In Map',
        tooltip: 'Kéo các điểm tô phấn (Makeup Target) của map này vào đây'
    })
    public targetsInMap: MakeupTarget[] = [];

    @property({
        type: [DrawItemController],
        displayName: 'Items In Map',
        tooltip: 'Kéo trực tiếp các đồ vật (DrawItemController) không dùng Makeup Target (VD: SnapToTarget, ClickOnly) vào đây'
    })
    public itemsInMap: DrawItemController[] = [];

    @property({
        type: Node,
        displayName: 'Heart Spawn Pos',
        tooltip: 'Node để làm cha của hiệu ứng Heart khi hoàn thành nét vẽ'
    })
    public heartSpawnPos: Node | null = null;

    @property({
        type: Node,
        displayName: 'Progress UI Pos',
        tooltip: 'Vị trí hiển thị vòng Progress Fill cho Map này (tuỳ chọn)'
    })
    public progressUIPos: Node | null = null;

    @property({
        type: [EventHandler],
        displayName: 'On Map Completed',
        tooltip: 'Chạy khi hoàn thành toàn bộ map (thường dùng để chuyển sang map tiếp theo)'
    })
    public OnMapCompleted: EventHandler[] = [];
}

/** Cách thưởng Heart + anim vui. */
export enum HeartRewardMode {
    /** Cứ đủ `heartRewardEveryItems` DrawItem hoàn thành thì thưởng 1 lần. */
    EveryNItems = 0,
    /** Chỉ thưởng khi chơi xong TRỌN một nhóm DrawItem được chỉ định sẵn. */
    RequiredItemGroups = 1,
}
Enum(HeartRewardMode);

/**
 * Một nhóm "đồ bắt buộc": chỉ khi TẤT CẢ item/target trong nhóm đã hoàn thành
 * thì mới sinh Heart + chạy anim vui. Mỗi nhóm chỉ thưởng đúng 1 lần.
 */
@ccclass('HeartRewardGroup')
export class HeartRewardGroup {
    @property({ displayName: 'Group Name', tooltip: 'Tên nhóm (chỉ để dễ nhìn trong Inspector)' })
    public groupName: string = 'New Heart Group';

    @property({
        type: [DrawItemController],
        displayName: 'Required Items',
        tooltip: 'Các DrawItem BẮT BUỘC phải chơi xong. Chơi hết nhóm này mới ra Heart + anim vui.'
    })
    public requiredItems: DrawItemController[] = [];

    @property({
        type: [MakeupTarget],
        displayName: 'Required Targets',
        tooltip: 'Tuỳ chọn: các Makeup Target cũng phải tô xong mới tính là hoàn thành nhóm.'
    })
    public requiredTargets: MakeupTarget[] = [];

    @property({
        type: Node,
        displayName: 'Heart Spawn Pos',
        tooltip: 'Tuỳ chọn: nơi sinh Heart cho riêng nhóm này. Bỏ trống thì dùng Heart Spawn Pos của map hiện tại.'
    })
    public heartSpawnPos: Node | null = null;

    @property({
        displayName: 'Play Happy Anim',
        tooltip: 'Có chạy anim vui của nhân vật khi hoàn thành nhóm này không.'
    })
    public playHappyAnim: boolean = true;
}

/**
 * DrawItemManager - port từ DrawItemManager.cs (Unity).
 * - Đã bỏ Luna & AppLovinAnalytics.
 * - Đăng ký lên globalThis + static Instance để các script khác
 *   (DrawInputManager, MakeupTarget, HandHintManager) tra cứu qua (globalThis as any).DrawItemManager.Instance.
 */
@ccclass('DrawItemManager')
export class DrawItemManager extends Component {

    public static Instance: DrawItemManager | null = null;

    @property({
        type: [CCString],
        group: { name: '1. Makeup IDs', id: 'makeupIds' },
        displayName: 'Available Makeup IDs',
        tooltip: 'Danh sách tất cả ID makeup dùng trong game (ví dụ: son_moi, danh_nen, ke_mat).'
    })
    public availableMakeupIDs: string[] = [];

    @property({
        type: sp.Skeleton,
        group: { name: '2. Spine Character', id: 'spineChar' },
        displayName: 'Character Skeleton',
        tooltip: 'Spine Skeleton của nhân vật (dùng cho PlayHappyAnim)'
    })
    public characterSkeleton: sp.Skeleton | null = null;

    @property({
        type: [MapMakeupConfig],
        group: { name: '3. Map Config', id: 'mapConfig' },
        displayName: 'Map Configs',
        tooltip: 'Cấu hình target/đồ vật cho từng map. Khi tất cả target + item trong 1 map xong sẽ chạy Event chuyển map.'
    })
    public mapConfigs: MapMakeupConfig[] = [];

    @property({
        group: { name: '4. Status (Read Only)', id: 'status' },
        displayName: 'Current Map Status',
        readonly: true,
        tooltip: 'Trạng thái map hiện tại (chỉ để xem)'
    })
    public currentMapStatus: string = 'Đang ở Map 1';

    @property({
        type: HeartRewardMode,
        group: { name: '5. Heart Reward', id: 'heartReward' },
        displayName: 'Heart Reward Mode',
        tooltip: 'Every N Items: cứ đủ N item thì thưởng. '
            + 'Required Item Groups: chỉ thưởng khi chơi xong trọn một nhóm DrawItem đã chỉ định.'
    })
    public heartRewardMode: HeartRewardMode = HeartRewardMode.EveryNItems;

    @property({
        group: { name: '5. Heart Reward', id: 'heartReward' },
        displayName: 'Heart Reward Every Items',
        min: 1,
        step: 1,
        visible(this: DrawItemManager) { return this.heartRewardMode === HeartRewardMode.EveryNItems; },
        tooltip: 'Số DrawItem hoàn thành để thưởng 1 Heart + anim vui. Đặt 1 nếu muốn mỗi item đều có Heart.'
    })
    public heartRewardEveryItems: number = 3;

    @property({
        type: [HeartRewardGroup],
        group: { name: '5. Heart Reward', id: 'heartReward' },
        displayName: 'Heart Reward Groups',
        visible(this: DrawItemManager) { return this.heartRewardMode === HeartRewardMode.RequiredItemGroups; },
        tooltip: 'Mỗi nhóm là một bộ DrawItem bắt buộc. Chơi xong trọn nhóm mới sinh Heart + anim vui (mỗi nhóm 1 lần).'
    })
    public heartRewardGroups: HeartRewardGroup[] = [];

    // Index map hiện tại. Không dùng @property readonly vì các script khác set trực tiếp giá trị này.
    public currentMapIndex: number = 0;

    // Đếm số DrawItem đã hoàn thành kể từ lần thưởng Heart gần nhất (mode EveryNItems).
    private _itemsSinceLastHeart: number = 0;

    // Index các nhóm đã thưởng Heart (mode RequiredItemGroups) - mỗi nhóm chỉ thưởng 1 lần.
    private _rewardedHeartGroups: Set<number> = new Set<number>();

    protected onLoad(): void {
        DrawItemManager.Instance = this;
        (globalThis as any).DrawItemManager = DrawItemManager;

        this.updateMapStatusDisplay();
        // [Đã bỏ] AppLovinAnalytics.challengeStarted();
    }

    /** Chạy anim vui vẻ bằng cách đổi attachment mặt cười trên Spine. */
    public PlayHappyAnim(): void {
        const skeleton = this.characterSkeleton;
        if (!skeleton) return;

        skeleton.setAttachment('Set_P1_DryMouth', 'Base/smile');
        skeleton.setAttachment('Set_P1_Mouth', 'Base/mouth smile');
        skeleton.setAttachment('Set_P1_DVAMouth', 'Set_DVA/DVA_smile');
    }

    /**
     * Kiểm tra map hiện tại đã hoàn thành hết chưa. Nếu xong: tăng index + chạy Event chuyển map.
     * @returns true nếu vừa chuyển map.
     */
    public CheckMapCompletion(): boolean {
        if (this.currentMapIndex >= this.mapConfigs.length) return false;

        const currentConfig = this.mapConfigs[this.currentMapIndex];

        let isAllCompleted = true;
        for (const target of currentConfig.targetsInMap) {
            if (target != null && !target.isApplied) {
                isAllCompleted = false;
                break;
            }
        }

        if (isAllCompleted) {
            for (const item of currentConfig.itemsInMap) {
                if (item != null) {
                    // Chỉ kiểm tra isCompleted với ClickOnly, SnapToTarget, DragAwayToFade
                    if (item.itemType === DrawItemType.ClickOnly ||
                        item.itemType === DrawItemType.SnapToTarget ||
                        item.itemType === DrawItemType.DragAwayToFade) {
                        if (!item.isCompleted) {
                            isAllCompleted = false;
                            break;
                        }
                    }
                }
            }
        }

        if (isAllCompleted) {
            if (Ply_SoundManager.Ins != null) Ply_SoundManager.Ins.playFx(FxType.Happy);

            // Map vừa xong đã có Heart riêng -> reset bộ đếm để không thưởng dồn 2 Heart liền nhau.
            this._itemsSinceLastHeart = 0;

            // Tăng index TRƯỚC khi chạy event chuyển map (để code lấy đúng index mới)
            this.SpawnHeartAt(currentConfig.heartSpawnPos);
            if (CharacterManager.instance != null) {
                CharacterManager.instance.playHappyAnim();
            }

            this.currentMapIndex++;
            this.updateMapStatusDisplay();

            EventHandler.emitEvents(currentConfig.OnMapCompleted);

            return true;
        }

        return false;
    }

    private updateMapStatusDisplay(): void {
        if (this.currentMapIndex < this.mapConfigs.length) {
            this.currentMapStatus = `Đang ở Map ${this.currentMapIndex + 1} (Index: ${this.currentMapIndex})`;
        } else {
            this.currentMapStatus = 'Hoàn Thành (Tất cả Map đã xong)';
        }
    }

    /** Sinh 1 Heart từ Pool tại vị trí spawnParent và gắn làm con của nó. */
    public SpawnHeartAt(spawnParent: Node | null): void {
        if (Ply_Pool.Ins != null && spawnParent != null) {
            const heartUnit = Ply_Pool.Ins.spawn(PoolType.Heart, spawnParent.worldPosition);
            if (heartUnit) {
                heartUnit.node.setParent(spawnParent, true);
                const prefab = Ply_Pool.Ins.getPrefab(PoolType.Heart);
                if (prefab && prefab.data) {
                    heartUnit.node.setScale(prefab.data.scale);
                }
            }
        }
    }

    public SpawnHeartAndHappyAt(spawnParent: Node | null): void {
        if (Ply_SoundManager.Ins != null) Ply_SoundManager.Ins.playFx(FxType.Happy);
        this.SpawnHeartAt(spawnParent);
    }

    /**
     * Gọi mỗi khi hoàn thành 1 DrawItem (ClickOnly / SnapToTarget / DragAwayToFade).
     * Chỉ khi đủ `heartRewardEveryItems` item mới thưởng Heart + anim vui,
     * thay vì bắn Heart ở mọi lần snap. Tiếng động do phía gọi tự phát.
     * @param fallbackSpawnParent Node dự phòng nếu map hiện tại chưa gán Heart Spawn Pos.
     * @returns true nếu lần này có thưởng Heart.
     */
    public NotifyDrawItemCompleted(fallbackSpawnParent: Node | null = null): boolean {
        if (this.heartRewardMode === HeartRewardMode.RequiredItemGroups) {
            return this.checkHeartRewardGroups(fallbackSpawnParent);
        }

        const threshold = this.heartRewardEveryItems > 0 ? Math.floor(this.heartRewardEveryItems) : 1;

        this._itemsSinceLastHeart++;
        if (this._itemsSinceLastHeart < threshold) {
            return false;
        }
        this._itemsSinceLastHeart = 0;

        const spawnParent = this.GetHeartSpawnPosForCurrentMap() || fallbackSpawnParent;
        this.SpawnHeartAt(spawnParent);
        if (CharacterManager.instance != null) {
            CharacterManager.instance.playHappyAnim();
        }

        return true;
    }

    /**
     * Gọi khi một Makeup Target vừa tô xong. Chỉ kiểm tra nhóm "đồ bắt buộc",
     * KHÔNG đụng tới bộ đếm của mode Every N Items (để hành vi cũ giữ nguyên).
     * @returns true nếu lần này có thưởng Heart.
     */
    public NotifyMakeupTargetApplied(fallbackSpawnParent: Node | null = null): boolean {
        if (this.heartRewardMode !== HeartRewardMode.RequiredItemGroups) return false;
        return this.checkHeartRewardGroups(fallbackSpawnParent);
    }

    /**
     * Duyệt các nhóm "đồ bắt buộc": nhóm nào vừa đủ điều kiện thì sinh Heart + anim vui.
     * Snap/click một item lẻ sẽ KHÔNG ra Heart nếu nhóm chứa nó chưa xong.
     * @returns true nếu lần này có thưởng Heart.
     */
    private checkHeartRewardGroups(fallbackSpawnParent: Node | null): boolean {
        let rewarded = false;

        for (let i = 0; i < this.heartRewardGroups.length; i++) {
            if (this._rewardedHeartGroups.has(i)) continue;

            const group = this.heartRewardGroups[i];
            if (group == null || !this.isHeartRewardGroupCompleted(group)) continue;

            this._rewardedHeartGroups.add(i);

            const spawnParent = group.heartSpawnPos
                || this.GetHeartSpawnPosForCurrentMap()
                || fallbackSpawnParent;
            this.SpawnHeartAt(spawnParent);

            if (group.playHappyAnim && CharacterManager.instance != null) {
                CharacterManager.instance.playHappyAnim();
            }

            rewarded = true;
        }

        return rewarded;
    }

    /** Nhóm hoàn thành khi mọi item/target được chỉ định đều xong. Nhóm rỗng thì không bao giờ thưởng. */
    private isHeartRewardGroupCompleted(group: HeartRewardGroup): boolean {
        let hasRequirement = false;

        for (const item of group.requiredItems) {
            if (item == null) continue;
            hasRequirement = true;
            if (!item.isCompleted) return false;
        }

        for (const target of group.requiredTargets) {
            if (target == null) continue;
            hasRequirement = true;
            if (!target.isApplied) return false;
        }

        return hasRequirement;
    }

    /** Đặt lại bộ đếm + trạng thái đã thưởng của các nhóm (dùng khi restart / đổi màn thủ công). */
    public ResetHeartRewardCounter(): void {
        this._itemsSinceLastHeart = 0;
        this._rewardedHeartGroups.clear();
    }

    public IsMakeupIDCompletedInCurrentMap(makeupID: string): boolean {
        return this.IsMakeupIDCompleted(makeupID, this.currentMapIndex);
    }

    public IsMakeupIDCompleted(makeupID: string, mapIndex: number): boolean {
        if (mapIndex >= this.mapConfigs.length) return false;

        const config = this.mapConfigs[mapIndex];
        for (const target of config.targetsInMap) {
            if (target != null && target.requiredMakeupID === makeupID) {
                if (!target.isApplied) {
                    return false;
                }
            }
        }
        return true;
    }

    public GetMakeupProgressInCurrentMap(makeupID: string): number {
        if (this.currentMapIndex >= this.mapConfigs.length) return 0;

        const currentConfig = this.mapConfigs[this.currentMapIndex];
        let totalRequired = 0;
        let totalCurrent = 0;

        for (const target of currentConfig.targetsInMap) {
            if (target != null && target.requiredMakeupID === makeupID) {
                const targetMax = target.continuousMode ? target.continuousRequiredSeconds : target.requiredDrawTimes;
                totalRequired += targetMax;
                totalCurrent += target.CurrentDrawTimes;
            }
        }

        if (totalRequired <= 0) return 0;
        return Math.min(1, Math.max(0, totalCurrent / totalRequired));
    }

    public GetHeartSpawnPosForCurrentMap(): Node | null {
        if (this.currentMapIndex < this.mapConfigs.length) {
            return this.mapConfigs[this.currentMapIndex].heartSpawnPos;
        }
        return null;
    }

    public GetProgressUIPosForCurrentMap(): Node | null {
        if (this.currentMapIndex < this.mapConfigs.length) {
            return this.mapConfigs[this.currentMapIndex].progressUIPos;
        }
        return null;
    }
}
