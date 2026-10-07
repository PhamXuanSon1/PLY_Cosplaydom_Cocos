import { _decorator, Component, Animation, AnimationClip } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Dừng animation một cách "mềm": chạy nốt vòng hiện tại rồi mới dừng (thay vì stop ngay).
 * Gán method `stopAfterLoop` vào On Drop Event (Component = AnimStopAfterLoop).
 * Dùng `play` của cc.Animation ở On Grab Event như bình thường.
 */
@ccclass('AnimStopAfterLoop')
export class AnimStopAfterLoop extends Component {

    @property({ type: Animation, tooltip: "Animation cần dừng. Để trống sẽ lấy Animation trên cùng node." })
    public anim: Animation | null = null;

    public stopAfterLoop(): void {
        const anim = this.anim ?? this.getComponent(Animation);
        if (!anim) return;

        const state = anim.defaultClip ? anim.getState(anim.defaultClip.name) : null;
        if (!state || !state.isPlaying) return;

        // Đổi Loop -> Normal: clip sẽ chạy hết vòng hiện tại rồi tự dừng.
        state.wrapMode = AnimationClip.WrapMode.Normal;
        state.repeatCount = 1;
    }

    /** Gọi ở On Grab Event (thay cho `play`) để lần grab sau vẫn lặp lại bình thường. */
    public playLoop(): void {
        const anim = this.anim ?? this.getComponent(Animation);
        if (!anim || !anim.defaultClip) return;

        const state = anim.getState(anim.defaultClip.name);
        if (state) {
            state.wrapMode = AnimationClip.WrapMode.Loop;
            state.repeatCount = Infinity;
        }
        if (!state?.isPlaying) anim.play();
    }
}
