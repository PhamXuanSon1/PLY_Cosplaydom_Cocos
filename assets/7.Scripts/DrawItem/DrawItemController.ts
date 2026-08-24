import { _decorator, Component, Node, Enum, CCString, CCBoolean, CCFloat, EventHandler, Graphics, Color, UITransform } from 'cc';
import { EDITOR } from 'cc/env';
import { FxType, Ply_SoundManager } from '../ScriptTemplate/Ply_SoundManager';

const { ccclass, property, executeInEditMode } = _decorator;

export enum DrawItemType {
    ClickOnly = 0,
    DirectDraw = 1,
    DipAndDraw = 2,
    SnapToTarget = 3,
    DragAwayToFade = 4,
}
Enum(DrawItemType);

@ccclass('DrawItemController')
@executeInEditMode
export class DrawItemController extends Component {

    @property({
        type: Enum(DrawItemType),
        group: { name: '1. Basic Info', id: 'basicInfo' },
        displayName: 'Item Type',
        tooltip: "ClickOnly: Chỉ cần click 1 cái.\nDirectDraw: Cầm lên vẽ trực tiếp.\nDipAndDraw: Phải chấm vào phấn trước rồi mới vẽ được.\nSnapToTarget: Kéo thả vào 1 vị trí cố định.\nDragAwayToFade: Kéo ra xa vị trí ban đầu 1f thì mờ đi và biến mất."
    })
    public itemType: DrawItemType = DrawItemType.ClickOnly;

    @property({
        type: [Component],
        group: { name: '1. Basic Info', id: 'basicInfo' },
        displayName: 'Unlock Requirements',
        tooltip: "Danh sách các vật phẩm CẦN PHẢI hoàn thành trước khi mở khoá vật phẩm này (dành cho trường hợp cần nhiều hơn 1 điều kiện)."
    })
    public requireItemsToUnlock: DrawItemController[] = [];

    public isUnlocked(): boolean {
        if (this.requireItemsToUnlock && this.requireItemsToUnlock.length > 0) {
            for (let i = 0; i < this.requireItemsToUnlock.length; i++) {
                const reqObj = this.requireItemsToUnlock[i] as any;
                if (reqObj != null) {
                    let reqItem: DrawItemController | null = null;
                    if (reqObj.isCompleted !== undefined) {
                        reqItem = reqObj; // Đã là DrawItemController
                    } else if (reqObj.node) {
                        reqItem = reqObj.node.getComponent(DrawItemController); // Lấy từ Node
                    } else if (reqObj.getComponent) {
                        reqItem = reqObj.getComponent(DrawItemController);
                    }

                    if (reqItem != null) {
                        // console.log(`[Debug Unlock] Check Item [${this.node.name}] -> Require: [${reqItem.node.name}], isCompleted: ${reqItem.isCompleted}`);
                        if (!reqItem.isCompleted) {
                            // console.log(`[Debug Unlock] => Item [${this.node.name}] BỊ KHÓA vì [${reqItem.node.name}] chưa hoàn thành!`);
                            return false;
                        }
                    } else {
                        console.warn(`[Debug Unlock] Yêu cầu ở vị trí ${i} của ${this.node.name} KHÔNG hợp lệ (Không tìm thấy DrawItemController).`);
                    }
                }
            }
            // console.log(`[Debug Unlock] => Item [${this.node.name}] ĐÃ ĐƯỢC MỞ KHÓA (đủ điều kiện)!`);
        }
        return true;
    }

    public IsUnlocked(): boolean {
        return this.isUnlocked();
    }

    @property({
        group: { name: '1. Basic Info', id: 'basicInfo' },
        displayName: 'Makeup ID',
        tooltip: "ID dùng để đối chiếu với Makeup Target. Chỉ khi DrawItem và Target có cùng ID thì mới vẽ/tương tác được."
    })
    public makeupID: string = '';

    @property({
        type: CCFloat,
        group: { name: '1. Basic Info', id: 'basicInfo' },
        displayName: 'Tip Radius',
        tooltip: "Bán kính quét quanh điểm đầu cọ để phát hiện mục tiêu."
    })
    public tipRadius: number = 0.5;

