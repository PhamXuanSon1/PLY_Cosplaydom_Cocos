import { _decorator, Component, Sprite, Texture2D, Material, EffectAsset, UITransform, Vec3, CCFloat, CCInteger } from 'cc';
const { ccclass, property, requireComponent } = _decorator;

/**
 * Cọ đi tới đâu, ảnh hiện tới đó.
 *
 * Gắn lên node Sprite chứa ảnh cần lộ ra (VD: hoạ tiết chân legb). Script tạo 1 mask texture nhỏ,
 * mỗi lần vẽ tô 1 chấm tròn mềm lên mask; shader MaskReveal.effect chỉ cho Sprite hiện ở chỗ đã tô.
 *
 * Setup:
 *  - Sprite: Trim = false (để khung Sprite khớp với toàn bộ ảnh), không để ảnh bị xoay trong atlas.
 *  - Kéo MaskReveal.effect vào ô Reveal Effect.
 *  - Gán node này vào ô Mask Reveal của MakeupTarget -> tiến độ/Heart/hint dùng chung như cũ.
 */
@ccclass('MaskReveal')
@requireComponent(Sprite)
export class MaskReveal extends Component {
    @property({ type: EffectAsset, displayName: 'Reveal Effect', tooltip: 'Kéo file 8.Models/Shaders/MaskReveal.effect vào đây' })
    public revealEffect: EffectAsset | null = null;

    @property({ type: CCInteger, displayName: 'Mask Width', tooltip: 'Độ phân giải mask. Nhỏ = nhẹ, mép cọ mềm hơn. 64-256 là đủ.' })
    public maskWidth: number = 128;

    @property({ type: CCInteger, displayName: 'Mask Height', tooltip: '0 = tự tính theo tỉ lệ khung Sprite' })
    public maskHeight: number = 0;

    @property({ type: CCFloat, displayName: 'Brush Radius', tooltip: 'Bán kính cọ, tính theo pixel của khung Sprite (UITransform)' })
    public brushRadius: number = 60;

    @property({ type: CCFloat, displayName: 'Brush Softness', tooltip: '0 = mép cứng, 1 = mép mềm hết cỡ', range: [0, 1, 0.05], slide: true })
    public brushSoftness: number = 0.5;

    @property({ type: CCFloat, displayName: 'Complete Coverage', tooltip: 'Tô được bao nhiêu % mask thì coi như xong (tự lấp đầy phần còn lại)', range: [0.1, 1, 0.05], slide: true })
    public completeCoverage: number = 0.7;

    private sprite: Sprite | null = null;
    private maskTex: Texture2D | null = null;
    private buffer: Uint8Array | null = null;
    private texW = 0;
    private texH = 0;
    private paintedCount = 0;
    private dirty = false;
    private tmpLocal = new Vec3();

    protected onLoad(): void {
        this.sprite = this.getComponent(Sprite);
        this.setupMask();
    }

    private setupMask(): void {
        if (!this.sprite) return;
        const ui = this.getComponent(UITransform);
        const size = ui ? ui.contentSize : null;

        this.texW = Math.max(8, Math.floor(this.maskWidth));
        this.texH = this.maskHeight > 0
            ? Math.max(8, Math.floor(this.maskHeight))
            : Math.max(8, Math.round(this.texW * (size && size.width > 0 ? size.height / size.width : 1)));

        this.buffer = new Uint8Array(this.texW * this.texH * 4);
        this.maskTex = new Texture2D();
        this.maskTex.reset({ width: this.texW, height: this.texH, format: Texture2D.PixelFormat.RGBA8888 });
        this.maskTex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
        this.maskTex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
        this.maskTex.uploadData(this.buffer);

        if (this.revealEffect) {
            const mat = new Material();
            mat.initialize({ effectAsset: this.revealEffect });
            this.sprite.customMaterial = mat;
        } else {
            console.warn(`[MaskReveal] ${this.node.name}: chưa gán Reveal Effect -> ảnh sẽ hiện nguyên, không có hiệu ứng vẽ.`);
        }
        this.applyMaterialProps();
    }

    private applyMaterialProps(): void {
        if (!this.sprite || !this.revealEffect) return;
        const mat = this.sprite.getMaterialInstance(0);
        if (!mat) return;
        mat.setProperty('maskTexture', this.maskTex);

        // uv của sprite frame trong atlas: [bl.u, bl.v, br.u, br.v, tl.u, tl.v, tr.u, tr.v]
        const sf = this.sprite.spriteFrame;
        if (sf && sf.uv && sf.uv.length >= 8) {
            const uv = sf.uv;
            const left = uv[4], top = uv[5], right = uv[6], bottom = uv[1];
            mat.setProperty('uvRect', [left, top, right - left, bottom - top]);
        }
    }

