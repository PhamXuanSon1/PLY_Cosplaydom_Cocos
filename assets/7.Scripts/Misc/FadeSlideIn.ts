import { _decorator, Component, Vec3, UIOpacity, tween, Tween, CCFloat, CCBoolean, EventHandler } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Hiệu ứng xuất hiện cho 1 nhóm ảnh (VD: node Table):
 * - Tất cả ảnh con: trong suốt → hiện rõ (dùng UIOpacity trên node gốc, tự lan xuống mọi Sprite con)
 * - Vị trí: bắt đầu cao hơn vị trí gốc `offsetY`, trượt xuống về đúng vị trí đặt trong Editor
 * Tự chạy khi node được bật (onEnable) hoặc gọi Play() từ EventHandler.
 */
@ccclass('FadeSlideIn')
export class FadeSlideIn extends Component {

    @property({ type: CCFloat, displayName: 'Duration', tooltip: 'Thời gian chạy hiệu ứng (giây)' })
    public duration: number = 0.5;

    @property({ type: CCFloat, displayName: 'Delay', tooltip: 'Đợi bao nhiêu giây rồi mới bắt đầu' })
    public delay: number = 0;

    @property({ type: CCFloat, displayName: 'Offset Y', tooltip: 'Vị trí bắt đầu cao hơn vị trí gốc bao nhiêu (px). Số dương = từ trên xuống.' })
    public offsetY: number = 300;

    @property({ type: CCBoolean, displayName: 'Play On Enable', tooltip: 'Tự chạy mỗi khi node được bật' })
    public playOnEnable: boolean = true;

    @property({ type: [EventHandler], displayName: 'On Finished', tooltip: 'Gọi khi hiệu ứng chạy xong' })
    public onFinished: EventHandler[] = [];

    private _originPos: Vec3 = new Vec3();
    private _hasOrigin: boolean = false;
    private _opacity: UIOpacity | null = null;

    protected onLoad(): void {
        this.cacheOrigin();
        this._opacity = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
    }

    protected onEnable(): void {
        if (this.playOnEnable) this.Play();
    }

    protected onDisable(): void {
        this.stop();
    }

    /** Lưu vị trí gốc (vị trí đang đặt trong Editor) — chỉ lấy 1 lần */
    private cacheOrigin(): void {
        if (this._hasOrigin) return;
        this._originPos.set(this.node.position);
        this._hasOrigin = true;
    }

    private stop(): void {
        Tween.stopAllByTarget(this.node);
        if (this._opacity) Tween.stopAllByTarget(this._opacity);
    }

    /** Chạy hiệu ứng (gọi được từ EventHandler / code) */
    public Play(): void {
        this.cacheOrigin();
        if (!this._opacity) this._opacity = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        this.stop();

        // Trạng thái bắt đầu: trong suốt + nằm cao hơn vị trí gốc
        this._opacity.opacity = 0;
        this.node.setPosition(this._originPos.x, this._originPos.y + this.offsetY, this._originPos.z);

        tween(this.node)
            .delay(this.delay)
            .to(this.duration, { position: this._originPos.clone() }, { easing: 'quadOut' })
            .call(() => EventHandler.emitEvents(this.onFinished))
            .start();

        tween(this._opacity)
            .delay(this.delay)
            .to(this.duration, { opacity: 255 }, { easing: 'quadOut' })
            .start();
    }

    /** Về trạng thái hiện rõ tại vị trí gốc ngay lập tức (không hiệu ứng) */
    public Skip(): void {
        this.cacheOrigin();
        this.stop();
        if (this._opacity) this._opacity.opacity = 255;
        this.node.setPosition(this._originPos);
    }
}
