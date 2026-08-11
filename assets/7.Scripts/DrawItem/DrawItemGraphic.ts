import { _decorator, Component, Node, Vec3, Graphics, Color, BoxCollider2D, CircleCollider2D, PolygonCollider2D, Collider2D, Vec2, Size, UITransform, Layers } from 'cc';
import { ActiveColliderVsNode } from './ActiveColliderVsNode';
const { ccclass, property } = _decorator;

@ccclass('DrawItemGraphic')
export class DrawItemGraphic extends ActiveColliderVsNode {

    @property({
        group: { name: '1. Debug & Colliders', id: 'debug' },
        displayName: 'Show Collider Line Only',
        tooltip: 'Bật ô này để CHỈ hiển thị khung Collider của riêng vật phẩm này (không làm hiện các item khác).'
    })
    public showPhysicsColliders: boolean = false;

    @property({
        group: { name: '2. Rotation Setup', id: 'rotation' },
        displayName: 'Spawn Rotation',
        tooltip: 'Góc quay ban đầu của vật phẩm'
    })
    public SpawnRotation: Vec3 = new Vec3();

    @property({
        group: { name: '2. Rotation Setup', id: 'rotation' },
        displayName: 'Drag Rotation',
        tooltip: 'Góc quay khi cầm/kéo vật phẩm'
    })
    public DragRotation: Vec3 = new Vec3();

    @property({
        group: { name: '3. Scale Setup', id: 'scale' },
        displayName: 'Enable Scale On Drag',
        tooltip: 'Bật nếu muốn vật phẩm to ra/nhỏ lại khi cầm lên'
    })
    public enableScaleOnDrag: boolean = false;

    @property({
        group: { name: '3. Scale Setup', id: 'scale' },
        displayName: 'Drag Scale Multiplier',
        tooltip: 'Tỷ lệ Scale khi kéo (Ví dụ: 1.2 là to lên 20%)'
    })
    public dragScaleMultiplier: number = 1.2;

    @property({
        group: { name: '3. Scale Setup', id: 'scale' },
        displayName: 'Drag Scale Duration',
        tooltip: 'Thời gian tween phóng to/thu nhỏ (giây).'
    })
    public dragScaleDuration: number = 0.1;

    /** Scale tuyệt đối trong world space lúc spawn */
    public SpawnWorldScale: Vec3 = new Vec3();

    private _baselineCaptured: boolean = false;

    protected start(): void {
        this.SpawnRotation = this.node.eulerAngles.clone();
        if (this.showPhysicsColliders) {
            this.updateDebugDraw();
        }
    }

    protected update(dt: number): void {
        if (this.showPhysicsColliders) {
            this.updateDebugDraw();
        } else {
            this.removeDebugDraw();
        }
    }

    protected onDisable(): void {
        this.removeDebugDraw();
    }

    /**
     * Tự vẽ đường outline cho CHỈ Collider2D của vật phẩm này.
     */
    private updateDebugDraw(): void {
        let colliders: Collider2D[] = [];
        if (this.targetCollider) colliders.push(this.targetCollider);
        if (this.targetColliders && this.targetColliders.length > 0) {
            colliders.push(...this.targetColliders.filter(c => c != null));
        }
        if (colliders.length === 0) {
            const myCols = this.getComponents(Collider2D);
            if (myCols && myCols.length > 0) {
                colliders = myCols;
            } else {
                colliders = this.getComponentsInChildren(Collider2D);
            }
        }

        for (const col of colliders) {
            if (!col || !col.node) continue;

            let gNode = col.node.getChildByName('__SingleColliderDebug__');
            if (!gNode) {
                gNode = new Node('__SingleColliderDebug__');
                col.node.addChild(gNode);
                // Đảm bảo node debug có UITransform để Graphics render được
                if (!gNode.getComponent(UITransform)) {
                    gNode.addComponent(UITransform);
                }
                // Đặt layer giống node cha để camera nhìn thấy
                gNode.layer = col.node.layer;
            }
            let g = gNode.getComponent(Graphics);
            if (!g) {
                g = gNode.addComponent(Graphics);
            }

            g.clear();
            g.strokeColor = new Color(0, 255, 0, 255); // Xanh lá cây đậm
            g.fillColor = new Color(0, 255, 0, 40);     // Phủ nhạt mờ
            g.lineWidth = 3;

            if (col instanceof BoxCollider2D) {
                const size = col.size;
                const offset = col.offset;
                g.rect(offset.x - size.width / 2, offset.y - size.height / 2, size.width, size.height);
                g.fill();
                g.stroke();
            } else if (col instanceof CircleCollider2D) {
                const offset = col.offset;
                const radius = col.radius;
                g.circle(offset.x, offset.y, radius);
                g.fill();
                g.stroke();
            } else if (col instanceof PolygonCollider2D) {
                const points = col.points;
                const offset = col.offset;
                if (points && points.length > 0) {
                    g.moveTo(points[0].x + offset.x, points[0].y + offset.y);
                    for (let i = 1; i < points.length; i++) {
                        g.lineTo(points[i].x + offset.x, points[i].y + offset.y);
                    }
                    g.close();
                    g.fill();
                    g.stroke();
                }
            } else {
                const offset = (col as any).offset || new Vec2();
                const size = (col as any).size || new Size(60, 60);
                g.rect(offset.x - size.width / 2, offset.y - size.height / 2, size.width, size.height);
                g.fill();
                g.stroke();
            }
        }
    }

    private removeDebugDraw(): void {
        const graphics = this.node.getComponentsInChildren(Graphics);
        for (const g of graphics) {
            if (g.node.name === '__SingleColliderDebug__') {
                g.node.destroy();
            }
        }
    }

    public CaptureBaseline(targetNode: Node | null = null): void {
        if (this._baselineCaptured) return;
        this.SpawnWorldScale = (targetNode || this.node).worldScale.clone();
        this._baselineCaptured = true;
    }
}
