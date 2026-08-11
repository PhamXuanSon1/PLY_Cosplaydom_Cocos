import { _decorator, Component, Animation, Collider2D, RigidBody2D } from 'cc';
const { ccclass, property } = _decorator;

/**
 * PhysicsSyncAfterAnim
 * 
 * Gắn component này vào bất kỳ node nào có Animation + Collider2D/RigidBody2D.
 * Sau mỗi lần Animation chạy xong (hoặc mỗi frame nếu bật alwaysSync),
 * nó sẽ tự động disable → re-enable collider để Box2D rebuild đúng vị trí.
 */
@ccclass('PhysicsSyncAfterAnim')
export class PhysicsSyncAfterAnim extends Component {

    @property({
        tooltip: 'Bật nếu muốn sync collider liên tục mỗi frame (dùng khi animation đang loop di chuyển).'
    })
    public alwaysSync: boolean = false;

    @property({
        tooltip: 'Bật nếu muốn tự động sync khi Animation FINISHED.'
    })
    public syncOnAnimFinished: boolean = true;

    private _anim: Animation | null = null;
    private _needSync: boolean = false;
    private _lastWorldX: number = 0;
    private _lastWorldY: number = 0;
    private _lastScaleX: number = 0;
    private _lastScaleY: number = 0;

    protected onLoad(): void {
        this._anim = this.getComponent(Animation);
    }

    protected start(): void {
        if (this._anim && this.syncOnAnimFinished) {
            this._anim.on(Animation.EventType.FINISHED, this._onAnimFinished, this);
            this._anim.on(Animation.EventType.LASTFRAME, this._onAnimFinished, this);
        }

        // Lưu vị trí ban đầu
        this._lastWorldX = this.node.worldPosition.x;
        this._lastWorldY = this.node.worldPosition.y;
        this._lastScaleX = this.node.worldScale.x;
        this._lastScaleY = this.node.worldScale.y;
    }

    protected onDestroy(): void {
        if (this._anim) {
            this._anim.off(Animation.EventType.FINISHED, this._onAnimFinished, this);
            this._anim.off(Animation.EventType.LASTFRAME, this._onAnimFinished, this);
        }
    }

    private _onAnimFinished(): void {
        this._doSync();
    }

    protected lateUpdate(dt: number): void {
        if (!this.alwaysSync) return;

        // Chỉ sync khi transform thực sự thay đổi (tránh sync vô nghĩa)
        const wp = this.node.worldPosition;
        const ws = this.node.worldScale;
        if (wp.x !== this._lastWorldX || wp.y !== this._lastWorldY ||
            ws.x !== this._lastScaleX || ws.y !== this._lastScaleY) {
            this._lastWorldX = wp.x;
            this._lastWorldY = wp.y;
            this._lastScaleX = ws.x;
            this._lastScaleY = ws.y;
            this._needSync = true;
        }

        if (this._needSync) {
            this._needSync = false;
            this._doSync();
        }
    }

    /** Ép collider rebuild bằng cách tắt/bật lại */
    private _doSync(): void {
        // Thu thập cả trên chính node lẫn con
        const colliders = this.getComponentsInChildren(Collider2D);
        const bodies = this.getComponentsInChildren(RigidBody2D);

        const activeBodies: RigidBody2D[] = [];
        const activeColliders: Collider2D[] = [];

        // Tắt
        for (const body of bodies) {
            if (body && body.enabled) {
                activeBodies.push(body);
                body.enabled = false;
            }
        }
        for (const col of colliders) {
            if (col && col.enabled) {
                activeColliders.push(col);
                col.enabled = false;
            }
        }

        // Bật lại frame sau để Box2D rebuild hoàn toàn
        this.scheduleOnce(() => {
            for (const body of activeBodies) {
                body.enabled = true;
            }
            for (const col of activeColliders) {
                col.enabled = true;
            }
        }, 0);
    }

    /** Gọi thủ công từ script khác khi cần sync ngay */
    public forceSync(): void {
        this._doSync();
    }
}
