import { _decorator, Component, Node, CCFloat, Animation, tween, Tween, Vec3 } from 'cc';
import { DrawItemManager } from './DrawItemManager';
import { DrawInputManager } from './DrawInputManager';
import { DrawItemController, DrawItemType } from '../DrawItem/DrawItemController';
import { MakeupTarget } from '../DrawItem/MakeupTarget';

const { ccclass, property } = _decorator;

/**
 * Cấu hình thứ tự gợi ý cho từng Map (port từ HandHintManager.MapHintConfig).
 */
@ccclass('MapHintConfig')
export class MapHintConfig {
    @property({ displayName: 'Map Name' })
    public mapName: string = 'New Map';

    @property({
        type: [DrawItemController],
        displayName: 'Ordered Hint Items',
        tooltip: 'Danh sách DrawItemController theo đúng thứ tự muốn hiện bàn tay gợi ý.'
    })
    public orderedHintItems: DrawItemController[] = [];
}

/**
 * HandHintManager - port từ HandHintManager.cs (Unity).
 * - DOTween -> cocos `tween`. Animator trigger -> Animation.play(clipName).
 * - static Instance + đăng ký globalThis để khớp các caller cũ (DrawInputManager, MakeupTarget).
 *
 * LƯU Ý: circleRadius / dragAwayHintDistance là khoảng cách theo world-space. Unity dùng "unit",
 * còn Cocos 2D dùng "pixel" nên các giá trị này cần chỉnh lại (to hơn) trong Inspector cho hợp màn hình.
 */
@ccclass('HandHintManager')
export class HandHintManager extends Component {

    public static Instance: HandHintManager | null = null;

    @property({
        type: Node,
        group: { name: '1. UI Objects', id: 'uiObjects' },
        displayName: 'Hand Icon',
        tooltip: 'Node icon bàn tay gợi ý'
    })
    public handIcon: Node | null = null;

    @property({
        type: Node,
        group: { name: '1. UI Objects', id: 'uiObjects' },
        displayName: 'Hand Animator',
        tooltip: 'Node chứa Animation của bàn tay (clip "Click")'
    })
    public handAnimator: Node | null = null;

    @property({ type: CCFloat, group: { name: '2. Hint Settings', id: 'hintSettings' }, displayName: 'Delay Before Hint' })
    public delayBeforeHint: number = 2.5;

    @property({
        type: CCFloat, group: { name: '2. Hint Settings', id: 'hintSettings' },
        displayName: 'Circle Radius',
        tooltip: 'Bán kính vòng xoay chà xát (world-space, cần chỉnh to cho Cocos pixel)'
    })
    public circleRadius: number = 100;

    @property({
        type: CCFloat, group: { name: '2. Hint Settings', id: 'hintSettings' },
        displayName: 'Circle Duration',
        tooltip: 'Thời gian hoàn thành 1 vòng xoay (càng lớn thì xoay càng chậm)'
    })
    public circleDuration: number = 1.5;

    @property({
        type: CCFloat, group: { name: '2. Hint Settings', id: 'hintSettings' },
        displayName: 'Drag Away Hint Distance',
        tooltip: 'Khoảng cách kéo tay cho item loại DragAwayToFade (world-space pixel)'
    })
    public dragAwayHintDistance: number = 200;

    @property({ group: { name: '3. Hints Per Map', id: 'hintsPerMap' }, type: MapHintConfig, displayName: 'Map 1 Hints' })
    public map1_Hints: MapHintConfig = new MapHintConfig();
    @property({ group: { name: '3. Hints Per Map', id: 'hintsPerMap' }, type: MapHintConfig, displayName: 'Map 2 Hints' })
    public map2_Hints: MapHintConfig = new MapHintConfig();
    @property({ group: { name: '3. Hints Per Map', id: 'hintsPerMap' }, type: MapHintConfig, displayName: 'Map 3 Hints' })
    public map3_Hints: MapHintConfig = new MapHintConfig();
    @property({ group: { name: '3. Hints Per Map', id: 'hintsPerMap' }, type: MapHintConfig, displayName: 'Map 4 Hints' })
    public map4_Hints: MapHintConfig = new MapHintConfig();

    private currentStatus: string = 'Đang rảnh (Idle)';
    private idleTime: number = 0;
    private isCounting: boolean = false;

    protected onLoad(): void {
        HandHintManager.Instance = this;
        (globalThis as any).HandHintManager = HandHintManager;

        if (this.handIcon != null) this.handIcon.active = false;
    }

