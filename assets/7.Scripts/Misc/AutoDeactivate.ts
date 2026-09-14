import { _decorator, Component, CCInteger, CCFloat, ParticleSystem2D, Animation } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Tự tắt node sau N frame (hoặc N giây) kể từ khi được bật — dùng cho effect ngắn như BlinkEffect.
 * Mỗi lần bật lại sẽ reset ParticleSystem2D / Animation con để chúng phát lại từ đầu
 * (playOnLoad chỉ chạy đúng 1 lần trong đời node nên phải chủ động replay).
 */
@ccclass('AutoDeactivate')
export class AutoDeactivate extends Component {

    @property({ type: CCFloat, displayName: 'Duration (s)', tooltip: 'Số giây hiển thị trước khi tắt. > 0 sẽ dùng giây thay cho Frames (nên ≥ thời gian sống của particle).' })
    public duration: number = 0.5;

    @property({ type: CCInteger, displayName: 'Frames', tooltip: 'Số frame hiển thị trước khi tắt (chỉ dùng khi Duration = 0)' })
    public frames: number = 3;

    @property({ displayName: 'Replay Effects On Enable', tooltip: 'Reset ParticleSystem2D / Animation ở node này và các node con mỗi lần bật' })
    public replayEffectsOnEnable: boolean = true;

    private _elapsedFrames: number = 0;
    private _elapsedTime: number = 0;

    protected onEnable(): void {
        this._elapsedFrames = 0;
        this._elapsedTime = 0;
        if (this.replayEffectsOnEnable) this.replayEffects();
    }

    private replayEffects(): void {
        const particles = this.getComponentsInChildren(ParticleSystem2D);
        for (const ps of particles) if (ps && ps.isValid) ps.resetSystem();

        const anims = this.getComponentsInChildren(Animation);
        for (const anim of anims) {
            if (!anim || !anim.isValid) continue;
            const clip = anim.defaultClip || (anim.clips.length > 0 ? anim.clips[0] : null);
            if (!clip) continue;
            anim.stop();
            anim.play(clip.name);
        }
    }

    protected lateUpdate(dt: number): void {
        this._elapsedFrames++;
        this._elapsedTime += dt;

        const done = this.duration > 0 ? this._elapsedTime >= this.duration : this._elapsedFrames >= this.frames;
        if (done) this.node.active = false;
    }
}
