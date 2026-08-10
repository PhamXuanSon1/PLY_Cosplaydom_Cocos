import { _decorator, Component, Node, CCString, sp, EventHandler } from 'cc';
import { MakeupTarget } from '../DrawItem/MakeupTarget';
import { DrawItemController, DrawItemType } from '../DrawItem/DrawItemController';
import { FxType, Ply_SoundManager } from '../ScriptTemplate/Ply_SoundManager';
import { Ply_Pool, PoolType } from '../ScriptTemplate/Ply_Pool';

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

    // Index map hiện tại. Không dùng @property readonly vì các script khác set trực tiếp giá trị này.
    public currentMapIndex: number = 0;

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

            // Tăng index TRƯỚC khi chạy event chuyển map (để code lấy đúng index mới)
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
