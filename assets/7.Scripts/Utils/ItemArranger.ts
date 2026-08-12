import { _decorator, Component, Node, Camera, Label, view, math, CCFloat, CCBoolean, CCString, director, Collider2D, RigidBody2D } from 'cc';
import { WorldSpaceScrollbar } from './WorldSpaceScrollbar';
import { HandHintManager } from '../Manager/HandHintManager';
import { DrawItemController } from '../DrawItem/DrawItemController';
import { DrawItemMovement } from '../DrawItem/DrawItemMovement';
import { PhysicsSyncAfterAnim } from '../DrawItem/PhysicsSyncAfterAnim';

const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('ArrangedItem')
export class ArrangedItem {
    @property({ type: Node })
    public itemTransform: Node | null = null;
    
    @property({
        type: CCFloat,
        tooltip: "Khoảng cách từ item này tới item tiếp theo"
    })
    public spacingToNext: number = 200;
}

@ccclass('ItemArranger')
@executeInEditMode
export class ItemArranger extends Component {
    @property({
        type: [ArrangedItem],
        tooltip: "Danh sách các object cần được sắp xếp"
    })
    public itemsToArrange: ArrangedItem[] = [];

    @property({
        type: Node,
        tooltip: "Object làm mốc để lấy toạ độ Y. Bắt buộc phải có để các item đi theo Y của object này."
    })
    public referenceYObject: Node | null = null;

    @property({
        type: Camera,
        tooltip: "Camera dùng để tính toán giới hạn hiển thị (Nếu để trống sẽ dùng Camera đầu tiên tìm được)"
    })
    public camera: Camera | null = null;

    @property({
        type: CCFloat,
        tooltip: "Khoảng cách từ mép trái màn hình đến object đầu tiên (theo đơn vị world)"
    })
    public startOffsetX: number = 200;

    @property({
        tooltip: "Tự động sắp xếp lại khi màn hình hoặc Camera thay đổi"
    })
    public realignOnUpdate: boolean = true;

    @property({
        type: WorldSpaceScrollbar,
        group: { name: 'Scrollbar Setup (Tuỳ chọn)' },
        tooltip: "Kéo script WorldSpaceScrollbar vào đây để điều khiển cuộn"
    })
    public scrollbar: WorldSpaceScrollbar | null = null;

    @property({
        type: Label,
        group: { name: 'Chỉ số đếm Item (Tuỳ chọn)' },
        tooltip: "Kéo Label vào đây để hiển thị tỉ lệ hoàn thành (VD: 0/16)"
    })
    public counterText: Label | null = null;

    @property({
        group: { name: 'Chỉ số đếm Item (Tuỳ chọn)' },
        tooltip: "Định dạng chữ đếm, {0} là đã xong, {1} là tổng số"
    })
    public counterFormat: string = "{0}/{1}";

    private lastScreenWidth: number = 0;
    private lastScreenHeight: number = 0;
    private lastRefY: number = 0;
    private lastActiveCount: number = -1;
    private lastScrollValue: number = -1;
    private physicalScrollOffset: number = 0;

    protected start() {
        const visibleSize = view.getVisibleSize();
        this.lastScreenWidth = visibleSize.width;
        this.lastScreenHeight = visibleSize.height;

        if (this.referenceYObject) {
            this.lastRefY = this.referenceYObject.worldPosition.y;
        }
        
        if (this.scrollbar) {
            this.lastScrollValue = this.scrollbar.normalizedValue;
        }

        if (!this.camera) {
            this.camera = director.getScene()?.getComponentInChildren(Camera) || null;
        }
        
        this.ArrangeItems();
        this.UpdateCounterText();
    }

