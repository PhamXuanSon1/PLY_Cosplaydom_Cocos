import { _decorator, Component, sp, Texture2D, Material, EffectAsset, UITransform, Vec3, Vec4, Rect, CCFloat, CCInteger, CCString, Collider2D } from 'cc';
const { ccclass, property, requireComponent } = _decorator;

/**
 * Cọ đi tới đâu, hình trên Spine hiện tới đó (hỗ trợ cả mesh có weight).
 *
 * Gắn lên node sp.Skeleton. Script thay material của skeleton bằng SpineMaskReveal.effect:
 * các attachment có tên nằm trong "Reveal Regions" (VD: MakeUp/legb) chỉ hiện ở chỗ mask đã tô,
 * mọi attachment khác vẽ bình thường. Mask nằm trong không gian world, phủ vùng "Mask Area".
 *
 * MakeupTarget gán ô "Spine Mask Reveal" -> tiến độ = % mask đã tô bên trong collider của target.
 */
/** 1 nhóm vẽ = 1 kênh mask riêng. Item khác nhau tô cùng chỗ trên người mà không làm lộ hình của nhau. */
@ccclass('SpineRevealGroup')
export class SpineRevealGroup {
    @property({ displayName: 'Name', tooltip: 'Tên gợi nhớ, VD: Spray / Brush (không ảnh hưởng logic)' })
    public name: string = '';

    @property({ type: [CCString], displayName: 'Regions', tooltip: 'Tên region trong atlas thuộc nhóm này. VD: MakeUp/legb' })
    public regions: string[] = [];
}

@ccclass('SpineMaskReveal')
@requireComponent(sp.Skeleton)
export class SpineMaskReveal extends Component {
    @property({ type: EffectAsset, displayName: 'Reveal Effect', tooltip: 'Kéo file 8.Models/Shaders/SpineMaskReveal.effect vào đây' })
    public revealEffect: EffectAsset | null = null;

    @property({ type: [SpineRevealGroup], displayName: 'Reveal Groups', tooltip: 'Mỗi nhóm có mask riêng (tối đa 4 nhóm, tổng 16 region). MakeupTarget chọn nhóm bằng ô Spine Mask Group (0 = nhóm đầu tiên).' })
    public revealGroups: SpineRevealGroup[] = [];

    @property({ type: UITransform, displayName: 'Mask Area', tooltip: 'Vùng phủ mask (world). Để trống = dùng UITransform của chính node Spine. Nên là node con của nhân vật để mask đi theo khi scale/di chuyển.' })
    public maskArea: UITransform | null = null;

    @property({ type: CCInteger, displayName: 'Mask Width', tooltip: 'Độ phân giải mask theo chiều ngang. Chiều dọc tự tính theo tỉ lệ Mask Area.' })
    public maskWidth: number = 256;

    @property({ type: CCFloat, displayName: 'Brush Radius', tooltip: 'Bán kính cọ (đơn vị world / pixel UI)' })
    public brushRadius: number = 70;

    @property({ type: CCFloat, displayName: 'Brush Softness', tooltip: '0 = mép cứng, 1 = mép mềm hết cỡ', range: [0, 1, 0.05], slide: true })
    public brushSoftness: number = 0.5;

    private skeleton: sp.Skeleton | null = null;
    private material: Material | null = null;
    private maskTex: Texture2D | null = null;
    private buffer: Uint8Array | null = null;
    private texW = 0;
    private texH = 0;
    private dirty = false;
    private area = new Rect();
    private lastAreaKey = '';
    private regionVecs: Vec4[] = [];
    private regionChannels: number[] = [];
    private propsVersion = 0;
    private appliedVersions = new WeakMap<object, number>();

    protected onLoad(): void {
        this.skeleton = this.getComponent(sp.Skeleton);
        this.setupMask();
    }

    protected start(): void {
        const parsed = this.parseRegions();
        this.regionVecs = parsed.map(r => r.rect);
        this.regionChannels = parsed.map(r => r.channel);
        this.propsVersion++;
    }