    @property({
        type: Node,
        group: { name: '2. Interaction Setup', id: 'interactionSetup' },
        displayName: 'Tip Point',
        tooltip: "Kéo 1 Node rỗng (đặt ở đầu cọ) vào đây. Tia quét (Raycast) sẽ bắn từ vị trí này để nhận diện mặt."
    })
    public tipPoint: Node | null = null;

    @property({
        group: { name: '2. Interaction Setup', id: 'interactionSetup' },
        displayName: 'Show Tip Point',
        tooltip: "Bật ô này để hiển thị 1 điểm đỏ (Red Dot) tại vị trí Tip Point để dễ dàng căn chỉnh trên Editor hoặc trong Game."
    })
    public showTipPoint: boolean = false;

    @property({
        type: CCFloat,
        group: { name: '2. Interaction Setup', id: 'interactionSetup' },
        displayName: 'Tip Point Dot Size',
        tooltip: "Kích thước bán kính của điểm đỏ (pixel) hiển thị cho Tip Point.",
        visible(this: any) {
            return this.showTipPoint;
        }
    })
    public tipPointDebugSize: number = 8;

    @property({
        type: Node,
        group: { name: '2. Interaction Setup', id: 'interactionSetup' },
        displayName: 'Dip Target',
        tooltip: "Kéo Node/Collider của hộp phấn vào đây. Cọ phải quẹt trúng hộp phấn này thì hasDipped mới thành true."
    })
    public dipTarget: Node | null = null;

    @property({
        group: { name: '2. Interaction Setup', id: 'interactionSetup' },
        displayName: 'Has Dipped',
        tooltip: "Xác định xem cọ đã có phấn chưa. Sẽ tự động reset về false khi bắt đầu game."
    })
    public hasDipped: boolean = false;

    @property({
        type: Node,
        group: { name: '2. Interaction Setup', id: 'interactionSetup' },
        displayName: 'Snap Target',
        tooltip: "Vị trí đích (Node) mà đồ vật này cần được thả vào. Dùng cho loại SnapToTarget."
    })
    public snapTarget: Node | null = null;

    @property({
        type: CCFloat,
        group: { name: '2. Interaction Setup', id: 'interactionSetup' },
        displayName: 'Snap Radius',
        tooltip: "Khoảng cách bắt dính (hút). Nếu thả đồ vật cách đích nhỏ hơn bán kính này, nó sẽ tự dính vào và tính là hoàn thành."
    })
    public snapRadius: number = 1.0;

    @property({
        group: { name: '2. Interaction Setup', id: 'interactionSetup' },
        displayName: 'Show Snap Radius',
        tooltip: "Bật ô này để hiển thị vòng tròn bán kính Snap Radius quanh Snap Target để dễ dàng căn chỉnh trên Editor hoặc trong Game."
    })
    public showSnapRadius: boolean = false;

    @property({
        type: Node,
        group: { name: '3. Visual & Bones', id: 'visualBones' },
        displayName: 'Closed Sprite',
        tooltip: "Sprite/Node hiển thị khi chưa cầm (hoặc thả trượt)"
    })
    public closedSpriteObj: Node | null = null;

    @property({
        type: Node,
        group: { name: '3. Visual & Bones', id: 'visualBones' },
        displayName: 'Open Sprite',
        tooltip: "Sprite/Node hiển thị khi đang cầm (đang kéo)"
    })
    public openSpriteObj: Node | null = null;

    @property({
        type: [CCString],
        group: { name: '3. Visual & Bones', id: 'visualBones' },
        displayName: 'Open Bones On Grab',
        tooltip: "Gõ ID của các Bone muốn MỞ khi cầm item này (VD: Mieng)"
    })
    public openBonesOnGrab: string[] = [];

    @property({
        type: [CCString],
        group: { name: '3. Visual & Bones', id: 'visualBones' },
        displayName: 'Close Bones On Grab',
        tooltip: "Gõ ID của các Bone muốn ĐÓNG khi cầm item này (VD: MatTrai, MatPhai)"
    })
    public closeBonesOnGrab: string[] = [];

    @property({
        type: Node,
        group: { name: '3. Visual & Bones', id: 'visualBones' },
        displayName: 'Draw Effect',
        tooltip: "Kéo Particle System / Node (VD: Bụi phấn, ngôi sao) vào đây. Nó sẽ tự động bật khi bạn quẹt trúng điểm Makeup, và tắt khi quẹt trượt."
    })
    public drawFaceEffect: Node | null = null;

