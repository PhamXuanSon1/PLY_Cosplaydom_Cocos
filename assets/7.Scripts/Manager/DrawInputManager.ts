import { _decorator, Component, Node, Camera, Vec3, Vec2, Sprite, Animation, CCFloat, CCBoolean, EventTouch, Input, input, tween, Tween, UIOpacity, UITransform, geometry, PhysicsSystem, PhysicsSystem2D, Collider, Collider2D, RigidBody2D, Layers, game, BoxCollider2D, CircleCollider2D, PolygonCollider2D, Intersection2D, director, view } from 'cc';
import { AppLovinAnalytics } from '../Tool/AppLovinAnalytics';
import { FxType, Ply_SoundManager } from '../ScriptTemplate/Ply_SoundManager';
import { CharacterManager } from './CharacterManager';
import { Ply_Pool, PoolType } from '../ScriptTemplate/Ply_Pool';
import { DrawItemController, DrawItemType } from '../DrawItem/DrawItemController';
import { DrawItemMovement } from '../DrawItem/DrawItemMovement';
import { DrawItemGraphic } from '../DrawItem/DrawItemGraphic';
import { DipTarget } from '../DrawItem/DipTarget';
import { MakeupTarget } from '../DrawItem/MakeupTarget';
import { GameManager } from './GameManager';
import { DrawItemManager } from './DrawItemManager';
import { HandHintManager } from './HandHintManager';
import { PhysicsSyncAfterAnim } from '../DrawItem/PhysicsSyncAfterAnim';

const { ccclass, property } = _decorator;

@ccclass('DrawInputManager')
export class DrawInputManager extends Component {

    public static Instance: DrawInputManager | null = null;

    // ==========================================
    // 1. Layer Masks & Raycast
    // ==========================================
    @property({
        type: Layers.BitMask,
        group: { name: '1. Layer Masks & Raycast', id: 'layerMasks' },
        displayName: 'Draw Item Layer Mask',
        tooltip: 'Chọn Layer chứa các đồ vật tương tác (ví dụ DrawItem, UI_2D, Default...)'
    })
    public drawItemLayerMask: number = -1;

    @property({
        type: Layers.BitMask,
        group: { name: '1. Layer Masks & Raycast', id: 'layerMasks' },
        displayName: 'Makeup Target Layer',
        tooltip: 'Chọn Layer chứa MakeupTarget trên mặt'
    })
    public makeupTargetLayer: number = -1;

    @property({
        type: CCFloat,
        group: { name: '1. Layer Masks & Raycast', id: 'layerMasks' },
        displayName: 'Max Distance'
    })
    public maxDistance: number = 100;

    @property({
        type: Node,
        group: { name: '1. Layer Masks & Raycast', id: 'layerMasks' },
        displayName: 'Drag Container / Canvas',
        tooltip: 'Node Canvas hoặc Container chứa đồ vật khi đang kéo. Nếu để trống sẽ tự động tìm Canvas trong Scene.'
    })
    public dragContainer: Node | null = null;

    @property({
        type: CCFloat,
        group: { name: '1. Layer Masks & Raycast', id: 'layerMasks' },
        displayName: 'Dip Distance Threshold',
        tooltip: 'Khoảng cách tối đa (pixel) giữa tipPoint và dipTarget để tính là đã chấm phấn.'
    })
    public dipDistanceThreshold: number = 100;

    @property({
        type: CCFloat,
        group: { name: '1. Layer Masks & Raycast', id: 'layerMasks' },
        displayName: 'Snap Radius Multiplier',
        tooltip: 'Hệ số nhân bán kính dính Snap Radius (phù hợp UI 2D Pixel).'
    })
    public snapRadiusMultiplier: number = 50;

    // ==========================================
    // 2. Drag & Drop Settings
    // ==========================================
    @property({
        type: CCFloat,
        group: { name: '2. Drag & Drop Settings', id: 'dragSettings' },
        displayName: 'Drag Away Drop Duration',
        tooltip: 'Thời gian rơi mờ dần cho loại DragAwayToFade.'
    })
    public dragAwayDropDuration: number = 0.5;

    @property({
        type: CCFloat,
        group: { name: '2. Drag & Drop Settings', id: 'dragSettings' },
        displayName: 'Drag Away Drop Y Offset',
        tooltip: 'Khoảng cách rơi xuống trục Y khi thả cho loại DragAwayToFade.'
    })
    public dragAwayDropYOffset: number = 200;

    // ==========================================
    // 3. Progress UI
    // ==========================================

    @property({
        type: Node,
        group: { name: '3. Progress UI', id: 'progressUI' },
        displayName: 'Progress Container',
        tooltip: 'Container chứa vòng Fill UI, sẽ được bật lên khi cầm cọ vẽ'
    })
    public progressContainer: Node | null = null;

    @property({
        type: Sprite,
        group: { name: '3. Progress UI', id: 'progressUI' },
        displayName: 'Progress Fill Image (Sprite)',
        tooltip: 'Sprite type Filled để chạy fill progress'
    })
    public progressFillImage: Sprite | null = null;

    // ==========================================
    // 4. Intro Settings
    // ==========================================
    @property({
        group: { name: '4. Intro Settings', id: 'introSettings' },
        displayName: 'Is Click First',
        tooltip: 'Biến này dùng để kiểm tra xem người chơi đã click lần đầu tiên chưa'
    })
    public isClickFirst: boolean = false;

    @property({
        type: Node,
        group: { name: '4. Intro Settings', id: 'introSettings' },
        displayName: 'Intro Animator / Node',
        tooltip: 'Node chứa Animation component cho Intro'
    })
    public introAnimator: Node | null = null;

    @property({
        group: { name: '4. Intro Settings', id: 'introSettings' },
        displayName: 'Intro Clip Name',
        tooltip: 'Tên Animation Clip cần phát khi bắt đầu Intro (VD: CircleIntro). Nếu để trống sẽ tự động lấy Default Clip của Animation component.'
    })
    public introClipName: string = '';

    @property({
        type: CCFloat,
        group: { name: '4. Intro Settings', id: 'introSettings' },
        displayName: 'Intro Custom Duration',
        tooltip: 'Thời gian phát Intro (giây). Nếu > 0 sẽ ưu tiên dùng giá trị này thay cho độ dài clip.'
    })
    public introCustomDuration: number = 0;

    private isPlayingIntro: boolean = false;

    // ==========================================
    // 5. Fake Store Settings
    // ==========================================
    @property({
        group: { name: '5. Fake Store Settings', id: 'storeSettings' },
        displayName: 'Is Go To Store On Click Enabled',
        tooltip: 'Nếu bật, bất kỳ click nào cũng sẽ dẫn ra Store.'
    })
    public isGoToStoreOnClickEnabled: boolean = false;

    public enableGoToStoreOnClick(): void {
        this.isGoToStoreOnClickEnabled = true;
    }