    protected update(dt: number): void {
        // Chặn đếm giờ nếu người chơi đang cầm/kéo đồ vật
        if (DrawInputManager.Instance != null && DrawInputManager.Instance.currentDrawItem != null) {
            this.idleTime = 0;
            return;
        }

        if (this.isCounting) {
            this.idleTime += dt;
            this.currentStatus = `Đang chờ... ${this.idleTime.toFixed(1)}s / ${this.delayBeforeHint}s`;

            if (this.idleTime >= this.delayBeforeHint) {
                this.isCounting = false;
                this.showHint();
            }
        }
    }

    public ShowHintImmediately(): void {
        this.stopAllHintLogic();
        // Tương đương WaitForEndOfFrame rồi ShowHint
        this.scheduleOnce(this.doShowHintDelayed, 0);
    }

    private doShowHintDelayed = (): void => {
        this.showHint();
    };

    public HideHintTemporarily(): void {
        this.stopAllHintLogic();
        if (this.handIcon != null) this.handIcon.active = false;
    }

    public ShowHintWithDelay(): void {
        this.stopAllHintLogic();
        this.isCounting = true;
        this.idleTime = 0;
        this.currentStatus = 'Bắt đầu đếm thời gian: 0s';
    }

    public CheckAndAdvanceHint(): void {
        this.ShowHintWithDelay();
    }

    private stopAllHintLogic(): void {
        this.isCounting = false;
        this.unschedule(this.doShowHintDelayed);
        if (this.handIcon != null) Tween.stopAllByTarget(this.handIcon);
        this.idleTime = 0;
        this.currentStatus = 'Đã dừng (đang cầm đồ hoặc ẩn)';
    }

    private showHint(): void {
        this.isCounting = false;
        this.idleTime = 0;

        const drawItemMgr = DrawItemManager.Instance;
        if (drawItemMgr == null) { this.currentStatus = 'LỖI: Không có DrawItemManager!'; return; }
        if (this.handIcon == null) { this.currentStatus = 'LỖI: Chưa gán Hand Icon!'; return; }

        const mapIndex = drawItemMgr.currentMapIndex;

        let config: MapHintConfig | null = null;
        if (mapIndex === 0) config = this.map1_Hints;
        else if (mapIndex === 1) config = this.map2_Hints;
        else if (mapIndex === 2) config = this.map3_Hints;
        else if (mapIndex === 3) config = this.map4_Hints;

        if (config == null) { this.currentStatus = `Bỏ qua: không có cài đặt cho Map ${mapIndex}`; return; }

        let nextItem: DrawItemController | null = null;

        for (const item of config.orderedHintItems) {
            if (item == null) continue;

            if (item.itemType === DrawItemType.ClickOnly ||
                item.itemType === DrawItemType.SnapToTarget ||
                item.itemType === DrawItemType.DragAwayToFade) {
                if (!item.isCompleted) {
                    nextItem = item;
                    break;
                }
            } else { // DirectDraw, DipAndDraw
                const target = this.findTargetFor(item.makeupID, mapIndex);
                if (target != null && !target.isApplied) {
                    nextItem = item;
                    break;
                }
            }
        }

        if (nextItem == null) {
            this.currentStatus = 'Xong: tất cả đồ vật đã làm xong hoặc list trống!';
            this.handIcon.active = false;
            return;
        }

        this.currentStatus = `Đang chỉ tay vào: ${nextItem.node.name}`;
        this.handIcon.active = true;

        // Reset Animator về mặc định
        const handAnim = this.handAnimator ? this.handAnimator.getComponent(Animation) : null;
        if (handAnim) handAnim.stop();

        const startPos = nextItem.node.worldPosition.clone();

        if (nextItem.itemType === DrawItemType.ClickOnly) {
            this.handIcon.setWorldPosition(startPos);
            // Clip "Click" đã set Loop trong Animation, chỉ cần play sau 0.1s cho node kịp bật
            this.scheduleOnce(() => {
                if (handAnim) handAnim.play('Click');
            }, 0.1);
        } else if (nextItem.itemType === DrawItemType.SnapToTarget) {
            if (nextItem.snapTarget != null) {
                this.animateDrag(startPos, nextItem.snapTarget.worldPosition.clone());
            } else {
                console.warn(`[HandHint] Chưa gán snapTarget cho ${nextItem.node.name}`);
            }
        } else if (nextItem.itemType === DrawItemType.DirectDraw) {
            const target = this.findTargetFor(nextItem.makeupID, mapIndex);
            if (target != null) {
                const targetPos = this.getTargetPos(target);
                if (target.continuousMode) this.animateDragAndCircle(startPos, targetPos);
                else this.animateDrag(startPos, targetPos);
            } else {
                console.warn(`[HandHint] Không tìm thấy MakeupTarget có ID ${nextItem.makeupID}`);
            }
        } else if (nextItem.itemType === DrawItemType.DipAndDraw) {
            const target = this.findTargetFor(nextItem.makeupID, mapIndex);
            if (target != null && nextItem.dipTarget != null) {
                const targetPos = this.getTargetPos(target);
                const dipPos = nextItem.dipTarget.worldPosition.clone();
                this.animateDipAndDraw(startPos, dipPos, targetPos, target.continuousMode);
            } else {
                console.warn(`[HandHint] Thiếu MakeupTarget hoặc khay phấn cho ${nextItem.node.name}`);
            }
        } else if (nextItem.itemType === DrawItemType.DragAwayToFade) {
            this.animateDrag(startPos, startPos.clone().add(new Vec3(this.dragAwayHintDistance, 0, 0)));
        }
    }