    @property({
        group: { name: '4. Audio & Events', id: 'audioEvents' },
        displayName: 'Play Loop FX On Drag',
        tooltip: "Bật cái này nếu muốn phát âm thanh lặp lại liên tục trong suốt quá trình cầm/kéo đồ vật này."
    })
    public playLoopFxOnDrag: boolean = false;

    // Trạng thái đang được kéo
    public isBeingDragged: boolean = false;

    @property({
        type: Enum(FxType),
        group: { name: '4. Audio & Events', id: 'audioEvents' },
        displayName: 'Loop FX Type',
        tooltip: "Loại âm thanh loop sẽ phát khi kéo."
    })
    public loopFxToPlay: FxType = FxType.Brush;

    @property({
        group: { name: '4. Audio & Events', id: 'audioEvents' },
        displayName: 'Play One-Shot When Drawing',
        tooltip: "BẬT: Mỗi khi mục tiêu tăng thêm 1 tiến độ, sẽ phát âm thanh 1 LẦN DUY NHẤT (One-shot) (Dùng cho quẹt cọ, phấn).\nTẮT: Âm thanh Loop kêu liên tục từ lúc cầm lên đến lúc thả ra (Dùng cho máy sấy, máy xăm)."
    })
    public onlyPlayLoopFxWhenDrawing: boolean = true;

    @property({
        group: { name: '4. Audio & Events', id: 'audioEvents' },
        displayName: 'Play FX On Complete',
        tooltip: "Bật cái này nếu muốn phát 1 âm thanh một lần duy nhất khi đồ vật hoàn thành (Click xong, Kéo tới đích xong...)."
    })
    public playFxOnComplete: boolean = false;

    @property({
        type: Enum(FxType),
        group: { name: '4. Audio & Events', id: 'audioEvents' },
        displayName: 'Complete FX Type',
        tooltip: "Loại âm thanh phát khi hoàn thành."
    })
    public completeFxToPlay: FxType = FxType.Happy;

    @property({
        type: [EventHandler],
        group: { name: '4. Audio & Events', id: 'audioEvents' },
        displayName: 'On Grab Event',
        tooltip: "Chạy các lệnh trong này khi người chơi vừa click chuột CẦM đồ vật lên."
    })
    public OnGrabEvent: EventHandler[] = [];

    @property({
        type: [EventHandler],
        group: { name: '4. Audio & Events', id: 'audioEvents' },
        displayName: 'On Drop Event',
        tooltip: "Chạy các lệnh trong này khi người chơi nhả chuột THẢ đồ vật ra."
    })
    public OnDropEvent: EventHandler[] = [];

    @property({
        type: [EventHandler],
        group: { name: '4. Audio & Events', id: 'audioEvents' },
        displayName: 'On Tip Point Hit',
        tooltip: "Chạy liên tục khi đầu cọ/bình xịt (tipPoint) chạm vào vùng vẽ hợp lệ trên mặt/người."
    })
    public OnTipPointHitEvent: EventHandler[] = [];

    @property({
        type: [EventHandler],
        group: { name: '4. Audio & Events', id: 'audioEvents' },
        displayName: 'On Complete Event',
        tooltip: "Chạy khi vật phẩm hoàn thành mục tiêu (Click xong, Snap trúng đích, hoặc nhúng cọ xong)."
    })
    public OnCompleteEvent: EventHandler[] = [];

    @property({
        group: { name: '5. Completion', id: 'completionSettings' },
        displayName: 'Enable Auto Complete',
        tooltip: "Bật cái này nếu muốn tự động hoàn thành tất cả các mục tiêu còn lại khi đạt đến một mức % nhất định (Ví dụ 70%). Chỉ dành cho DirectDraw và DipAndDraw."
    })
    public enableAutoComplete: boolean = false;

    @property({
        type: CCFloat,
        group: { name: '5. Completion', id: 'completionSettings' },
        displayName: 'Auto Complete Threshold',
        range: [0, 1, 0.01],
        slide: true,
        tooltip: "Mức độ hoàn thành để tự động hoàn thành (Ví dụ: 0.7 = 70%)"
    })
    public autoCompleteThreshold: number = 0.7;