    @property({ type: Camera, displayName: 'Main Camera' })
    public cam: Camera | null = null;

    public currentDrawItem: DrawItemMovement | null = null;
    public ignoreScrollInput: boolean = false;
    private currentDrawItemController: DrawItemController | null = null;
    private offset: Vec3 = new Vec3();
    private zCoord: number = 0;

    private isCurrentlyPlayingDragSound: boolean = false;
    private lastMousePos: Vec3 = new Vec3();

    private hoveredTargets: MakeupTarget[] = [];
    private currentFrameTargets: MakeupTarget[] = [];

    private isDropping: boolean = false;

    protected onLoad(): void {
        DrawInputManager.Instance = this;
    }

    protected start(): void {
        if (!this.cam) {
            this.cam = this.getComponent(Camera) || this.getComponentInChildren(Camera);
        }
    }

    protected onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    protected onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }

    public isTouchInsideValidArea(event: EventTouch): boolean {
        if (!event) return false;

        // 1. Kiểm tra toạ độ Screen so với ViewportRect (loại bỏ click vào 2 dải đen khi fit màn hình)
        if (typeof event.getLocation === 'function') {
            const screenPos = event.getLocation();
            const viewport = view.getViewportRect();
            if (viewport && viewport.width > 0 && viewport.height > 0) {
                if (screenPos.x < viewport.x || screenPos.x > (viewport.x + viewport.width) ||
                    screenPos.y < viewport.y || screenPos.y > (viewport.y + viewport.height)) {
                    return false;
                }
            }
        }

        // 2. Kiểm tra toạ độ UI so với VisibleSize
        if (typeof event.getUILocation === 'function') {
            const uiPos = event.getUILocation();
            const visibleSize = view.getVisibleSize();
            if (visibleSize && visibleSize.width > 0 && visibleSize.height > 0) {
                if (uiPos.x < 0 || uiPos.x > visibleSize.width ||
                    uiPos.y < 0 || uiPos.y > visibleSize.height) {
                    return false;
                }
            }
        }

        return true;
    }

    private onTouchStart(event: EventTouch): void {
        // Bỏ qua chuột phải (button = 2) hoặc chuột giữa (button = 1) khi người chơi click mở Console
        if ((event as any).getButton && (event as any).getButton() !== 0) return;

        // Bỏ qua nếu click vào vùng đen bên ngoài khung hình game (letterbox / pillarbox)
        if (!this.isTouchInsideValidArea(event)) return;

        const handHintMgr = HandHintManager.Instance || (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.HideHintTemporarily === 'function') {
            handHintMgr.HideHintTemporarily();
        }

        if (this.isPlayingIntro) return;
        if (this.ignoreScrollInput) return;

        if (this.isGoToStoreOnClickEnabled) {
            const gameMgr = GameManager.instance || (globalThis as any).GameManager?.instance || (window as any).GameManager?.instance;
            if (gameMgr && typeof gameMgr.GotoStore === 'function') {
                gameMgr.GotoStore();
            }
            return;
        }

        if (!this.isClickFirst) {
            if (this.introAnimator) {
                this.isPlayingIntro = true;
                const anim = this.introAnimator.getComponent(Animation);
                let duration = this.introCustomDuration;

                if (anim) {
                    const clipName = this.introClipName || (anim.defaultClip ? anim.defaultClip.name : '');
                    if (clipName) {
                        anim.play(clipName);
                        const state = anim.getState(clipName);
                        if (state && state.duration > 0 && duration <= 0) {
                            duration = state.duration;
                        }
                    } else {
                        anim.play();
                        if (anim.defaultClip && anim.defaultClip.duration > 0 && duration <= 0) {
                            duration = anim.defaultClip.duration;
                        }
                    }

                    const onAnimFinish = () => {
                        anim.off(Animation.EventType.FINISHED, onAnimFinish, this);
                        this.turnOnMap1();
                    };
                    anim.on(Animation.EventType.FINISHED, onAnimFinish, this);
                }

                if (duration <= 0) duration = 0.5;

                this.scheduleOnce(() => {
                    if (this.isPlayingIntro) {
                        this.turnOnMap1();
                    }
                }, duration);
                return;
            } else {
                this.turnOnMap1();
                return;
            }
        }

        this.mouseDown(event);
    }

    private onTouchMove(event: EventTouch): void {
        if (this.isPlayingIntro) return;
        if (!this.isClickFirst) return;

        const handHintMgr = HandHintManager.Instance || (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.HideHintTemporarily === 'function') {
            handHintMgr.HideHintTemporarily();
        }

        this.mouseDrag(event);
    }

    private onTouchEnd(event: EventTouch): void {
        if (this.isPlayingIntro) return;
        if (!this.isClickFirst) return;

        this.mouseUp();
        const handHintMgr = HandHintManager.Instance || (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.ShowHintWithDelay === 'function') {
            handHintMgr.ShowHintWithDelay();
        }
    }

    private onTouchCancel(event: EventTouch): void {
        if (this.isPlayingIntro) return;
        if (!this.isClickFirst) return;

        this.mouseUp();
        const handHintMgr = HandHintManager.Instance || (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.ShowHintWithDelay === 'function') {
            handHintMgr.ShowHintWithDelay();
        }
    }

    private getTouchWorldPos(event: EventTouch): Vec3 {
        const uiWorldPos = (event as any).getUIWorldPosition ? (event as any).getUIWorldPosition() : event.getUILocation();
        return new Vec3(uiWorldPos.x, uiWorldPos.y, 0);
    }

    private isPointInCollider(col: Collider2D, worldPoint: Vec3): boolean {
        if (!col || !col.node || !col.node.activeInHierarchy || !col.enabled) return false;
        const uiTransform = col.node.getComponent(UITransform);
        if (!uiTransform) return false;

        const localPos = uiTransform.convertToNodeSpaceAR(worldPoint);

        if (col instanceof BoxCollider2D) {
            const offset = col.offset;
            const size = col.size;
            const minX = offset.x - size.width * 0.5;
            const maxX = offset.x + size.width * 0.5;
            const minY = offset.y - size.height * 0.5;
            const maxY = offset.y + size.height * 0.5;
            return localPos.x >= minX && localPos.x <= maxX && localPos.y >= minY && localPos.y <= maxY;
        } else if (col instanceof CircleCollider2D) {
            const dx = localPos.x - col.offset.x;
            const dy = localPos.y - col.offset.y;
            return (dx * dx + dy * dy) <= (col.radius * col.radius);
        } else if (col instanceof PolygonCollider2D) {
            const pt = new Vec2(localPos.x - col.offset.x, localPos.y - col.offset.y);
            return Intersection2D.pointInPolygon(pt, col.points);
        } else {
            const size = uiTransform.contentSize;
            const anchor = uiTransform.anchorPoint;
            const minX = -anchor.x * size.width;
            const maxX = (1 - anchor.x) * size.width;
            const minY = -anchor.y * size.height;
            const maxY = (1 - anchor.y) * size.height;
            return localPos.x >= minX && localPos.x <= maxX && localPos.y >= minY && localPos.y <= maxY;
        }
    }

    private raycastNodes<T extends Component>(event: EventTouch, type: { new(): T }, layerMask: number = -1): T[] {
        const uiWorldPos = (event as any).getUIWorldPosition ? (event as any).getUIWorldPosition() : event.getUILocation();
        const touchWorldVec3 = new Vec3(uiWorldPos.x, uiWorldPos.y, 0);
        const touchVec2 = new Vec2(uiWorldPos.x, uiWorldPos.y);
        const results: T[] = [];

        const findComponentInHierarchy = (node: Node | null): T | null => {
            let current: Node | null = node;
            while (current) {
                const comp = current.getComponent(type);
                if (comp) return comp;
                current = current.parent;
            }
            return null;
        };

        // 1. Dùng PhysicsSystem2D kiểm tra va chạm bằng 2D Collider (BoxCollider2D, PolygonCollider2D...)
        if (PhysicsSystem2D.instance) {
            const colliders2D = PhysicsSystem2D.instance.testPoint(touchVec2);
            for (let i = 0; i < colliders2D.length; i++) {
                const colNode = colliders2D[i]?.node;
                if (!colNode) continue;

                if (layerMask !== -1 && (colNode.layer & layerMask) === 0) {
                    continue;
                }

                const comp = findComponentInHierarchy(colNode) || colliders2D[i].getComponent(type);
                if (comp && results.indexOf(comp) === -1) {
                    results.push(comp);
                }
            }
        }

        // 2. Fallback trực tiếp bằng Geometric Local Transform (phòng trường hợp Physics2D engine bị delay/chưa kịp sync sau khi đổi Map/Intro)
        const scene = director.getScene();
        if (scene) {
            const candidates = scene.getComponentsInChildren(type);
            for (let i = 0; i < candidates.length; i++) {
                const comp = candidates[i];
                if (!comp || !comp.node || !comp.node.activeInHierarchy || results.indexOf(comp) !== -1) continue;

                if (layerMask !== -1 && (comp.node.layer & layerMask) === 0) {
                    continue;
                }

                let hit = false;
                const colliders = comp.node.getComponentsInChildren(Collider2D);
                if (colliders && colliders.length > 0) {
                    for (const col of colliders) {
                        if (this.isPointInCollider(col, touchWorldVec3)) {
                            hit = true;
                            break;
                        }
                    }
                } else {
                    const uiTransform = comp.node.getComponent(UITransform);
                    if (uiTransform) {
                        const localPos = uiTransform.convertToNodeSpaceAR(touchWorldVec3);
                        const size = uiTransform.contentSize;
                        const anchor = uiTransform.anchorPoint;
                        const minX = -anchor.x * size.width;
                        const maxX = (1 - anchor.x) * size.width;
                        const minY = -anchor.y * size.height;
                        const maxY = (1 - anchor.y) * size.height;
                        if (localPos.x >= minX && localPos.x <= maxX && localPos.y >= minY && localPos.y <= maxY) {
                            hit = true;
                        }
                    }
                }

                if (hit) {
                    results.push(comp);
                }
            }
        }

        return results;
    }

    public mouseDown(event?: EventTouch): void {
        const handHintMgr = HandHintManager.Instance || (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.HideHintTemporarily === 'function') {
            handHintMgr.HideHintTemporarily();
        }

        if (!event) return;

        // Chặn grab item mới nếu đang giữ item hoặc đang trong quá trình thả
        if (this.currentDrawItem || this.isDropping) return;

        const controllers = this.raycastNodes(event, DrawItemController, this.drawItemLayerMask);
        for (let i = 0; i < controllers.length; i++) {
            const controller = controllers[i];

            if (!controller.isUnlocked()) {
                if (controller.itemType === DrawItemType.ClickOnly) {
                    continue;
                } else if (controller.itemType === DrawItemType.SnapToTarget) {
                    const lockedDrawItem = controller.getComponent(DrawItemMovement) || controller.getComponentInChildren(DrawItemMovement);
                    if (lockedDrawItem) {
                        this.currentDrawItem = lockedDrawItem;
                        this.currentDrawItemController = controller;

                        this.modifySortingOrder(this.currentDrawItem.node, 10);
                        this.handleWrongItem();
                    }
                    return;
                }
            }

            if (controller.itemType === DrawItemType.ClickOnly) {
                if (Ply_SoundManager.Ins != null) Ply_SoundManager.Ins.playFx(FxType.Click);

                if (!controller.isCompleted) {
                    controller.isCompleted = true;

                    const progressMgr = (globalThis as any).ProgressTrackingManager?.Instance || (window as any).ProgressTrackingManager?.Instance;
                    if (progressMgr && typeof progressMgr.AddProgress === 'function') {
                        progressMgr.AddProgress();
                    }

                    let mapChanged = false;
                    const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                    if (drawItemMgr && typeof drawItemMgr.NotifyDrawItemCompleted === 'function') {
                        drawItemMgr.NotifyDrawItemCompleted(controller.node);
                    }
                    if (drawItemMgr && typeof drawItemMgr.CheckMapCompletion === 'function') {
                        mapChanged = drawItemMgr.CheckMapCompletion();
                    }

                    if (handHintMgr) {
                        if (mapChanged && typeof handHintMgr.ShowHintImmediately === 'function') {
                            handHintMgr.ShowHintImmediately();
                        } else if (typeof handHintMgr.CheckAndAdvanceHint === 'function') {
                            handHintMgr.CheckAndAdvanceHint();
                        }
                    }
                }

                controller.emitCompleteEvent();
                return;
            }

            const drawItem = controller.getComponent(DrawItemMovement) || controller.getComponentInChildren(DrawItemMovement);
            if (drawItem) {
                if (Ply_SoundManager.Ins != null) Ply_SoundManager.Ins.playFx(FxType.Click);

                this.currentDrawItem = drawItem;
                this.currentDrawItemController = controller;

                const touchWorldPos = this.getTouchWorldPos(event);

                if (this.currentDrawItemController.itemType === DrawItemType.DirectDraw || this.currentDrawItemController.itemType === DrawItemType.DipAndDraw) {
                    if (this.progressContainer) {
                        this.progressContainer.active = true;
                        const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                        if (drawItemMgr && typeof drawItemMgr.GetProgressUIPosForCurrentMap === 'function') {
                            const customPos = drawItemMgr.GetProgressUIPosForCurrentMap();
                            if (customPos) {
                                this.progressContainer.setWorldPosition(customPos.worldPosition || customPos.position);
                            }
                        }
                    }

                    if (this.progressFillImage) {
                        const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                        if (drawItemMgr && typeof drawItemMgr.GetMakeupProgressInCurrentMap === 'function') {
                            this.progressFillImage.fillRange = drawItemMgr.GetMakeupProgressInCurrentMap(this.currentDrawItemController.makeupID);
                        }
                    }
                }

                const spineBoneMgr = (globalThis as any).SpineBoneManager?.Instance || (window as any).SpineBoneManager?.Instance;
                if (spineBoneMgr) {
                    for (let k = 0; k < this.currentDrawItemController.openBonesOnGrab.length; k++) {
                        if (typeof spineBoneMgr.OpenBone === 'function') spineBoneMgr.OpenBone(this.currentDrawItemController.openBonesOnGrab[k]);
                    }
                    for (let k = 0; k < this.currentDrawItemController.closeBonesOnGrab.length; k++) {
                        if (typeof spineBoneMgr.CloseBone === 'function') spineBoneMgr.CloseBone(this.currentDrawItemController.closeBonesOnGrab[k]);
                    }
                }

                this.currentDrawItemController.emitGrabEvent();

                if (this.currentDrawItemController.closedSpriteObj) {
                    this.currentDrawItemController.closedSpriteObj.active = false;
                }
                if (this.currentDrawItemController.openSpriteObj) {
                    this.currentDrawItemController.openSpriteObj.active = true;
                    const openSprites = this.currentDrawItemController.openSpriteObj.getComponentsInChildren(Sprite);
                    for (let i = 0; i < openSprites.length; i++) {
                        openSprites[i].enabled = true;
                        let opacity = openSprites[i].getComponent(UIOpacity) || openSprites[i].node.getComponent(UIOpacity);
                        if (opacity) opacity.opacity = 255;
                    }
                }

                if (this.currentDrawItemController.itemType === DrawItemType.DragAwayToFade) {
                    const sprites = this.currentDrawItem.getComponentsInChildren(Sprite);
                    for (const s of sprites) {
                        s.enabled = true;
                    }
                }

                // Lưu scale gốc TRƯỚC khi modifySortingOrder() đổi parent sang DragLayer/Canvas,
                // vì sau khi đổi parent thì local scale của node đã bị Cocos tính lại.
                const drawGraphic = this.getDrawGraphic(this.currentDrawItem);
                if (drawGraphic) drawGraphic.CaptureBaseline(this.currentDrawItem.node);

                this.modifySortingOrder(this.currentDrawItem.node, 10);

                Vec3.subtract(this.offset, this.currentDrawItem.node.worldPosition, touchWorldPos);

                Tween.stopAllByTarget(this.currentDrawItem.node);

                if (drawGraphic) this.tweenGrabTransform(this.currentDrawItem.node, drawGraphic);

                this.isCurrentlyPlayingDragSound = false;
                this.lastMousePos.set(touchWorldPos);

                if (this.currentDrawItemController.playLoopFxOnDrag && !this.currentDrawItemController.onlyPlayLoopFxWhenDrawing && Ply_SoundManager.Ins != null) {
                    Ply_SoundManager.Ins.playLoopFx(this.currentDrawItemController.loopFxToPlay);
                    this.isCurrentlyPlayingDragSound = true;
                }

                return;
            }
        }
    }

    public mouseDrag(event?: EventTouch): void {
        if (!this.currentDrawItem || !event) return;

        const touchWorldPos = this.getTouchWorldPos(event);
        const targetPos = touchWorldPos.clone().add(this.offset);
        this.currentDrawItem.node.setWorldPosition(targetPos);

        if (this.currentDrawItemController && this.currentDrawItemController.tipPoint) {
            if (this.progressContainer && this.progressContainer.active && this.progressFillImage) {
                if (this.currentDrawItemController.isCompleted) {
                    this.progressContainer.active = false;
                } else {
                    const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                    if (drawItemMgr && typeof drawItemMgr.GetMakeupProgressInCurrentMap === 'function') {
                        this.progressFillImage.fillRange = drawItemMgr.GetMakeupProgressInCurrentMap(this.currentDrawItemController.makeupID);
                    }
                }
            }

            if (this.currentDrawItemController.itemType === DrawItemType.DipAndDraw && !this.currentDrawItemController.hasDipped) {
                if (this.currentDrawItemController.dipTarget) {
                    const dipTargetComp = this.currentDrawItemController.dipTarget.getComponent(DipTarget);
                    const canDip = dipTargetComp ? dipTargetComp.isOpen : true;

                    const tipWorldPos = this.currentDrawItemController.tipPoint.worldPosition;
                    const dipWorldPos = this.currentDrawItemController.dipTarget.worldPosition;
                    const dist = Vec3.distance(tipWorldPos, dipWorldPos);

                    if (dist < this.dipDistanceThreshold && canDip) {
                        this.currentDrawItemController.hasDipped = true;
                        this.currentDrawItemController.emitCompleteEvent();
                    }
                }
            }

            const canDraw = this.currentDrawItemController.itemType === DrawItemType.DirectDraw ||
                (this.currentDrawItemController.itemType === DrawItemType.DipAndDraw && this.currentDrawItemController.hasDipped);

            let isHittingValidTarget = false;

            if (canDraw) {
                const targets = this.raycastNodes(event, MakeupTarget, this.makeupTargetLayer);
                this.currentFrameTargets = [];
                let isWrongItem = false;

                for (let i = 0; i < targets.length; i++) {
                    if (!this.currentDrawItemController) break;
                    const target = targets[i];

                    if (target.requiredMakeupID === this.currentDrawItemController.makeupID) {
                        if (!this.currentDrawItemController.isUnlocked()) {
                            isWrongItem = true;
                            break;
                        }

                        const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                        const mapIndexBeforeApply = drawItemMgr ? drawItemMgr.currentMapIndex : 0;
                        this.currentFrameTargets.push(target);

                        const beforeDraws = target.CurrentDrawTimes;
                        const wasApplied = target.isApplied;
                        const dt = game.deltaTime > 0 ? game.deltaTime : 0.016;
                        target.applyMakeup(dt, touchWorldPos);
                        const afterDraws = target.CurrentDrawTimes;
                        const isAppliedNow = target.isApplied;

                        if (this.currentDrawItemController && this.currentDrawItemController.playLoopFxOnDrag && this.currentDrawItemController.onlyPlayLoopFxWhenDrawing) {
                            const crossedInteger = Math.floor(afterDraws) > Math.floor(beforeDraws);
                            const startedFromZero = (beforeDraws === 0 && afterDraws > 0);

                            if (crossedInteger || startedFromZero) {
                                if (Ply_SoundManager.Ins != null) Ply_SoundManager.Ins.playFxQueued(this.currentDrawItemController.loopFxToPlay);
                            }
                        }

                        if (!wasApplied && isAppliedNow) {
                            if (this.currentDrawItemController && this.currentDrawItemController.playFxOnComplete && Ply_SoundManager.Ins != null) {
                                Ply_SoundManager.Ins.playFx(this.currentDrawItemController.completeFxToPlay);
                            }
                        }

                        isHittingValidTarget = true;
                        if (this.currentDrawItemController) {
                            // console.log(`[DrawInputManager] TipPoint của ${this.currentDrawItemController.node.name} đang chạm vào Target Collider của ${target.node.name}!`);
                            this.currentDrawItemController.emitTipPointHitEvent();
                        }

                        if (this.currentDrawItemController && !this.currentDrawItemController.isCompleted && drawItemMgr) {
                            if (typeof drawItemMgr.IsMakeupIDCompleted === 'function' && drawItemMgr.IsMakeupIDCompleted(this.currentDrawItemController.makeupID, mapIndexBeforeApply)) {
                                this.currentDrawItemController.isCompleted = true;
                                const progressMgr = (globalThis as any).ProgressTrackingManager?.Instance || (window as any).ProgressTrackingManager?.Instance;
                                if (progressMgr && typeof progressMgr.AddProgress === 'function') progressMgr.AddProgress();

                                this.currentDrawItemController.emitCompleteEvent();
                            }
                        }
                    }
                }

                const drawItemMgrInstance = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance;
                if (isHittingValidTarget && this.currentDrawItemController && !this.currentDrawItemController.isCompleted && this.currentDrawItemController.enableAutoComplete && drawItemMgrInstance) {
                    const progress = typeof drawItemMgrInstance.GetMakeupProgressInCurrentMap === 'function' ? drawItemMgrInstance.GetMakeupProgressInCurrentMap(this.currentDrawItemController.makeupID) : 0;

                    if (progress >= this.currentDrawItemController.autoCompleteThreshold) {
                        const mapConfig = drawItemMgrInstance.mapConfigs ? drawItemMgrInstance.mapConfigs[drawItemMgrInstance.currentMapIndex] : null;
                        if (mapConfig && mapConfig.targetsInMap) {
                            for (const t of mapConfig.targetsInMap) {
                                if (t && t.requiredMakeupID === this.currentDrawItemController.makeupID && !t.isApplied) {
                                    t.forceComplete();
                                }
                            }
                        }

                        if (!this.currentDrawItemController.isCompleted) {
                            if (typeof drawItemMgrInstance.IsMakeupIDCompletedInCurrentMap === 'function' && drawItemMgrInstance.IsMakeupIDCompletedInCurrentMap(this.currentDrawItemController.makeupID)) {
                                this.currentDrawItemController.isCompleted = true;
                                const progressMgr = (globalThis as any).ProgressTrackingManager?.Instance || (window as any).ProgressTrackingManager?.Instance;
                                if (progressMgr && typeof progressMgr.AddProgress === 'function') progressMgr.AddProgress();

                                this.currentDrawItemController.emitCompleteEvent();
                            }
                        }
                    }
                }

                if (isWrongItem) {
                    this.handleWrongItem();
                    return;
                }

                if (!this.currentDrawItemController) return;

                if (this.currentDrawItemController.drawFaceEffect) {
                    this.currentDrawItemController.drawFaceEffect.active = isHittingValidTarget;
                }

                for (let k = 0; k < this.hoveredTargets.length; k++) {
                    const target = this.hoveredTargets[k];
                    if (this.currentFrameTargets.indexOf(target) === -1) {
                        target.onBrushExit();
                    }
                }
                const temp = this.hoveredTargets;
                this.hoveredTargets = this.currentFrameTargets;
                this.currentFrameTargets = temp;
            }
        }
    }

    public forceDropItem(): void {
        this.mouseUp();
    }

    public ForceDropItem(): void {
        this.forceDropItem();
    }

    public mouseUp(): void {
        if (this.isDropping) return;

        if (this.currentDrawItem) {
            this.isDropping = true;
            try {
                if (this.progressContainer) {
                    this.progressContainer.active = false;
                }

                if (this.currentDrawItemController && this.currentDrawItemController.drawFaceEffect) {
                    this.currentDrawItemController.drawFaceEffect.active = false;
                }

                if (this.currentDrawItemController) {
                    this.currentDrawItemController.emitDropEvent();

                    if (this.currentDrawItemController.playLoopFxOnDrag && Ply_SoundManager.Ins != null) {
                        Ply_SoundManager.Ins.stopFx(this.currentDrawItemController.loopFxToPlay);
                    }
                    this.isCurrentlyPlayingDragSound = false;
                }

                const spineBoneMgr = (globalThis as any).SpineBoneManager?.Instance || (window as any).SpineBoneManager?.Instance;
                if (spineBoneMgr && this.currentDrawItemController) {
                    for (let k = 0; k < this.currentDrawItemController.openBonesOnGrab.length; k++) {
                        if (typeof spineBoneMgr.CloseBone === 'function') spineBoneMgr.CloseBone(this.currentDrawItemController.openBonesOnGrab[k]);
                    }
                    for (let k = 0; k < this.currentDrawItemController.closeBonesOnGrab.length; k++) {
                        if (typeof spineBoneMgr.OpenBone === 'function') spineBoneMgr.OpenBone(this.currentDrawItemController.closeBonesOnGrab[k]);
                    }
                }

                if (this.currentDrawItemController && this.currentDrawItemController.itemType === DrawItemType.SnapToTarget) {
                    if (this.currentDrawItemController.snapTarget) {
                        const dist = Vec3.distance(this.currentDrawItem.node.worldPosition, this.currentDrawItemController.snapTarget.worldPosition);
                        if (dist <= this.currentDrawItemController.snapRadius * this.snapRadiusMultiplier) { // scale radius cho 2D pixels
                            if (!this.currentDrawItemController.isUnlocked()) {
                                this.handleWrongItem();
                                return;
                            }

                            if (Ply_SoundManager.Ins != null) Ply_SoundManager.Ins.playFx(FxType.Happy);

                            if (!this.currentDrawItemController.isCompleted) {
                                this.currentDrawItemController.isCompleted = true;
                                const progressMgr = (globalThis as any).ProgressTrackingManager?.Instance || (window as any).ProgressTrackingManager?.Instance;
                                if (progressMgr && typeof progressMgr.AddProgress === 'function') progressMgr.AddProgress();

                                // Không bắn Heart ở mỗi lần snap nữa: DrawItemManager đếm đủ
                                // `heartRewardEveryItems` item mới thưởng Heart + anim vui.
                                const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                                if (drawItemMgr && typeof drawItemMgr.NotifyDrawItemCompleted === 'function') {
                                    drawItemMgr.NotifyDrawItemCompleted(this.currentDrawItemController.snapTarget);
                                }
                            }

                            let mapChanged = false;
                            const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                            if (drawItemMgr && typeof drawItemMgr.CheckMapCompletion === 'function') {
                                mapChanged = drawItemMgr.CheckMapCompletion();
                            }

                            const handHintMgr = HandHintManager.Instance || (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
                            if (handHintMgr) {
                                if (mapChanged && typeof handHintMgr.ShowHintImmediately === 'function') {
                                    handHintMgr.ShowHintImmediately();
                                } else if (typeof handHintMgr.CheckAndAdvanceHint === 'function') {
                                    handHintMgr.CheckAndAdvanceHint();
                                }
                            }

                            const item = this.currentDrawItem;
                            const controller = this.currentDrawItemController;

                            Tween.stopAllByTarget(item.node);

                            tween(item.node)
                                .to(0.2, { worldPosition: controller.snapTarget.worldPosition }, { easing: 'backOut' })
                                .call(() => {
                                    controller.emitCompleteEvent();

                                    if (Ply_Pool.Ins != null) {
                                        Ply_Pool.Ins.spawn(PoolType.CorrectEffect, controller.snapTarget!.worldPosition);
                                    }

                                    if (controller.closedSpriteObj) controller.closedSpriteObj.active = true;
                                    if (controller.openSpriteObj) controller.openSpriteObj.active = false;

                                    item.node.active = false;

                                    const graphic = this.getDrawGraphic(item);
                                    if (graphic && graphic.enableScaleOnDrag) {
                                        const restoreScale = this.getRestoreLocalScale(item.node, graphic);
                                        if (restoreScale) item.node.setScale(restoreScale);
                                    }
                                })
                                .start();

                            for (let k = 0; k < this.hoveredTargets.length; k++) this.hoveredTargets[k].onBrushExit();
                            this.hoveredTargets = [];
                            this.currentDrawItem = null;
                            this.currentDrawItemController = null;

                            return;
                        }
                    }

                    if (this.currentDrawItemController.closedSpriteObj) this.currentDrawItemController.closedSpriteObj.active = true;
                    if (this.currentDrawItemController.openSpriteObj) this.currentDrawItemController.openSpriteObj.active = false;
                } else if (this.currentDrawItemController && this.currentDrawItemController.itemType === DrawItemType.DragAwayToFade) {
                    if (!this.currentDrawItemController.isCompleted) {
                        this.currentDrawItemController.isCompleted = true;
                        const progressMgr = (globalThis as any).ProgressTrackingManager?.Instance || (window as any).ProgressTrackingManager?.Instance;
                        if (progressMgr && typeof progressMgr.AddProgress === 'function') progressMgr.AddProgress();

                        let mapChanged = false;
                        const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                        if (drawItemMgr && typeof drawItemMgr.NotifyDrawItemCompleted === 'function') {
                            drawItemMgr.NotifyDrawItemCompleted(this.currentDrawItemController.node);
                        }
                        if (drawItemMgr && typeof drawItemMgr.CheckMapCompletion === 'function') {
                            mapChanged = drawItemMgr.CheckMapCompletion();
                        }

                        const handHintMgr = HandHintManager.Instance || (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
                        if (handHintMgr) {
                            if (mapChanged && typeof handHintMgr.ShowHintImmediately === 'function') {
                                handHintMgr.ShowHintImmediately();
                            } else if (typeof handHintMgr.CheckAndAdvanceHint === 'function') {
                                handHintMgr.CheckAndAdvanceHint();
                            }
                        }
                    }
                    this.currentDrawItemController.emitCompleteEvent();

                    const colliders = this.currentDrawItem.getComponentsInChildren(Collider2D);
                    for (const col of colliders) col.enabled = false;

                    const dropDuration = this.dragAwayDropDuration;
                    const targetY = this.currentDrawItem.node.position.y - this.dragAwayDropYOffset;
                    tween(this.currentDrawItem.node)
                        .to(dropDuration, { position: new Vec3(this.currentDrawItem.node.position.x, targetY, this.currentDrawItem.node.position.z) }, { easing: 'quadIn' })
                        .start();

                    const sprites = this.currentDrawItem.getComponentsInChildren(Sprite);
                    for (const s of sprites) {
                        let opacity = s.getComponent(UIOpacity);
                        if (!opacity) opacity = s.addComponent(UIOpacity);
                        tween(opacity)
                            .to(dropDuration, { opacity: 0 })
                            .start();
                    }

                    const itemToHide = this.currentDrawItem.node;
                    this.scheduleOnce(() => {
                        if (itemToHide) itemToHide.active = false;

                        for (const col of colliders) {
                            if (col) col.enabled = true;
                        }

                        const drawItemMovement = itemToHide.getComponent(DrawItemMovement);
                        if (drawItemMovement) {
                            drawItemMovement.GoToSpawn();
                            drawItemMovement.UpdateSpawnPos();

                            for (const s of sprites) {
                                if (s) {
                                    let opacity = s.getComponent(UIOpacity);
                                    if (opacity) opacity.opacity = 255;
                                }
                            }
                        }
                    }, dropDuration + 0.01);

                    for (let k = 0; k < this.hoveredTargets.length; k++) this.hoveredTargets[k].onBrushExit();
                    this.hoveredTargets = [];
                    this.currentDrawItem = null;
                    this.currentDrawItemController = null;
                    this.isDropping = false;

                    return;
                }

                if (this.currentDrawItemController.closedSpriteObj) {
                    this.currentDrawItemController.closedSpriteObj.active = true;
                    const closedSprites = this.currentDrawItemController.closedSpriteObj.getComponentsInChildren(Sprite);
                    for (let i = 0; i < closedSprites.length; i++) {
                        closedSprites[i].enabled = true;
                        let opacity = closedSprites[i].getComponent(UIOpacity) || closedSprites[i].node.getComponent(UIOpacity);
                        if (opacity) opacity.opacity = 255;
                    }
                }
                if (this.currentDrawItemController.openSpriteObj) {
                    this.currentDrawItemController.openSpriteObj.active = false;
                }

                Tween.stopAllByTarget(this.currentDrawItem.node);

                const drawGraphic = this.getDrawGraphic(this.currentDrawItem);
                if (drawGraphic) this.tweenRestoreTransform(this.currentDrawItem.node, drawGraphic);

                const itemNode = this.currentDrawItem.node;
                const spawnWorldPos = this.currentDrawItem.SpawnPos.clone();
                tween(this.currentDrawItem.node)
                    .to(0.2, { worldPosition: spawnWorldPos })
                    .call(() => {
                        this.modifySortingOrder(itemNode, -10);
                        this.forceSyncItemPhysics(itemNode);
                    })
                    .start();

                for (let k = 0; k < this.hoveredTargets.length; k++) {
                    this.hoveredTargets[k].onBrushExit();
                }
                this.hoveredTargets = [];

                this.currentDrawItem = null;
                this.currentDrawItemController = null;
            } finally {
                this.isDropping = false;
            }
        }

        const handHintMgr = HandHintManager.Instance || (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.ShowHintWithDelay === 'function') {
            handHintMgr.ShowHintWithDelay();
        }
    }

    private handleWrongItem(): void {
        if (!this.currentDrawItem || !this.currentDrawItemController) return;

        const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
        if (Ply_Pool.Ins != null && drawItemMgr) {
            const spawnParent = typeof drawItemMgr.GetHeartSpawnPosForCurrentMap === 'function' ? drawItemMgr.GetHeartSpawnPosForCurrentMap() : null;
            const spawnPos = spawnParent ? spawnParent.worldPosition : this.currentDrawItem.node.worldPosition;
            const heartUnit = Ply_Pool.Ins.spawn(PoolType.BreakHeart, spawnPos);
            if (heartUnit) {
                // Gắn vào spawnParent để hiển thị đúng trên UI layer
                if (spawnParent) {
                    heartUnit.node.setParent(spawnParent, true);
                }
                const prefab = Ply_Pool.Ins.getPrefab ? Ply_Pool.Ins.getPrefab(PoolType.BreakHeart) : null;
                if (prefab && prefab.data) {
                    heartUnit.node.setScale(prefab.data.scale);
                }
            }
        }

        if (CharacterManager.instance != null) {
            CharacterManager.instance.playAngryAnim();
        }

        if (Ply_SoundManager.Ins != null) {
            Ply_SoundManager.Ins.playFx(FxType.Wrong);
            if (this.currentDrawItemController.playLoopFxOnDrag) {
                Ply_SoundManager.Ins.stopFx(this.currentDrawItemController.loopFxToPlay);
            }
            this.isCurrentlyPlayingDragSound = false;
        }

        const colliders = this.currentDrawItem.getComponentsInChildren(Collider2D);
        for (const col of colliders) col.enabled = false;

        if (this.progressContainer) this.progressContainer.active = false;
        if (this.currentDrawItemController.drawFaceEffect) {
            this.currentDrawItemController.drawFaceEffect.active = false;
        }

        const spineBoneMgr = (globalThis as any).SpineBoneManager?.Instance || (window as any).SpineBoneManager?.Instance;
        if (spineBoneMgr) {
            for (let k = 0; k < this.currentDrawItemController.openBonesOnGrab.length; k++) {
                if (typeof spineBoneMgr.CloseBone === 'function') spineBoneMgr.CloseBone(this.currentDrawItemController.openBonesOnGrab[k]);
            }
            for (let k = 0; k < this.currentDrawItemController.closeBonesOnGrab.length; k++) {
                if (typeof spineBoneMgr.OpenBone === 'function') spineBoneMgr.OpenBone(this.currentDrawItemController.closeBonesOnGrab[k]);
            }
        }

        if (this.currentDrawItemController.closedSpriteObj) this.currentDrawItemController.closedSpriteObj.active = true;
        if (this.currentDrawItemController.openSpriteObj) this.currentDrawItemController.openSpriteObj.active = false;

        this.currentDrawItemController.emitDropEvent();

        for (let k = 0; k < this.hoveredTargets.length; k++) this.hoveredTargets[k].onBrushExit();
        this.hoveredTargets = [];

        Tween.stopAllByTarget(this.currentDrawItem.node);
        const drawGraphic = this.getDrawGraphic(this.currentDrawItem);
        if (drawGraphic) this.tweenRestoreTransform(this.currentDrawItem.node, drawGraphic);

        const itemNode = this.currentDrawItem.node;
        const spawnWorldPos = this.currentDrawItem.SpawnPos.clone();
        tween(this.currentDrawItem.node)
            .to(0.2, { worldPosition: spawnWorldPos })
            .call(() => {
                for (const col of colliders) {
                    if (col) col.enabled = true;
                }
                this.modifySortingOrder(itemNode, -10);
                this.forceSyncItemPhysics(itemNode);
            })
            .start();

        this.currentDrawItem = null;
        this.currentDrawItemController = null;
        this.isDropping = false;
    }

    private forceSyncItemPhysics(itemNode: Node): void {
        if (!itemNode) return;

        const physicsSync = itemNode.getComponent(PhysicsSyncAfterAnim) || itemNode.getComponentInChildren(PhysicsSyncAfterAnim);
        if (physicsSync) {
            physicsSync.forceSync();
            return;
        }

        const colliders = itemNode.getComponentsInChildren(Collider2D);
        const bodies = itemNode.getComponentsInChildren(RigidBody2D);
        const activeColliders: Collider2D[] = [];
        const activeBodies: RigidBody2D[] = [];

        for (const collider of colliders) {
            if (collider && collider.enabled) {
                activeColliders.push(collider);
                collider.enabled = false;
            }
        }
        for (const body of bodies) {
            if (body && body.enabled) {
                activeBodies.push(body);
                body.enabled = false;
            }
        }

        this.scheduleOnce(() => {
            for (const body of activeBodies) {
                if (body && body.isValid) {
                    body.enabled = true;
                }
            }
            for (const collider of activeColliders) {
                if (collider && collider.isValid) {
                    collider.enabled = true;
                }
            }
        }, 0);
    } 

    /** Tìm DrawItemGraphic trên chính node bị kéo, fallback xuống node con (Cocos getComponentInChildren không tính node hiện tại). */
    private getDrawGraphic(item: DrawItemMovement): DrawItemGraphic | null {
        return item.getComponent(DrawItemGraphic) || item.getComponentInChildren(DrawItemGraphic);
    }

    /** Tween xoay sang DragRotation + (nếu bật) phóng to item khi cầm lên. Gọi SAU khi đã reparent sang DragLayer/Canvas. */
    private tweenGrabTransform(node: Node, graphic: DrawItemGraphic): void {
        tween(node).to(0.2, { eulerAngles: graphic.DragRotation }).start();

        if (graphic.enableScaleOnDrag && graphic.dragScaleMultiplier > 0) {
            // Lấy scale gốc quy đổi theo parent hiện tại rồi nhân multiplier (dùng scale gốc để không sai số khi cầm lại lúc item đang bay về).
            const base = this.getRestoreLocalScale(node, graphic) || node.scale.clone();
            tween(node).to(graphic.dragScaleDuration, { scale: base.multiplyScalar(graphic.dragScaleMultiplier) }).start();
        }
    }

    /** Tween xoay về SpawnRotation + (nếu bật) thu nhỏ item về scale gốc khi thả tay. Node vẫn đang dưới DragLayer/Canvas nên phải quy đổi theo parent hiện tại. */
    private tweenRestoreTransform(node: Node, graphic: DrawItemGraphic): void {
        tween(node).to(0.2, { eulerAngles: graphic.SpawnRotation }).start();

        if (graphic.enableScaleOnDrag) {
            const target = this.getRestoreLocalScale(node, graphic);
            if (target) tween(node).to(graphic.dragScaleDuration, { scale: target }).start();
        }
    }

    private modifySortingOrder(root: Node, offset: number): void {
        const movement = root.getComponent(DrawItemMovement) || root.getComponentInChildren(DrawItemMovement);

        if (offset > 0) {
            // Khi cầm đồ vật lên: Đưa tạm sang Top Container (DragLayer hoặc Canvas) để luôn vẽ đè lên tất cả các Node khác
            if (movement) {
                if (!movement.originalParent && root.parent) {
                    movement.originalParent = root.parent;
                    movement.originalSiblingIndex = root.getSiblingIndex();
                    movement.originalLayer = root.layer;
                }
            }

            let topContainer: Node | null = this.dragContainer;
            if (!topContainer && this.node.scene) {
                topContainer = this.node.scene.getChildByName('Canvas');
                if (!topContainer) {
                    const canvasComp = this.node.scene.getComponentInChildren('cc.Canvas') as any;
                    if (canvasComp) topContainer = canvasComp.node;
                }
            }

            if (topContainer && root.parent !== topContainer) {
                // Lưu Layer gốc của từng node TRƯỚC khi ghi đè, để lúc thả trả lại đúng Camera cũ
                if (movement) movement.CaptureLayers();
                root.setParent(topContainer, true);
                // Đảm bảo Layer của đồ vật & các Node con (Added_Bangs) khớp với Layer của Canvas/Camera để Camera vẽ ra màn hình
                this.setNodeAndChildrenLayer(root, topContainer.layer);
            } else if (root.parent) {
                root.setSiblingIndex(root.parent.children.length - 1);
            }
        } else {
            // Khi thả tay & tween bay về spawn xong: Trả Node về cha ban đầu (originalParent), Layer gốc và SiblingIndex cũ
            if (movement) {
                if (movement.originalParent && root.parent !== movement.originalParent) {
                    root.setParent(movement.originalParent, true);
                    root.setPosition(movement.SpawnLocalPos);
                }
                // Trả lại Layer GỐC CỦA TỪNG NODE. Không được gán Layer của parent cho cả cây:
                // node con chứa Sprite thường ở UI_2D (UICam), còn parent có thể ở Layer của ParticleCam
                // (priority cao hơn -> vẽ sau) nên item sẽ đè lên mọi Node UI khác dù hierarchy đứng trước.
                if (movement.originalLayers.size > 0) {
                    movement.RestoreLayers();
                } else if (movement.originalLayer !== 0) {
                    root.layer = movement.originalLayer;
                }
                if (root.parent) {
                    root.setSiblingIndex(movement.originalSiblingIndex);
                }
            }
        }
    }

    /**
     * Trả về local scale để đưa item về đúng scale gốc (theo parent HIỆN TẠI của node).
     * Trả về null nếu chưa từng lưu được scale gốc, để tránh set scale = 0 làm item biến mất.
     */
    private getRestoreLocalScale(node: Node, graphic: DrawItemGraphic): Vec3 | null {
        const spawnWorldScale = graphic.SpawnWorldScale;
        if (spawnWorldScale.x === 0 && spawnWorldScale.y === 0 && spawnWorldScale.z === 0) {
            return null;
        }
        return this.getLocalScaleForWorldTarget(node, spawnWorldScale);
    }

    private getLocalScaleForWorldTarget(node: Node, targetWorldScale: Vec3): Vec3 {
        const parent = node.parent;
        if (!parent) return targetWorldScale.clone();

        const parentWorldScale = parent.worldScale;
        return new Vec3(
            parentWorldScale.x !== 0 ? targetWorldScale.x / parentWorldScale.x : targetWorldScale.x,
            parentWorldScale.y !== 0 ? targetWorldScale.y / parentWorldScale.y : targetWorldScale.y,
            parentWorldScale.z !== 0 ? targetWorldScale.z / parentWorldScale.z : targetWorldScale.z,
        );
    }

    private setNodeAndChildrenLayer(node: Node, layer: number): void {
        node.layer = layer;
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            this.setNodeAndChildrenLayer(children[i], layer);
        }
    }

    public turnOnMap1(): void {
        this.isClickFirst = true;
        this.isPlayingIntro = false;

        const progressMgr = (globalThis as any).ProgressTrackingManager?.Instance || (window as any).ProgressTrackingManager?.Instance;
        if (progressMgr && typeof progressMgr.StartChallenge === 'function') {
            progressMgr.StartChallenge();
        } else {
            AppLovinAnalytics.challengeStarted();
        }

        const gameMgr = (globalThis as any).GameManager?.instance || (window as any).GameManager?.instance;
        if (gameMgr && typeof gameMgr.TurnOnMap1 === 'function') {
            gameMgr.TurnOnMap1();
        }
    }

    public TurnOnMap1(): void {
        this.turnOnMap1();
    }

    public turnOnMap2(): void {
        this.isPlayingIntro = false;
        const gameMgr = (globalThis as any).GameManager?.instance || (window as any).GameManager?.instance;
        if (gameMgr && typeof gameMgr.SetListActive === 'function') {
            gameMgr.SetListActive(gameMgr.listObjectInMap2, true);
        }
        const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
        if (drawItemMgr) drawItemMgr.currentMapIndex = 1;

        const handHintMgr = (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.ShowHintImmediately === 'function') {
            handHintMgr.ShowHintImmediately();
        }
    }

    public TurnOnMap2(): void {
        this.turnOnMap2();
    }

    public turnOffIntro(): void {
        const gameMgr = (globalThis as any).GameManager?.instance || (window as any).GameManager?.instance;
        if (gameMgr && typeof gameMgr.SetListActive === 'function') {
            gameMgr.SetListActive(gameMgr.listObjectInIntro, false);
        }
    }

    public TurnOffIntro(): void {
        this.turnOffIntro();
    }

    public turnOnMap3(): void {
        const gameMgr = (globalThis as any).GameManager?.instance || (window as any).GameManager?.instance;
        if (gameMgr && typeof gameMgr.SetListActive === 'function') {
            gameMgr.SetListActive(gameMgr.listObjectInMap2, false);
            gameMgr.SetListActive(gameMgr.listObjectInMap3, true);
        }
        const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
        if (drawItemMgr) drawItemMgr.currentMapIndex = 2;

        const handHintMgr = (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.ShowHintWithDelay === 'function') {
            handHintMgr.ShowHintWithDelay();
        }
    }

    public TurnOnMap3(): void {
        this.turnOnMap3();
    }

    public turnOnMap4(): void {
        const gameMgr = (globalThis as any).GameManager?.instance || (window as any).GameManager?.instance;
        if (gameMgr && typeof gameMgr.SetListActive === 'function') {
            gameMgr.SetListActive(gameMgr.listObjectInMap3, false);
            gameMgr.SetListActive(gameMgr.listObjectInMap4, true);
        }
        const handHintMgr = (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.ShowHintImmediately === 'function') {
            handHintMgr.ShowHintImmediately();
        }
        this.enableGoToStoreOnClick();
    }

    public TurnOnMap4(): void {
        this.turnOnMap4();
    }

    public mouseDownPascal(): void {
        this.mouseDown();
    }

    public MouseDown(): void {
        this.mouseDown();
    }

    public MouseDrag(): void {
        this.mouseDrag();
    }

    public MouseUp(): void {
        this.mouseUp();
    }
}