    private setupMask(): void {
        if (!this.skeleton) return;
        const areaUI = this.getAreaUI();
        const size = areaUI ? areaUI.contentSize : null;

        this.texW = Math.max(16, Math.floor(this.maskWidth));
        this.texH = Math.max(16, Math.round(this.texW * (size && size.width > 0 ? size.height / size.width : 1)));

        this.buffer = new Uint8Array(this.texW * this.texH * 4);
        this.maskTex = new Texture2D();
        this.maskTex.reset({ width: this.texW, height: this.texH, format: Texture2D.PixelFormat.RGBA8888 });
        this.maskTex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
        this.maskTex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
        this.maskTex.uploadData(this.buffer);

        if (!this.revealEffect) {
            console.warn(`[SpineMaskReveal] ${this.node.name}: chưa gán Reveal Effect -> hình hiện nguyên, không có hiệu ứng vẽ.`);
            return;
        }
        this.material = new Material();
        this.material.initialize({ effectAsset: this.revealEffect });
        this.skeleton.customMaterial = this.material;
    }

    private getAreaUI(): UITransform | null {
        return this.maskArea || this.getComponent(UITransform);
    }

    /** Đọc atlas của skeleton, đổi tên region -> rect uv (x, y, w, h) trong texture. */
    private parseRegions(): { rect: Vec4; channel: number }[] {
        const result: { rect: Vec4; channel: number }[] = [];
        const data: any = this.skeleton ? this.skeleton.skeletonData : null;
        const text: string = data && data.atlasText ? data.atlasText : '';
        if (!text) {
            console.warn(`[SpineMaskReveal] ${this.node.name}: không đọc được atlasText của skeleton.`);
            return result;
        }

        // tên region -> kênh mask (index nhóm)
        const channelOf = new Map<string, number>();
        const groups = this.revealGroups.slice(0, 4);
        if (this.revealGroups.length > 4) console.warn(`[SpineMaskReveal] ${this.node.name}: chỉ dùng được 4 nhóm đầu.`);
        groups.forEach((g, gi) => (g && g.regions ? g.regions : []).forEach(n => { if (n && !channelOf.has(n)) channelOf.set(n, gi); }));
        const wanted = Array.from(channelOf.keys());
        const lines = text.split(/\r?\n/);
        let pageW = 0, pageH = 0;
        let current: string | null = null;
        let info: any = {};

        const flush = () => {
            if (current !== null && wanted.indexOf(current) !== -1 && pageW > 0 && pageH > 0 && info.w > 0) {
                const rotated = info.rotate === true || info.rotate === 'true' || info.rotate === '90';
                const pw = rotated ? info.h : info.w;
                const ph = rotated ? info.w : info.h;
                result.push({ rect: new Vec4(info.x / pageW, info.y / pageH, pw / pageW, ph / pageH), channel: channelOf.get(current)! });
            }
            current = null;
            info = {};
        };

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const line = raw.trim();
            if (!line) { flush(); pageW = pageH = 0; continue; }

            const colon = line.indexOf(':');
            if (colon === -1) {
                // Dòng tên: tên page (.png) hoặc tên region
                flush();
                if (!/\.(png|jpg|webp)$/i.test(line)) current = line;
                continue;
            }

            const key = line.substring(0, colon).trim();
            const vals = line.substring(colon + 1).split(',').map(v => v.trim());
            if (current === null) {
                if (key === 'size') { pageW = parseFloat(vals[0]); pageH = parseFloat(vals[1]); }
                continue;
            }
            if (key === 'bounds') {
                info.x = parseFloat(vals[0]); info.y = parseFloat(vals[1]);
                info.w = parseFloat(vals[2]); info.h = parseFloat(vals[3]);
            } else if (key === 'xy') {
                info.x = parseFloat(vals[0]); info.y = parseFloat(vals[1]);
            } else if (key === 'size') {
                info.w = parseFloat(vals[0]); info.h = parseFloat(vals[1]);
            } else if (key === 'rotate') {
                info.rotate = vals[0];
            }
        }
        flush();