    protected lateUpdate(dt: number) {
        if (!this.realignOnUpdate) return;

        let shouldUpdate = false;
        const visibleSize = view.getVisibleSize();

        if (this.lastScreenWidth !== visibleSize.width || this.lastScreenHeight !== visibleSize.height) {
            this.lastScreenWidth = visibleSize.width;
            this.lastScreenHeight = visibleSize.height;
            shouldUpdate = true;
        }

        if (this.referenceYObject && this.referenceYObject.worldPosition.y !== this.lastRefY) {
            this.lastRefY = this.referenceYObject.worldPosition.y;
            shouldUpdate = true;
        }

        if (this.scrollbar && this.scrollbar.node.activeInHierarchy && this.scrollbar.normalizedValue !== this.lastScrollValue) {
            shouldUpdate = true;
            if (HandHintManager.Instance) {
                HandHintManager.Instance.ShowHintWithDelay();
            }
        }

        let currentActiveCount = 0;
        for (let i = 0; i < this.itemsToArrange.length; i++) {
            const item = this.itemsToArrange[i];
            if (item && item.itemTransform && item.itemTransform.activeInHierarchy) {
                const controller = item.itemTransform.getComponent(DrawItemController);
                if (!controller || !controller.isBeingDragged) {
                    currentActiveCount++;
                }
            }
        }

        if (currentActiveCount !== this.lastActiveCount) {
            this.lastActiveCount = currentActiveCount;
            shouldUpdate = true;
        }

        if (shouldUpdate) {
            this.ArrangeItems();
        }

        this.UpdateCounterText();
    }

    public UpdateCounterText() {
        if (!this.counterText) return;

        const total = this.itemsToArrange.length;
        let completed = 0;

        for (let i = 0; i < total; i++) {
            const item = this.itemsToArrange[i];
            if (item && item.itemTransform) {
                const controller = item.itemTransform.getComponent(DrawItemController);
                if (controller && controller.isCompleted) {
                    completed++;
                } else if (!item.itemTransform.active) {
                    completed++;
                }
            }
        }

        this.counterText.string = this.counterFormat.replace('{0}', completed.toString()).replace('{1}', total.toString());
    }

