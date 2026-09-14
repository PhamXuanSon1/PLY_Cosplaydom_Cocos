import { _decorator, Node, Sprite, Tween, tween, Vec3, CCFloat, EventHandler } from 'cc';
import { Ply_GameUnit } from '../../ScriptTemplate/Ply_GameUnit';
import { Ply_Pool, PoolType } from '../../ScriptTemplate/Ply_Pool';
import { FxType, Ply_SoundManager } from '../../ScriptTemplate/Ply_SoundManager';

const { ccclass, property } = _decorator;

/**
 * Đồng hồ đếm ngược (pool): rút Sprite.fillRange từ 1 về 0 trong `duration` giây.
 * Spawn qua Ply_Pool (PoolType.ClockTimer) bằng ClockTimer.SpawnAt(...) hoặc đặt sẵn trong scene và gọi PlayTimer().
 */
@ccclass('ClockTimer')
export class ClockTimer extends Ply_GameUnit {
    @property({ type: Sprite, tooltip: 'Sprite đã set Fill Type (Radial). Để trống sẽ tự tìm Sprite ở node con.' })
    public fillSprite: Sprite | null = null;

    @property({ type: CCFloat, tooltip: 'Thời gian đếm ngược mặc định (giây).' })
    public defaultDuration: number = 1;

    @property({ tooltip: 'Offset (world) so với node được gắn đồng hồ.' })
    public itemOffset: Vec3 = new Vec3(0, 120, 0);

    @property({ type: CCFloat, tooltip: 'Giá trị fillRange lúc bắt đầu (VD: -1 = đầy vòng theo chiều ngược, 1 = đầy vòng thuận).' })
    public startFillRange: number = -1;

    @property({ type: CCFloat, tooltip: 'Giá trị fillRange lúc kết thúc (thường là 0).' })
    public endFillRange: number = 0;

    @property({ tooltip: 'Tự chạy đếm mỗi khi node được bật (active).' })
    public playOnEnable: boolean = true;

    @property({ tooltip: 'Tắt node (active = false) sau khi đếm xong.' })
    public deactivateOnComplete: boolean = true;

    @property({ tooltip: 'Trả về pool sau khi đếm xong (chỉ áp dụng khi spawn từ pool).' })
    public despawnOnComplete: boolean = true;

    @property({ group: { name: 'Sound', id: 'sound' }, tooltip: 'Phát âm thanh tick (loop) trong lúc đếm.' })
    public playTickSound: boolean = true;

    @property({ type: FxType, group: { name: 'Sound', id: 'sound' }, tooltip: 'Loại âm thanh loop khi đếm.' })
    public tickFx: FxType = FxType.Clock;

    @property({ group: { name: 'Sound', id: 'sound' }, tooltip: 'Phát 1 tiếng khi đếm xong.' })
    public playCompleteSound: boolean = false;

    @property({ type: FxType, group: { name: 'Sound', id: 'sound' }, tooltip: 'Loại âm thanh khi đếm xong.' })
    public completeFx: FxType = FxType.Correct;

    @property({ type: [EventHandler], tooltip: 'Gọi 1 lần khi fillRange về 0.' })
    public onComplete: EventHandler[] = [];

    private tweenFill: Tween<Sprite> | null = null;
    private isRunning: boolean = false;
    private isTickPlaying: boolean = false;
    private spawnedFromPool: boolean = false;

    protected onLoad(): void {
        if (!this.fillSprite) this.fillSprite = this.getComponentInChildren(Sprite);
    }

    protected onEnable(): void {
        if (this.playOnEnable && !this.spawnedFromPool) this.PlayTimer();
    }

    protected onDisable(): void {
        this.StopTimer();
    }

    /** Đặt đồng hồ theo node (hoặc parent riêng) rồi chạy. */
    public StartTimer(target: Node | null, duration: number = this.defaultDuration, offset?: Vec3, clockParent?: Node): void {
        if (clockParent && clockParent.isValid) {
            this.node.setParent(clockParent);
            this.node.setPosition(0, 0, 0);
            this.PlayTimer(duration);
            return;
        }

        if (target && target.isValid) {
            const p = target.worldPosition;
            const o = offset ?? this.itemOffset;
            this.node.setWorldPosition(p.x + o.x, p.y + o.y, p.z + o.z);
        }

        this.PlayTimer(duration);
    }

    /** Chạy đếm ngược tại vị trí hiện tại. */
    public PlayTimer(duration: number = this.defaultDuration): void {
        if (!this.fillSprite) {
            console.warn(`[ClockTimer] Chưa gán Fill Sprite trên "${this.node.name}".`);
            return;
        }

        this.StopTimer();
        this.isRunning = true;
        this.fillSprite.fillRange = this.startFillRange;

        if (this.playTickSound && Ply_SoundManager.Ins) {
            Ply_SoundManager.Ins.playLoopFx(this.tickFx);
            this.isTickPlaying = true;
        }

        const safeDuration = Math.max(0.01, duration);
        this.tweenFill = tween(this.fillSprite)
            .to(safeDuration, { fillRange: this.endFillRange })
            .call(() => this.FinishTimer())
            .start();
    }

    public StopTimer(): void {
        if (this.tweenFill) this.tweenFill.stop();
        this.tweenFill = null;
        this.isRunning = false;
        this.stopTickSound();
        if (this.fillSprite) this.fillSprite.fillRange = this.startFillRange;
    }

    public get IsRunning(): boolean {
        return this.isRunning;
    }

    public FinishTimer(): void {
        if (!this.isRunning) return;
        this.isRunning = false;
        this.tweenFill = null;
        this.stopTickSound();

        if (this.playCompleteSound && Ply_SoundManager.Ins) Ply_SoundManager.Ins.playFx(this.completeFx);
        EventHandler.emitEvents(this.onComplete, this);

        if (this.spawnedFromPool) {
            if (this.despawnOnComplete && Ply_Pool.Ins) Ply_Pool.Ins.despawn(PoolType.ClockTimer, this);
        } else if (this.deactivateOnComplete) {
            this.node.active = false;
        }
    }

    private stopTickSound(): void {
        if (!this.isTickPlaying) return;
        if (Ply_SoundManager.Ins) Ply_SoundManager.Ins.stopFx(this.tickFx);
        this.isTickPlaying = false;
    }

    /** Spawn 1 ClockTimer từ Ply_Pool và chạy ngay tại node target (cần đăng ký prefab ClockTimer vào Ply_Pool với type ClockTimer). */
    public static SpawnAt(target: Node, duration: number, offset?: Vec3, clockParent?: Node): ClockTimer | null {
        if (!Ply_Pool.Ins) return null;
        const unit = Ply_Pool.Ins.spawn(PoolType.ClockTimer, target.worldPosition.clone());
        const timer = unit ? unit.getComponent(ClockTimer) : null;
        if (!timer) return null;

        timer.spawnedFromPool = true;
        timer.StartTimer(target, duration, offset, clockParent);
        return timer;
    }
}