    private _isCompleted: boolean = false;

    public get isCompleted(): boolean {
        return this._isCompleted;
    }

    public set isCompleted(value: boolean) {
        if (this._isCompleted !== value) {
            // console.log(`[Debug Complete] Item [${this.node.name}] chuyển trạng thái isCompleted từ ${this._isCompleted} sang ${value}`);
        }
        
        // Chỉ phát âm thanh vào ĐÚNG KHOẢNH KHẮC nó chuyển từ false -> true
        if (!this._isCompleted && value) {
            if (this.playFxOnComplete && Ply_SoundManager.Ins != null) {
                Ply_SoundManager.Ins.playFx(this.completeFxToPlay);
            }
        }
        this._isCompleted = value;
    }

    private _lastDebugTipPointNode: Node | null = null;
    private _lastDebugSnapTargetNode: Node | null = null;

    protected onLoad(): void {
        if (!EDITOR) {
            // Reset lại trạng thái ban đầu để tránh bị lưu đè data trên Scene/Prefab (vì biến này từng là public)
            this.isCompleted = false;
            this.hasDipped = false;
        }
    }

    protected start(): void {
        if (this.showTipPoint) {
            this.updateTipPointDebug();
        }
        if (this.showSnapRadius) {
            this.updateSnapRadiusDebug();
        }
    }

    protected update(dt: number): void {
        if (this.showTipPoint) {
            this.updateTipPointDebug();
        } else {
            this.removeTipPointDebug();
        }

        if (this.showSnapRadius) {
            this.updateSnapRadiusDebug();
        } else {
            this.removeSnapRadiusDebug();
        }
    }

    protected onDisable(): void {
        this.removeTipPointDebug();
        this.removeSnapRadiusDebug();
    }

    protected onDestroy(): void {
        this.removeTipPointDebug();
        this.removeSnapRadiusDebug();
    }

    /**
     * Tự vẽ điểm đỏ hiển thị vị trí Tip Point
     */
    private updateTipPointDebug(): void {
        if (!this.tipPoint || !this.tipPoint.isValid) {
            if (this._lastDebugTipPointNode && this._lastDebugTipPointNode.isValid) {
                const old = this._lastDebugTipPointNode.getChildByName('__TipPointDebug__');
                if (old) old.destroy();
            }
            this._lastDebugTipPointNode = null;
            return;
        }

        if (this._lastDebugTipPointNode && this._lastDebugTipPointNode !== this.tipPoint && this._lastDebugTipPointNode.isValid) {
            const old = this._lastDebugTipPointNode.getChildByName('__TipPointDebug__');
            if (old) old.destroy();
        }
        this._lastDebugTipPointNode = this.tipPoint;

        let gNode = this.tipPoint.getChildByName('__TipPointDebug__');
        if (!gNode) {
            gNode = new Node('__TipPointDebug__');
            this.tipPoint.addChild(gNode);
            if (!gNode.getComponent(UITransform)) {
                gNode.addComponent(UITransform);
            }
            gNode.layer = this.tipPoint.layer;
        }

        let g = gNode.getComponent(Graphics);
        if (!g) {
            g = gNode.addComponent(Graphics);
        }

        g.clear();
        const dotRadius = this.tipPointDebugSize > 0 ? this.tipPointDebugSize : 8;

        // Vẽ điểm tròn đỏ
        g.fillColor = new Color(255, 0, 0, 240);
        g.strokeColor = new Color(255, 255, 255, 255);
        g.lineWidth = 2;
        g.circle(0, 0, dotRadius);
        g.fill();
        g.stroke();

        // Vẽ chữ thập tâm màu trắng để dễ căn góc/tâm
        g.strokeColor = new Color(255, 255, 255, 220);
        g.lineWidth = 1.5;
        g.moveTo(-dotRadius * 0.6, 0);
        g.lineTo(dotRadius * 0.6, 0);
        g.moveTo(0, -dotRadius * 0.6);
        g.lineTo(0, dotRadius * 0.6);
        g.stroke();
    }