    private getTargetPos(target: MakeupTarget): Vec3 {
        if (target == null) return new Vec3();
        return target.node.worldPosition.clone();
    }

    private animateDrag(start: Vec3, end: Vec3): void {
        if (this.handIcon == null) return;
        this.handIcon.setWorldPosition(start);
        tween(this.handIcon)
            .to(1.5, { worldPosition: end }, { easing: 'sineInOut' })
            .call(() => this.showHint())
            .start();
    }

    private animateDragAndCircle(start: Vec3, end: Vec3): void {
        if (this.handIcon == null) return;
        this.handIcon.setWorldPosition(start);

        const r = this.circleRadius;
        const seg = this.circleDuration / 4;
        const path = [
            end.clone().add(new Vec3(0, r, 0)),
            end.clone().add(new Vec3(-r, 0, 0)),
            end.clone().add(new Vec3(0, -r, 0)),
            end.clone().add(new Vec3(r, 0, 0)),
        ];

        let tw = tween(this.handIcon)
            .to(1, { worldPosition: end.clone().add(new Vec3(r, 0, 0)) }, { easing: 'sineInOut' });

        // 2 vòng xoay (tương đương DOPath SetLoops(2))
        for (let loop = 0; loop < 2; loop++) {
            for (const p of path) {
                tw = tw.to(seg, { worldPosition: p });
            }
        }

        tw.call(() => this.showHint()).start();
    }

    private animateDipAndDraw(start: Vec3, dip: Vec3, end: Vec3, circleAtEnd: boolean): void {
        if (this.handIcon == null) return;
        this.handIcon.setWorldPosition(start);

        let tw = tween(this.handIcon)
            .to(1, { worldPosition: dip }, { easing: 'sineInOut' })
            .delay(0.2); // Nghỉ 1 chút ở điểm nhúng phấn

        if (circleAtEnd) {
            const r = this.circleRadius;
            const seg = this.circleDuration / 4;
            const path = [
                end.clone().add(new Vec3(0, r, 0)),
                end.clone().add(new Vec3(-r, 0, 0)),
                end.clone().add(new Vec3(0, -r, 0)),
                end.clone().add(new Vec3(r, 0, 0)),
            ];
            tw = tw.to(1, { worldPosition: end.clone().add(new Vec3(r, 0, 0)) }, { easing: 'sineInOut' });
            for (let loop = 0; loop < 2; loop++) {
                for (const p of path) {
                    tw = tw.to(seg, { worldPosition: p });
                }
            }
        } else {
            tw = tw.to(1, { worldPosition: end }, { easing: 'sineInOut' });
        }

        tw.call(() => this.showHint()).start();
    }

    private findTargetFor(makeupID: string, mapIndex: number): MakeupTarget | null {
        const drawItemMgr = DrawItemManager.Instance;
        if (drawItemMgr == null || mapIndex >= drawItemMgr.mapConfigs.length) return null;

        const targets = drawItemMgr.mapConfigs[mapIndex].targetsInMap;
        for (const t of targets) {
            if (t == null) continue;
            if (t.requiredMakeupID.trim().toLowerCase() === makeupID.trim().toLowerCase() && !t.isApplied) {
                return t;
            }
        }
        return null;
    }
}