    public ArrangeItems() {
        if (this.itemsToArrange.length === 0) return;
        
        if (!this.referenceYObject) {
            console.warn("ItemArranger: Chưa gắn Reference Y Object!");
            return;
        }

        if (!this.camera) {
            this.camera = director.getScene()?.getComponentInChildren(Camera) || null;
            if (!this.camera) {
                console.warn("ItemArranger: Không tìm thấy Camera!");
                return;
            }
        }

        let firstActiveItem: Node | null = null;
        let activeCount = 0;
        let totalItemsWidth = 0;

        for (let i = 0; i < this.itemsToArrange.length; i++) {
            const item = this.itemsToArrange[i];
            if (item && item.itemTransform && item.itemTransform.activeInHierarchy) {
                const controller = item.itemTransform.getComponent(DrawItemController);
                if (!controller || !controller.isBeingDragged) {
                    if (!firstActiveItem) firstActiveItem = item.itemTransform;
                    activeCount++;
                    
                    if (i < this.itemsToArrange.length - 1) {
                        totalItemsWidth += item.spacingToNext;
                    }
                }
            }
        }

        // Tính toán rìa trái/bên phải thực tế của viewport, tránh sai khi có letterbox hoặc design resolution.
        const viewport = view.getViewportRect();
        const screenLeftX = viewport ? viewport.x : 0;
        const screenRightX = viewport ? (viewport.x + viewport.width) : view.getVisibleSize().width;

        const leftEdgeX = this.camera ? this.camera.screenToWorld(new math.Vec3(screenLeftX, 0, 0)).x : 0;
        const rightEdgeX = this.camera ? this.camera.screenToWorld(new math.Vec3(screenRightX, 0, 0)).x : (leftEdgeX + (screenRightX - screenLeftX));

        const startX = leftEdgeX + this.startOffsetX;
        const visibleScreenWidth = rightEdgeX - startX;
        
        const maxScrollDistance = totalItemsWidth - visibleScreenWidth;

        let itemWidth = 2;
        if (this.itemsToArrange.length > 0) itemWidth = this.itemsToArrange[0].spacingToNext;

        const extendedMinScroll = 0; 
        const extendedMaxScroll = maxScrollDistance + itemWidth;

        if (this.scrollbar) {
            if (maxScrollDistance <= 0.1 || activeCount === 0) {
                this.scrollbar.node.active = false;
                this.physicalScrollOffset = 0;
                this.scrollbar.ResetToStart();
                this.lastScrollValue = 0;
            } else {
                this.scrollbar.node.active = true;

                if (this.scrollbar.normalizedValue !== this.lastScrollValue) {
                    this.physicalScrollOffset = math.lerp(extendedMinScroll, extendedMaxScroll, this.scrollbar.normalizedValue);
                    this.lastScrollValue = this.scrollbar.normalizedValue;
                } else {
                    this.physicalScrollOffset = math.clamp(this.physicalScrollOffset, extendedMinScroll, extendedMaxScroll);
                    const newNormalized = extendedMaxScroll > extendedMinScroll ? math.inverseLerp(extendedMinScroll, extendedMaxScroll, this.physicalScrollOffset) : 0;
                    this.scrollbar.SetNormalizedValue(newNormalized);
                    this.lastScrollValue = newNormalized;
                }
            }
        } else {
            this.physicalScrollOffset = 0;
        }
        
        let currentX = startX - this.physicalScrollOffset;
        const targetY = this.referenceYObject.worldPosition.y;

        for (let i = 0; i < this.itemsToArrange.length; i++) {
            const item = this.itemsToArrange[i];
            if (item && item.itemTransform && item.itemTransform.activeInHierarchy) {
                const controller = item.itemTransform.getComponent(DrawItemController);
                if (!controller || !controller.isBeingDragged) {
                    item.itemTransform.setWorldPosition(new math.Vec3(currentX, targetY, item.itemTransform.worldPosition.z));
                    
                    const movement = item.itemTransform.getComponent(DrawItemMovement);
                    if (movement) {
                        movement.UpdateSpawnPos();
                    }

                    const physicsSync = item.itemTransform.getComponent(PhysicsSyncAfterAnim) || item.itemTransform.getComponentInChildren(PhysicsSyncAfterAnim);
                    if (physicsSync) {
                        physicsSync.forceSync();
                    } else {
                        this.syncCollidersForItem(item.itemTransform);
                    }
                    
                    currentX += item.spacingToNext;
                }
            }
        }
    }

    private syncCollidersForItem(itemNode: Node): void {
        if (!itemNode) return;

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

    // Cocos không hỗ trợ ContextMenu giống hệt Unity, nhưng ta có thể dùng property getter/setter hoặc executeInEditMode.
    // Tuy nhiên cách đơn giản nhất là thêm một boolean property đóng vai trò như nút bấm trong Editor.
    @property({
        tooltip: "Tích vào đây để tự động lấy tất cả các con gán vào list",
        displayName: "Get Items From Children (Click)"
    })
    get autoGetItems() { return false; }
    set autoGetItems(value) {
        if (value) {
            this.GetItemsFromChildren();
        }
    }

    @property({
        tooltip: "Tích vào đây để gọi hàm ArrangeItems() ngay lập tức trên Editor",
        displayName: "Arrange Items Now (Click)"
    })
    get arrangeItemsNow() { return false; }
    set arrangeItemsNow(value) {
        if (value) {
            this.ArrangeItems();
        }
    }

    public GetItemsFromChildren() {
        this.itemsToArrange = [];
        const children = this.node.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const newItem = new ArrangedItem();
            newItem.itemTransform = child;
            newItem.spacingToNext = 2; // Mặc định là 2
            this.itemsToArrange.push(newItem);
        }
        console.log("Đã lấy " + this.itemsToArrange.length + " items từ con!");
    }
}