    /** Tiến độ 0..1 so với mốc hoàn thành (1 = đã xong). */
    public get progress(): number {
        const total = this.texW * this.texH;
        if (total <= 0) return 0;
        return Math.min(1, (this.paintedCount / total) / Math.max(0.01, this.completeCoverage));
    }

    /** Tô 1 chấm tại vị trí world (UI world pos). Trả về true nếu có pixel mới được tô. */
    public paintAtWorld(worldPos: Vec3, radius: number = 0): boolean {
        if (!this.buffer) return false;
        const ui = this.getComponent(UITransform);
        if (!ui) return false;

        ui.convertToNodeSpaceAR(worldPos, this.tmpLocal);
        const w = ui.width, h = ui.height;
        if (w <= 0 || h <= 0) return false;

        // local (gốc = anchor, y hướng lên) -> pixel mask (gốc trên trái, y hướng xuống)
        const px = (this.tmpLocal.x / w + ui.anchorX) * this.texW;
        const py = (1 - (this.tmpLocal.y / h + ui.anchorY)) * this.texH;
        // radius tính theo world -> đổi sang đơn vị khung Sprite
        const scale = Math.abs(this.node.worldScale.x) || 1;
        const r = radius > 0 ? radius / scale : this.brushRadius;
        const rx = r / w * this.texW;
        const ry = r / h * this.texH;
        if (rx <= 0 || ry <= 0) return false;

        const x0 = Math.max(0, Math.floor(px - rx)), x1 = Math.min(this.texW - 1, Math.ceil(px + rx));
        const y0 = Math.max(0, Math.floor(py - ry)), y1 = Math.min(this.texH - 1, Math.ceil(py + ry));
        if (x0 > x1 || y0 > y1) return false;

        const hard = 1 - Math.min(1, Math.max(0, this.brushSoftness));
        let changed = false;
        for (let y = y0; y <= y1; y++) {
            const dy = (y + 0.5 - py) / ry;
            for (let x = x0; x <= x1; x++) {
                const dx = (x + 0.5 - px) / rx;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d >= 1) continue;
                const a = d <= hard ? 1 : 1 - (d - hard) / (1 - hard);
                const v = Math.round(a * 255);
                const i = (y * this.texW + x) * 4;
                const old = this.buffer[i];
                if (v <= old) continue;
                if (old < 128 && v >= 128) this.paintedCount++;
                this.buffer[i] = this.buffer[i + 1] = this.buffer[i + 2] = this.buffer[i + 3] = v;
                changed = true;
            }
        }
        if (changed) this.dirty = true;
        return changed;
    }


    /** Vẽ nét từ `from` tới `to` (đặt chấm cách đều nhau) để kéo nhanh không bị đứt nét. */
    public paintStrokeWorld(from: Vec3 | null, to: Vec3, radius: number = 0): boolean {
        const r = radius;
        if (!from) return this.paintAtWorld(to, r);
        const dist = Vec3.distance(from, to);
        const step = Math.max(1, (r > 0 ? r : this.brushRadius * (Math.abs(this.node.worldScale.x) || 1)) * 0.35);
        const n = Math.min(64, Math.ceil(dist / step));
        let changed = false;
        const p = new Vec3();
        for (let i = 1; i <= n; i++) {
            Vec3.lerp(p, from, to, i / n);
            if (this.paintAtWorld(p, r)) changed = true;
        }
        if (n === 0 && this.paintAtWorld(to, r)) changed = true;
        return changed;
    }

    /** Lấp đầy toàn bộ mask (dùng khi đủ Complete Coverage hoặc forceComplete). */
    public fillAll(): void {
        if (!this.buffer) return;
        this.buffer.fill(255);
        this.paintedCount = this.texW * this.texH;
        this.dirty = true;
    }

    /** Xoá sạch mask về trạng thái chưa vẽ. */
    public clear(): void {
        if (!this.buffer) return;
        this.buffer.fill(0);
        this.paintedCount = 0;
        this.dirty = true;
    }

    protected lateUpdate(): void {
        // Gom mọi lần tô trong frame thành 1 lần upload lên GPU
        if (this.dirty && this.maskTex && this.buffer) {
            this.maskTex.uploadData(this.buffer);
            this.dirty = false;
        }
    }

    protected onDestroy(): void {
        if (this.maskTex) {
            this.maskTex.destroy();
            this.maskTex = null;
        }
    }
}
