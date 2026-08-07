import { _decorator, Component, Node, Camera, Vec3, Vec2, Sprite, Animation, CCFloat, CCBoolean, EventTouch, Input, input, tween, Tween, UIOpacity, UITransform, geometry, PhysicsSystem, PhysicsSystem2D, Collider, Collider2D, Layers } from 'cc';
import { AppLovinAnalytics } from '../Tool/AppLovinAnalytics';
import { FxType, Ply_SoundManager } from '../ScriptTemplate/Ply_SoundManager';
import { CharacterManager } from './CharacterManager';
import { Ply_Pool, PoolType } from '../ScriptTemplate/Ply_Pool';
import { DrawItemController, DrawItemType } from '../DrawItem/DrawItemController';
import { DrawItemMovement } from '../DrawItem/DrawItemMovement';
import { DrawItemGraphic } from '../DrawItem/DrawItemGraphic';
import { DipTarget } from '../DrawItem/DipTarget';
import { MakeupTarget } from '../DrawItem/MakeupTarget';

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

    // ==========================================
    // 2. Effects & UI
    // ==========================================
    @property({
        type: Node,
        group: { name: '2. Effects & UI', id: 'effectsUI' },
        displayName: 'Drag Trail Effect',
        tooltip: 'Kéo Node chứa Trail Renderer hoặc Particle System vào đây. Nó sẽ đi theo con trỏ khi bạn đang cầm đồ vật.'
    })
    public dragTrailEffect: Node | null = null;

    @property({
        type: Node,
        group: { name: '2. Effects & UI', id: 'effectsUI' },
        displayName: 'Drag Layer Container',
        tooltip: 'Node Layer nằm ở vị trí trên cùng trong Canvas để chứa item khi đang kéo. Nếu để trống sẽ tự động dùng Canvas.'
    })
    public dragLayer: Node | null = null;

    @property({
        type: Node,
        group: { name: '2. Effects & UI', id: 'effectsUI' },
        displayName: 'Progress Container',
        tooltip: 'Container chứa vòng Fill UI, sẽ được bật lên khi cầm cọ vẽ'
    })
    public progressContainer: Node | null = null;

    @property({
        type: Sprite,
        group: { name: '2. Effects & UI', id: 'effectsUI' },
        displayName: 'Progress Fill Image (Sprite)',
        tooltip: 'Sprite type Filled để chạy fill progress'
    })
    public progressFillImage: Sprite | null = null;

    // ==========================================
    // 3. Intro Settings
    // ==========================================
    @property({
        group: { name: '3. Intro Settings', id: 'introSettings' },
        displayName: 'Is Click First',
        tooltip: 'Biến này dùng để kiểm tra xem người chơi đã click lần đầu tiên chưa'
    })
    public isClickFirst: boolean = false;

    @property({
        type: Node,
        group: { name: '3. Intro Settings', id: 'introSettings' },
        displayName: 'Intro Animator / Node',
        tooltip: 'Node chứa Animation component cho Intro'
    })
    public introAnimator: Node | null = null;

    private isPlayingIntro: boolean = false;

    // ==========================================
    // 4. Fake Store Settings
    // ==========================================
    @property({
        group: { name: '4. Fake Store Settings', id: 'storeSettings' },
        displayName: 'Is Go To Store On Click Enabled',
        tooltip: 'Nếu bật, bất kỳ click nào cũng sẽ dẫn ra Store.'
    })
    public isGoToStoreOnClickEnabled: boolean = false;

    public enableGoToStoreOnClick(): void {
        this.isGoToStoreOnClickEnabled = true;
    }

    public EnableGoToStoreOnClick(): void {
        this.enableGoToStoreOnClick();
    }

    @property({ type: Camera, displayName: 'Main Camera' })
    public cam: Camera | null = null;

    public currentDrawItem: DrawItemMovement | null = null;
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

    private onTouchStart(event: EventTouch): void {
        if (this.isPlayingIntro) return;

        if (this.isGoToStoreOnClickEnabled) {
            AppLovinAnalytics.ctaClicked();

            const gameMgr = (globalThis as any).GameManager?.instance || (window as any).GameManager?.instance;
            if (gameMgr && typeof gameMgr.GotoStore === 'function') {
                gameMgr.GotoStore();
            }
            return;
        }

        if (!this.isClickFirst) {
            this.isClickFirst = true;
            if (Ply_SoundManager.Ins != null) Ply_SoundManager.Ins.playBGM1();

            if (this.introAnimator) {
                this.isPlayingIntro = true;
                const anim = this.introAnimator.getComponent(Animation);
                if (anim) {
                    anim.play('PlayIntro');
                }
                this.scheduleOnce(() => {
                    this.turnOnMap1();
                }, 0.5);
                return;
            } else {
                const gameMgr = (globalThis as any).GameManager?.instance || (window as any).GameManager?.instance;
                if (gameMgr && typeof gameMgr.TurnOnMap1 === 'function') {
                    gameMgr.TurnOnMap1();
                }
            }
        }

        this.mouseDown(event);
    }

    private onTouchMove(event: EventTouch): void {
        if (this.isPlayingIntro) return;
        this.mouseDrag(event);
    }

    private onTouchEnd(event: EventTouch): void {
        if (this.isPlayingIntro) return;
        this.mouseUp();
    }

    private onTouchCancel(event: EventTouch): void {
        if (this.isPlayingIntro) return;
        this.mouseUp();
    }

    private getTouchWorldPos(event: EventTouch): Vec3 {
        const uiWorldPos = (event as any).getUIWorldPosition ? (event as any).getUIWorldPosition() : event.getUILocation();
        return new Vec3(uiWorldPos.x, uiWorldPos.y, 0);
    }

    private raycastNodes<T extends Component>(event: EventTouch, type: { new(): T }): T[] {
        const uiWorldPos = (event as any).getUIWorldPosition ? (event as any).getUIWorldPosition() : event.getUILocation();
        const touchVec2 = new Vec2(uiWorldPos.x, uiWorldPos.y);
        const results: T[] = [];

        // Chỉ dùng PhysicsSystem2D kiểm tra va chạm bằng 2D Collider (BoxCollider2D, PolygonCollider2D...)
        if (PhysicsSystem2D.instance) {
            const colliders2D = PhysicsSystem2D.instance.testPoint(touchVec2);
            for (let i = 0; i < colliders2D.length; i++) {
                const comp = colliders2D[i].node.getComponent(type) || colliders2D[i].getComponent(type);
                if (comp && results.indexOf(comp) === -1) {
                    results.push(comp);
                }
            }
        }

        return results;
    }

    public mouseDown(event?: EventTouch): void {
        const handHintMgr = (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
        if (handHintMgr && typeof handHintMgr.HideHintTemporarily === 'function') {
            handHintMgr.HideHintTemporarily();
        }

        if (!event) return;

        const controllers = this.raycastNodes(event, DrawItemController);
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
                    const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
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

                if (this.dragTrailEffect) {
                    this.dragTrailEffect.active = true;
                    this.dragTrailEffect.setWorldPosition(touchWorldPos);
                }

                if (this.currentDrawItemController.itemType === DrawItemType.DirectDraw || this.currentDrawItemController.itemType === DrawItemType.DipAndDraw) {
                    if (this.progressContainer) {
                        this.progressContainer.active = true;
                        const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                        if (drawItemMgr && typeof drawItemMgr.GetProgressUIPosForCurrentMap === 'function') {
                            const customPos = drawItemMgr.GetProgressUIPosForCurrentMap();
                            if (customPos) {
                                this.progressContainer.setWorldPosition(customPos.worldPosition || customPos.position);
                            }
                        }
                    }

                    if (this.progressFillImage) {
                        const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
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

        if (this.dragTrailEffect) {
            this.dragTrailEffect.setWorldPosition(touchWorldPos);
        }

        if (this.currentDrawItemController && this.currentDrawItemController.tipPoint) {
            if (this.progressContainer && this.progressContainer.active && this.progressFillImage) {
                if (this.currentDrawItemController.isCompleted) {
                    this.progressContainer.active = false;
                } else {
                    const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
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

                    if (dist < 100 && canDip) {
                        this.currentDrawItemController.hasDipped = true;
                        this.currentDrawItemController.emitCompleteEvent();
                    }
                }
            }

            const canDraw = this.currentDrawItemController.itemType === DrawItemType.DirectDraw ||
                (this.currentDrawItemController.itemType === DrawItemType.DipAndDraw && this.currentDrawItemController.hasDipped);

            let isHittingValidTarget = false;

            if (canDraw) {
                const targets = this.raycastNodes(event, MakeupTarget);
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

                        const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                        const mapIndexBeforeApply = drawItemMgr ? drawItemMgr.currentMapIndex : 0;
                        this.currentFrameTargets.push(target);

                        const beforeDraws = target.CurrentDrawTimes;
                        const wasApplied = target.isApplied;
                        target.applyMakeup(0.016, touchWorldPos);
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

                if (isHittingValidTarget && this.currentDrawItemController && !this.currentDrawItemController.isCompleted && this.currentDrawItemController.enableAutoComplete && (globalThis as any).DrawItemManager?.Instance) {
                    const drawItemMgr = (globalThis as any).DrawItemManager.Instance;
                    const progress = typeof drawItemMgr.GetMakeupProgressInCurrentMap === 'function' ? drawItemMgr.GetMakeupProgressInCurrentMap(this.currentDrawItemController.makeupID) : 0;

                    if (progress >= this.currentDrawItemController.autoCompleteThreshold) {
                        const mapConfig = drawItemMgr.mapConfigs ? drawItemMgr.mapConfigs[drawItemMgr.currentMapIndex] : null;
                        if (mapConfig && mapConfig.targetsInMap) {
                            for (const t of mapConfig.targetsInMap) {
                                if (t && t.requiredMakeupID === this.currentDrawItemController.makeupID && !t.isApplied) {
                                    t.forceComplete();
                                }
                            }
                        }

                        if (!this.currentDrawItemController.isCompleted) {
                            if (typeof drawItemMgr.IsMakeupIDCompletedInCurrentMap === 'function' && drawItemMgr.IsMakeupIDCompletedInCurrentMap(this.currentDrawItemController.makeupID)) {
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
                if (this.dragTrailEffect) {
                    this.dragTrailEffect.active = false;
                }

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
                        if (dist <= this.currentDrawItemController.snapRadius * 50) { // scale radius cho 2D pixels
                            if (!this.currentDrawItemController.isUnlocked()) {
                                this.handleWrongItem();
                                return;
                            }

                            if (Ply_SoundManager.Ins != null) Ply_SoundManager.Ins.playFx(FxType.Happy);
                            if (CharacterManager.instance != null) CharacterManager.instance.playHappyAnim();

                            if (!this.currentDrawItemController.isCompleted) {
                                this.currentDrawItemController.isCompleted = true;
                                const progressMgr = (globalThis as any).ProgressTrackingManager?.Instance || (window as any).ProgressTrackingManager?.Instance;
                                if (progressMgr && typeof progressMgr.AddProgress === 'function') progressMgr.AddProgress();

                                const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                                if (drawItemMgr) {
                                    const mapSpawnPos = typeof drawItemMgr.GetHeartSpawnPosForCurrentMap === 'function' ? drawItemMgr.GetHeartSpawnPosForCurrentMap() : null;
                                    if (mapSpawnPos && typeof drawItemMgr.SpawnHeartAt === 'function') {
                                        drawItemMgr.SpawnHeartAt(mapSpawnPos);
                                    } else if (this.currentDrawItemController.snapTarget && typeof drawItemMgr.SpawnHeartAt === 'function') {
                                        drawItemMgr.SpawnHeartAt(this.currentDrawItemController.snapTarget);
                                    }
                                }
                            }

                            let mapChanged = false;
                            const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                            if (drawItemMgr && typeof drawItemMgr.CheckMapCompletion === 'function') {
                                mapChanged = drawItemMgr.CheckMapCompletion();
                            }

                            const handHintMgr = (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
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
                        const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                        if (drawItemMgr && typeof drawItemMgr.CheckMapCompletion === 'function') {
                            mapChanged = drawItemMgr.CheckMapCompletion();
                        }

                        const handHintMgr = (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
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

                    const dropDuration = 0.5;
                    const targetY = this.currentDrawItem.node.position.y - 200;
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

        const handHintMgr = (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
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
            if (heartUnit && spawnParent) {
                const prefab = Ply_Pool.Ins.getPrefab ? Ply_Pool.Ins.getPrefab(PoolType.BreakHeart) : null;
                if (prefab) {
                    heartUnit.node.setScale(prefab.data ? prefab.data.scale : heartUnit.node.scale);
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

        if (this.dragTrailEffect) this.dragTrailEffect.active = false;
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
            })
            .start();

        this.currentDrawItem = null;
        this.currentDrawItemController = null;
        this.isDropping = false;
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

            let topContainer = this.dragLayer;
            if (!topContainer && this.node.scene) {
                topContainer = this.node.scene.getChildByName('Canvas');
            }

            if (topContainer && root.parent !== topContainer) {
                root.setParent(topContainer, true);
                // Đảm bảo Layer của đồ vật & các Node con (Added_Bangs) khớp với Layer của Canvas/Camera để Camera vẽ ra màn hình
                this.setNodeAndChildrenLayer(root, topContainer.layer);
            } else if (root.parent) {
                root.setSiblingIndex(root.parent.children.length - 1);
            }
        } else {
            // Khi thả tay & tween bay về spawn xong: Trả Node về cha ban đầu (originalParent), đồng bộ Layer của Parent và SiblingIndex cũ
            if (movement) {
                if (movement.originalParent && root.parent !== movement.originalParent) {
                    root.setParent(movement.originalParent, true);
                    root.setPosition(movement.SpawnLocalPos);
                    this.setNodeAndChildrenLayer(root, movement.originalParent.layer);
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
        this.isPlayingIntro = false;
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
        if (handHintMgr && typeof handHintMgr.ShowHintImmediately === 'function') {
            handHintMgr.ShowHintImmediately();
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