        if (result.length !== wanted.length) {
            console.warn(`[SpineMaskReveal] ${this.node.name}: chỉ tìm thấy ${result.length}/${wanted.length} region trong atlas. Kiểm tra lại tên trong Reveal Regions.`);
        }
        if (result.length > 16) {
            console.warn(`[SpineMaskReveal] ${this.node.name}: tối đa 16 region, bỏ bớt phần thừa.`);
            result.length = 16;
        }
        return result;
    }

    private updateArea(): void {
        const ui = this.getAreaUI();
        if (!ui) return;
        const box = ui.getBoundingBoxToWorld();
        const key = `${box.x.toFixed(2)},${box.y.toFixed(2)},${box.width.toFixed(2)},${box.height.toFixed(2)}`;
        if (key === this.lastAreaKey) return;
        this.lastAreaKey = key;
        this.area.set(box);
        this.propsVersion++;
    }

    private applyProps(mat: any): void {
        if (!mat || typeof mat.setProperty !== 'function') return;
        if (this.appliedVersions.get(mat) === this.propsVersion) return;
        this.appliedVersions.set(mat, this.propsVersion);

        mat.setProperty('maskTexture', this.maskTex);
        mat.setProperty('maskRect', new Vec4(this.area.x, this.area.y, Math.max(1, this.area.width), Math.max(1, this.area.height)));
        mat.setProperty('regionInfo', new Vec4(this.regionVecs.length, 0, 0, 0));
        for (let i = 0; i < 16; i++) {
            mat.setProperty('region' + i, this.regionVecs[i] || new Vec4(0, 0, 0, 0));
        }
        const ch = (i: number) => this.regionChannels[i] || 0;
        for (let i = 0; i < 4; i++) {
            mat.setProperty('regionChannel' + i, new Vec4(ch(i * 4), ch(i * 4 + 1), ch(i * 4 + 2), ch(i * 4 + 3)));
        }
    }

    // ==========================================
    // API cho MakeupTarget
    // ==========================================

    /** Tô 1 chấm tại vị trí world. Trả về true nếu có pixel mới được tô. */
    public paintAtWorld(worldPos: Vec3, radius: number = 0, group: number = 0): boolean {
        if (!this.buffer) return false;
        this.updateArea();
        const a = this.area;
        if (a.width <= 0 || a.height <= 0) return false;

        // world -> pixel mask (hàng 0 = đáy vùng, khớp với maskUV trong shader)
        const px = (worldPos.x - a.x) / a.width * this.texW;
        const py = (worldPos.y - a.y) / a.height * this.texH;
        const r = radius > 0 ? radius : this.brushRadius;
        const rx = r / a.width * this.texW;
        const ry = r / a.height * this.texH;
        if (rx <= 0 || ry <= 0) return false;

        const x0 = Math.max(0, Math.floor(px - rx)), x1 = Math.min(this.texW - 1, Math.ceil(px + rx));
        const y0 = Math.max(0, Math.floor(py - ry)), y1 = Math.min(this.texH - 1, Math.ceil(py + ry));
        if (x0 > x1 || y0 > y1) return false;

        const hard = 1 - Math.min(1, Math.max(0, this.brushSoftness));
        const c = SpineMaskReveal.channelIndex(group);
        let changed = false;
        for (let y = y0; y <= y1; y++) {
            const dy = (y + 0.5 - py) / ry;
            for (let x = x0; x <= x1; x++) {
                const dx = (x + 0.5 - px) / rx;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d >= 1) continue;
                const v = Math.round((d <= hard ? 1 : 1 - (d - hard) / (1 - hard)) * 255);
                const i = (y * this.texW + x) * 4 + c;
                if (v <= this.buffer[i]) continue;
                this.buffer[i] = v;
                changed = true;
            }
        }
        if (changed) this.dirty = true;
        return changed;
    }


    /** Vẽ nét từ `from` tới `to` (đặt chấm cách đều nhau) để kéo nhanh không bị đứt nét. */
    public paintStrokeWorld(from: Vec3 | null, to: Vec3, radius: number = 0, group: number = 0): boolean {
        const r = radius > 0 ? radius : this.brushRadius;
        if (!from) return this.paintAtWorld(to, r, group);
        const dist = Vec3.distance(from, to);
        const step = Math.max(1, r * 0.35);
        const n = Math.min(64, Math.ceil(dist / step));
        let changed = false;
        const p = new Vec3();
        for (let i = 1; i <= n; i++) {
            Vec3.lerp(p, from, to, i / n);
            if (this.paintAtWorld(p, r, group)) changed = true;
        }
        if (n === 0 && this.paintAtWorld(to, r, group)) changed = true;
        return changed;
    }

    /** Tỉ lệ 0..1 pixel mask đã tô (>= 50%) bên trong rect world. */
    public coverageInWorldRect(rect: Rect, group: number = 0): number {
        const r = this.toPixelRect(rect);
        if (!r || !this.buffer) return 0;
        const c = SpineMaskReveal.channelIndex(group);
        let painted = 0, total = 0;
        for (let y = r.y0; y <= r.y1; y++) {
            for (let x = r.x0; x <= r.x1; x++) {
                total++;
                if (this.buffer[(y * this.texW + x) * 4 + c] >= 128) painted++;
            }
        }
        return total > 0 ? painted / total : 0;
    }

    /** Tô kín toàn bộ rect world (dùng khi target hoàn thành). */
    public fillWorldRect(rect: Rect, group: number = 0): void {
        const r = this.toPixelRect(rect);
        if (!r || !this.buffer) return;
        const c = SpineMaskReveal.channelIndex(group);
        for (let y = r.y0; y <= r.y1; y++) {
            for (let x = r.x0; x <= r.x1; x++) this.buffer[(y * this.texW + x) * 4 + c] = 255;
        }
        this.dirty = true;
    }

    /** Tô kín toàn bộ mask của 1 nhóm (khi mọi target của nhóm đã xong -> lấp các khe ngoài collider). */
    public fillGroup(group: number = 0): void {
        if (!this.buffer) return;
        const c = SpineMaskReveal.channelIndex(group);
        for (let i = c; i < this.buffer.length; i += 4) this.buffer[i] = 255;
        this.dirty = true;
    }

    private static channelIndex(group: number): number {
        return Math.min(3, Math.max(0, Math.floor(group || 0)));
    }

    /** Rect world của 1 target: ưu tiên AABB của Collider2D, không có thì dùng UITransform. */
    public static getTargetWorldRect(node: any): Rect | null {
        // Tự tính từ hình collider (không phụ thuộc physics đã step hay chưa)
        const col = node.getComponent(Collider2D) as any;
        if (col) {
            let local: { x: number; y: number }[] = [];
            const off = col.offset || { x: 0, y: 0 };
            if (col.size) {
                const hw = col.size.width / 2, hh = col.size.height / 2;
                local = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
            } else if (col.points && col.points.length > 0) {
                local = col.points.map((p: any) => ({ x: p.x, y: p.y }));
            } else if (typeof col.radius === 'number') {
                const r = col.radius;
                local = [{ x: -r, y: -r }, { x: r, y: r }];
            }
            if (local.length > 0) {
                const m = node.worldMatrix;
                const v = new Vec3();
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const p of local) {
                    v.set(p.x + off.x, p.y + off.y, 0);
                    Vec3.transformMat4(v, v, m);
                    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
                    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
                }
                return new Rect(minX, minY, maxX - minX, maxY - minY);
            }
        }
        const ui = node.getComponent(UITransform);
        return ui ? ui.getBoundingBoxToWorld() : null;
    }

    private toPixelRect(rect: Rect): { x0: number; x1: number; y0: number; y1: number } | null {
        this.updateArea();
        const a = this.area;
        if (a.width <= 0 || a.height <= 0) return null;
        const x0 = Math.max(0, Math.floor((rect.x - a.x) / a.width * this.texW));
        const x1 = Math.min(this.texW - 1, Math.ceil((rect.x + rect.width - a.x) / a.width * this.texW));
        const y0 = Math.max(0, Math.floor((rect.y - a.y) / a.height * this.texH));
        const y1 = Math.min(this.texH - 1, Math.ceil((rect.y + rect.height - a.y) / a.height * this.texH));
        if (x0 > x1 || y0 > y1) return null;
        return { x0, x1, y0, y1 };
    }

    protected lateUpdate(): void {
        if (!this.material || !this.skeleton) return;
        this.updateArea();

        if (this.dirty && this.maskTex && this.buffer) {
            this.maskTex.uploadData(this.buffer);
            this.dirty = false;
        }

        // sp.Skeleton sinh material instance riêng theo blend mode từ customMaterial -> set cho tất cả
        this.applyProps(this.material);
        const cache = (this.skeleton as any)._materialCache;
        if (cache) {
            for (const k in cache) this.applyProps(cache[k]);
        }
        const count = (this.skeleton as any).materials ? (this.skeleton as any).materials.length : 0;
        for (let i = 0; i < count; i++) {
            this.applyProps((this.skeleton as any).getMaterialInstance ? (this.skeleton as any).getRenderMaterial?.(i) : null);
        }
    }

    protected onDestroy(): void {
        if (this.maskTex) {
            this.maskTex.destroy();
            this.maskTex = null;
        }
    }
}