    private removeTipPointDebug(): void {
        if (this.tipPoint && this.tipPoint.isValid) {
            const gNode = this.tipPoint.getChildByName('__TipPointDebug__');
            if (gNode) gNode.destroy();
        }
        if (this._lastDebugTipPointNode && this._lastDebugTipPointNode.isValid) {
            const gNode = this._lastDebugTipPointNode.getChildByName('__TipPointDebug__');
            if (gNode) gNode.destroy();
        }
        this._lastDebugTipPointNode = null;

        const allDebugs = this.node.getComponentsInChildren(Graphics);
        for (const g of allDebugs) {
            if (g.node && g.node.name === '__TipPointDebug__') {
                g.node.destroy();
            }
        }
    }

    /**
     * Tự vẽ vòng tròn bán kính Snap Radius quanh Snap Target
     */
    private updateSnapRadiusDebug(): void {
        if (!this.snapTarget || !this.snapTarget.isValid) {
            if (this._lastDebugSnapTargetNode && this._lastDebugSnapTargetNode.isValid) {
                const old = this._lastDebugSnapTargetNode.getChildByName('__SnapRadiusDebug__');
                if (old) old.destroy();
            }
            this._lastDebugSnapTargetNode = null;
            return;
        }

        if (this._lastDebugSnapTargetNode && this._lastDebugSnapTargetNode !== this.snapTarget && this._lastDebugSnapTargetNode.isValid) {
            const old = this._lastDebugSnapTargetNode.getChildByName('__SnapRadiusDebug__');
            if (old) old.destroy();
        }
        this._lastDebugSnapTargetNode = this.snapTarget;

        let gNode = this.snapTarget.getChildByName('__SnapRadiusDebug__');
        if (!gNode) {
            gNode = new Node('__SnapRadiusDebug__');
            this.snapTarget.addChild(gNode);
            if (!gNode.getComponent(UITransform)) {
                gNode.addComponent(UITransform);
            }
            gNode.layer = this.snapTarget.layer;
        }

        let g = gNode.getComponent(Graphics);
        if (!g) {
            g = gNode.addComponent(Graphics);
        }

        g.clear();
        // Bán kính snap thực tế: snapRadius * multiplier (mặc định 50)
        const multiplier = (globalThis as any).DrawInputManager?.Instance?.snapRadiusMultiplier ?? 50;
        const radius = Math.max(1, this.snapRadius * multiplier);

        // Vùng tròn bán kính snap
        g.fillColor = new Color(0, 200, 255, 40);
        g.strokeColor = new Color(0, 200, 255, 220);
        g.lineWidth = 2.5;
        g.circle(0, 0, radius);
        g.fill();
        g.stroke();

        // Tâm chữ thập
        g.strokeColor = new Color(0, 200, 255, 180);
        g.lineWidth = 1.5;
        const crossSize = Math.min(10, radius * 0.5);
        g.moveTo(-crossSize, 0);
        g.lineTo(crossSize, 0);
        g.moveTo(0, -crossSize);
        g.lineTo(0, crossSize);
        g.stroke();
    }

    private removeSnapRadiusDebug(): void {
        if (this.snapTarget && this.snapTarget.isValid) {
            const gNode = this.snapTarget.getChildByName('__SnapRadiusDebug__');
            if (gNode) gNode.destroy();
        }
        if (this._lastDebugSnapTargetNode && this._lastDebugSnapTargetNode.isValid) {
            const gNode = this._lastDebugSnapTargetNode.getChildByName('__SnapRadiusDebug__');
            if (gNode) gNode.destroy();
        }
        this._lastDebugSnapTargetNode = null;

        const allDebugs = this.node.getComponentsInChildren(Graphics);
        for (const g of allDebugs) {
            if (g.node && g.node.name === '__SnapRadiusDebug__') {
                g.node.destroy();
            }
        }
    }

    // Helper trigger các sự kiện
    public emitGrabEvent(): void {
        this.isBeingDragged = true;
        EventHandler.emitEvents(this.OnGrabEvent);
    }

    public emitDropEvent(): void {
        this.isBeingDragged = false;
        EventHandler.emitEvents(this.OnDropEvent);
    }

    public emitTipPointHitEvent(): void {
        EventHandler.emitEvents(this.OnTipPointHitEvent);
    }

    public emitCompleteEvent(): void {
        EventHandler.emitEvents(this.OnCompleteEvent);
    }
}



