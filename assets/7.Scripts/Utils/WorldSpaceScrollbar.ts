import { _decorator, Component, Node, EventTouch, UITransform, math, CCFloat } from 'cc';
import { DrawInputManager } from '../Manager/DrawInputManager';

const { ccclass, property } = _decorator;

@ccclass('WorldSpaceScrollbar')
export class WorldSpaceScrollbar extends Component {
    @property({
        type: Node,
        tooltip: "Kéo object ScrollBar (Background) vào đây. Yêu cầu object phải có UITransform."
    })
    public scrollBarTransform: Node | null = null;
    
    @property({
        type: Node,
        tooltip: "Kéo object Handle (Nút kéo) vào đây. Yêu cầu object phải có UITransform."
    })
    public handleTransform: Node | null = null;

    @property({
        type: CCFloat,
        range: [0, 1],
        tooltip: "Giá trị cuộn từ 0 (trái cùng) đến 1 (phải cùng)"
    })
    public normalizedValue: number = 0;

    private isDragging: boolean = false;

    protected onLoad() {
        if (this.scrollBarTransform) {
            this.scrollBarTransform.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            this.scrollBarTransform.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            this.scrollBarTransform.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            this.scrollBarTransform.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        }
        
        if (this.handleTransform) {
            this.handleTransform.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
            this.handleTransform.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            this.handleTransform.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            this.handleTransform.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        }
    }

    protected onDestroy() {
        if (this.scrollBarTransform) {
            this.scrollBarTransform.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
            this.scrollBarTransform.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            this.scrollBarTransform.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            this.scrollBarTransform.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        }
        if (this.handleTransform) {
            this.handleTransform.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
            this.handleTransform.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
            this.handleTransform.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
            this.handleTransform.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
        }
    }

    private onTouchStart(event: EventTouch) {
        const inputMgr = DrawInputManager.Instance || (globalThis as any).DrawInputManager?.Instance || (window as any).DrawInputManager?.Instance;
        if (inputMgr && inputMgr.isGoToStoreOnClickEnabled) {
            this.isDragging = false;
            return;
        }

        if (inputMgr) {
            inputMgr.ignoreScrollInput = true;
        }

        const nativeEvent = event as any;
        if (typeof nativeEvent.stopPropagation === 'function') {
            nativeEvent.stopPropagation();
        }
        if (typeof nativeEvent.preventDefault === 'function') {
            nativeEvent.preventDefault();
        }

        this.isDragging = true;
        this.updateHandlePosition(event);
    }

    private onTouchMove(event: EventTouch) {
        if (this.isDragging) {
            this.updateHandlePosition(event);
        }
    }

    private onTouchEnd(event: EventTouch) {
        this.isDragging = false;
        const inputMgr = DrawInputManager.Instance || (globalThis as any).DrawInputManager?.Instance || (window as any).DrawInputManager?.Instance;
        if (inputMgr) {
            inputMgr.ignoreScrollInput = false;
        }
    }

    private updateHandlePosition(event: EventTouch) {
        if (!this.scrollBarTransform || !this.handleTransform) return;

        const bgUITransform = this.scrollBarTransform.getComponent(UITransform);
        const handleUITransform = this.handleTransform.getComponent(UITransform);
        
        if (!bgUITransform) return;

        // Chuyển vị trí touch từ Screen về Local Space của Background
        const touchUILocation = event.getUILocation();
        const localTouchPos = bgUITransform.convertToNodeSpaceAR(new math.Vec3(touchUILocation.x, touchUILocation.y, 0));

        // Tính giới hạn X của Background trong Local Space (anchor ở giữa)
        const bgSize = bgUITransform.contentSize;
        let minX = -bgSize.width * bgUITransform.anchorX;
        let maxX = bgSize.width * (1 - bgUITransform.anchorX);

        // Trừ hao kích thước Handle
        if (handleUITransform) {
            const handleSize = handleUITransform.contentSize;
            const handleScale = this.handleTransform.scale.x;
            const halfWidth = (handleSize.width * handleScale) / 2;
            minX += halfWidth;
            maxX -= halfWidth;
        }

        // Giới hạn X
        const clampedX = math.clamp(localTouchPos.x, minX, maxX);
        
        if (this.handleTransform.parent === this.scrollBarTransform) {
            this.handleTransform.setPosition(clampedX, this.handleTransform.position.y, this.handleTransform.position.z);
        } else {
            const worldPos = bgUITransform.convertToWorldSpaceAR(new math.Vec3(clampedX, 0, 0));
            const parentUI = this.handleTransform.parent?.getComponent(UITransform);
            if (parentUI) {
                const finalPos = parentUI.convertToNodeSpaceAR(worldPos);
                this.handleTransform.setPosition(finalPos.x, this.handleTransform.position.y, this.handleTransform.position.z);
            }
        }

        this.normalizedValue = maxX > minX ? math.inverseLerp(minX, maxX, clampedX) : 0;
    }

    public ResetToStart() {
        this.normalizedValue = 0;
        this.applyNormalizedValueToHandle();
    }

    public SetNormalizedValue(value: number) {
        this.normalizedValue = math.clamp01(value);
        this.applyNormalizedValueToHandle();
    }

    private applyNormalizedValueToHandle() {
        if (!this.scrollBarTransform || !this.handleTransform) return;
        
        const bgUITransform = this.scrollBarTransform.getComponent(UITransform);
        const handleUITransform = this.handleTransform.getComponent(UITransform);
        
        if (!bgUITransform) return;

        const bgSize = bgUITransform.contentSize;
        let minX = -bgSize.width * bgUITransform.anchorX;
        let maxX = bgSize.width * (1 - bgUITransform.anchorX);

        if (handleUITransform) {
            const handleSize = handleUITransform.contentSize;
            const handleScale = this.handleTransform.scale.x;
            const halfWidth = (handleSize.width * handleScale) / 2;
            minX += halfWidth;
            maxX -= halfWidth;
        }

        const clampedX = math.lerp(minX, maxX, this.normalizedValue);

        if (this.handleTransform.parent === this.scrollBarTransform) {
            this.handleTransform.setPosition(clampedX, this.handleTransform.position.y, this.handleTransform.position.z);
        } else {
            const worldPos = bgUITransform.convertToWorldSpaceAR(new math.Vec3(clampedX, 0, 0));
            const parentUI = this.handleTransform.parent?.getComponent(UITransform);
            if (parentUI) {
                const finalPos = parentUI.convertToNodeSpaceAR(worldPos);
                this.handleTransform.setPosition(finalPos.x, this.handleTransform.position.y, this.handleTransform.position.z);
            }
        }
    }
}
