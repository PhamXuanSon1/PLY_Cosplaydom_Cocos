import { _decorator, Component, Animation, Collider2D, RigidBody2D, sp } from 'cc';
const { ccclass, property } = _decorator;

/**
 * PhysicsSyncAfterAnim
 * 
 * Gắn component này vào bất kỳ node nào có Animation/Spine + Collider2D/RigidBody2D.
 * Sau mỗi lần Animation/Spine chạy xong (hoặc mỗi frame nếu bật alwaysSync),
 * nó sẽ tự động disable → re-enable collider để Box2D rebuild đúng vị trí.
 */
@ccclass('PhysicsSyncAfterAnim')
export class PhysicsSyncAfterAnim extends Component {

    @property({
        tooltip: 'Bật nếu muốn sync collider liên tục mỗi vài frame (dùng cho MakeupTarget trên Spine).'
    })
    public alwaysSync: boolean = false;

    @property({
        tooltip: 'Số frame giữa mỗi lần sync khi alwaysSync = true. Giá trị 1 = sync mỗi frame, 3 = cứ 3 frame sync 1 lần.',
        min: 1,
        max: 30,
        step: 1,
        visible: function (this: any) { return this.alwaysSync; }
    })
    public syncInterval: number = 3;

    @property({
        tooltip: 'Bật nếu muốn tự động sync khi Animation/Spine FINISHED.'
    })
    public syncOnAnimFinished: boolean = true;

    private _anim: Animation | null = null;
    private _spine: sp.Skeleton | null = null;
    private _frameCounter: number = 0;

    // Dùng để phát hiện collider đang trong chu kỳ rebuild (đã disable, chờ enable lại)
    private _isSyncing: boolean = false;

    protected onLoad(): void {
        this._anim = this.getComponent(Animation);
        this._spine = this.getComponent(sp.Skeleton);
    }

    protected start(): void {
        if (this.syncOnAnimFinished) {
            // Đăng ký event cho Cocos Animation
            if (this._anim) {
                this._anim.on(Animation.EventType.FINISHED, this._onAnimFinished, this);
                this._anim.on(Animation.EventType.LASTFRAME, this._onAnimFinished, this);
            }
            // Đăng ký event cho Spine Animation (dùng setTrackCompleteListener thay vì setCompleteListener để tránh bị ghi đè)
            // Không dùng setCompleteListener vì script khác (VD: SpineEmotionController) sẽ ghi đè listener đó
        }

        // Sync 1 lần khi start để chắc chắn collider khớp vị trí ban đầu
        this.scheduleOnce(() => {
            this._doSync();
        }, 0.1);
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

        // Nếu đang trong chu kỳ rebuild (chờ scheduleOnce bật lại collider) thì bỏ qua
        if (this._isSyncing) return;

        this._frameCounter++;
        if (this._frameCounter >= this.syncInterval) {
            this._frameCounter = 0;
            this._doSync();
        }
    }

    /** Ép collider rebuild bằng cách tắt/bật lại */
    private _doSync(): void {
        if (this._isSyncing) return; // Tránh gọi chồng

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

        if (activeBodies.length === 0 && activeColliders.length === 0) return;

        this._isSyncing = true;

        // Bật lại frame sau để Box2D rebuild hoàn toàn
        this.scheduleOnce(() => {
            for (const body of activeBodies) {
                if (body && body.isValid) body.enabled = true;
            }
            for (const col of activeColliders) {
                if (col && col.isValid) col.enabled = true;
            }
            this._isSyncing = false;
        }, 0);
    }

    /** Gọi thủ công từ script khác khi cần sync ngay */
    public forceSync(): void {
        this._doSync();
    }
}
