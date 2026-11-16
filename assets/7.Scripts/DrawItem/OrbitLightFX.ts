import { _decorator, Component, Node, Vec3, Graphics, Color, UITransform } from 'cc';
const { ccclass, property } = _decorator;

interface TrailPoint {
    world: Vec3;
    depth: number; // +1 = phía trước mặt, -1 = sau đầu
    time: number;
}

/**
 * Hiệu ứng ánh sáng bay vòng quanh đầu nhân vật kiểu 3D (giả lập chiều sâu trên 2D).
 *
 * - Sao sáng (comet) bay theo quỹ đạo xoắn ốc quanh tâm (node gắn script), mỗi vòng cao dần lên.
 * - Vệt sáng được vẽ TỪNG ĐOẠN lên 2 lớp Graphics:
 *     + Front Layer (nằm SAU nhân vật trong hierarchy -> vẽ đè lên mặt) cho đoạn ở phía trước,
 *     + Back Layer  (nằm TRƯỚC nhân vật trong hierarchy -> bị đầu che) cho đoạn ở phía sau,
 *   nên một vệt có thể vừa che mặt vừa chui ra sau đầu như 3D thật.
 * - Phía trước: sao to, vệt dày. Phía sau: sao nhỏ, vệt mảnh, mờ hơn.
 * - Hết vòng: bay vút lên `endOffset` rồi tắt, vệt tự mờ dần.
 *
 * Gọi `play()` từ EventHandler (VD: On Complete Event của item).
 */
@ccclass('OrbitLightFX')
export class OrbitLightFX extends Component {
    @property({ type: Node, tooltip: 'Node sao sáng (Sprite). Tự đổi cha giữa Front/Back Layer theo độ sâu.' })
    public comet: Node | null = null;

    @property({ type: Node, tooltip: 'Lớp vẽ phía TRƯỚC (có Graphics). Đặt sau nhân vật trong hierarchy để vẽ đè lên mặt.' })
    public frontLayer: Node | null = null;

    @property({ type: Node, tooltip: 'Lớp vẽ phía SAU (có Graphics). Đặt trước nhân vật trong hierarchy để bị đầu che.' })
    public backLayer: Node | null = null;

    @property({ type: Node, tooltip: 'Node neo nằm TRONG nhân vật (VD: con của SharkManSpine tại miệng). Mỗi frame node này + 2 lớp vẽ sẽ copy vị trí/scale của neo, để vòng sáng luôn bám mặt kể cả khi animation zoom/di chuyển nhân vật.' })
    public followTarget: Node | null = null;

    @property({ tooltip: 'Bán kính ngang của quỹ đạo' })
    public radiusX: number = 280;

    @property({ tooltip: 'Độ nghiêng vòng: phía trước thấp hơn, phía sau cao hơn bấy nhiêu' })
    public tiltY: number = 40;

    @property({ tooltip: 'Độ cao bắt đầu (vòng đầu, so với tâm)' })
    public startY: number = 0;

    @property({ tooltip: 'Độ cao kết thúc (vòng cuối, so với tâm)' })
    public endY: number = 150;

    @property({ tooltip: 'Số vòng bay' })
    public laps: number = 2;

    @property({ tooltip: 'Thời gian bay vòng (giây)' })
    public duration: number = 1.6;

    @property({ tooltip: 'Góc bắt đầu (độ). 180 = bên trái, 270 = phía trước' })
    public startAngle: number = 200;

    @property({ tooltip: 'Scale sao khi ở gần nhất (phía trước)' })
    public scaleFront: number = 1.25;

    @property({ tooltip: 'Scale sao khi ở xa nhất (phía sau)' })
    public scaleBack: number = 0.5;

    @property({ tooltip: 'Độ dày vệt sáng phía trước' })
    public strokeFront: number = 120;

    @property({ tooltip: 'Độ dày vệt sáng phía sau' })
    public strokeBack: number = 35;

    @property({ tooltip: 'Điểm sao bay lên cuối cùng (so với tâm)' })
    public endOffset: Vec3 = new Vec3(0, 385, 0);

    @property({ tooltip: 'Thời gian bay lên cuối (giây)' })
    public endDuration: number = 0.25;

    @property({ tooltip: 'Tốc độ xoay của sao (độ/giây)' })
    public spinSpeed: number = 540;

    @property({ tooltip: 'Độ dài vệt sáng (giây)' })
    public trailTime: number = 0.3;

    @property({ tooltip: 'Độ đậm tổng của vệt sáng (0..1). Nhỏ = trong suốt nhẹ hơn.' })
    public trailAlpha: number = 0.7;

    @property({ tooltip: 'Màu lõi vệt sáng' })
    public coreColor: Color = new Color(255, 212, 50, 255);

    @property({ tooltip: 'Màu quầng sáng bao quanh vệt' })
    public glowColor: Color = new Color(255, 238, 150, 255);

    private _time = -1;
    private _points: TrailPoint[] = [];
    private _lastOrbitPos = new Vec3();
    private _local = new Vec3();
    private _world = new Vec3();
    private _color = new Color();
    private _frontG: Graphics | null = null;
    private _backG: Graphics | null = null;

    protected onLoad(): void {
        this._frontG = this.frontLayer ? this.frontLayer.getComponent(Graphics) : null;
        this._backG = this.backLayer ? this.backLayer.getComponent(Graphics) : null;
        for (const g of [this._frontG, this._backG]) {
            if (!g) continue;
            g.lineCap = Graphics.LineCap.ROUND;
            g.lineJoin = Graphics.LineJoin.ROUND;
        }
        if (this.comet) this.comet.active = false;
    }

    /** Cho node này và 2 lớp vẽ bám theo neo (vị trí + scale world). */
    private syncToTarget(): void {
        const t = this.followTarget;
        if (!t || !t.isValid) return;
        const wp = t.worldPosition, ws = t.worldScale;
        for (const n of [this.node, this.frontLayer, this.backLayer]) {
            if (!n) continue;
            n.setWorldPosition(wp);
            n.setWorldScale(ws.x, ws.y, 1);
        }
    }

    public play(): void {
        this.syncToTarget();
        this._time = 0;
        this._points.length = 0;
        if (this.comet) {
            this.comet.active = true;
            this.comet.angle = 0;
        }
        this.clearGraphics();
    }

    public Play(): void {
        this.play();
    }

    /** Vị trí local (so với node này) + độ sâu tại thời điểm t. null = đã bay xong. */
    private sample(t: number, out: Vec3): number | null {
        if (t <= this.duration) {
            const p = this.duration > 0 ? t / this.duration : 1;
            return this.orbitAt(p, out);
        }
        const k = (t - this.duration) / Math.max(0.0001, this.endDuration);
        if (k > 1) return null;
        const start = new Vec3();
        this.orbitAt(1, start);
        Vec3.lerp(out, start, this.endOffset, k * k);
        return 1;
    }

    private orbitAt(p: number, out: Vec3): number {
        const theta = (this.startAngle + 360 * this.laps * p) * Math.PI / 180;
        const depth = -Math.sin(theta);
        out.set(this.radiusX * Math.cos(theta), this.startY + (this.endY - this.startY) * p - this.tiltY * depth, 0);
        return depth;
    }

    private k(depth: number): number {
        return (Math.max(-1, Math.min(1, depth)) + 1) / 2;
    }

    protected update(dt: number): void {
        if (this._time < 0 && this._points.length === 0) return;
        this.syncToTarget();
        const ut = this.getComponent(UITransform);
        if (!ut) return;

        if (this._time >= 0) {
            const prevT = this._time;
            this._time += dt;
            const depth = this.sample(this._time, this._local);
            if (depth === null) {
                this._time = -1;
                if (this.comet) this.comet.active = false;
            } else {
                // Chèn thêm điểm giữa 2 frame để vệt cong mượt
                const sub = 3;
                for (let i = 1; i <= sub; i++) {
                    const tt = prevT + (this._time - prevT) * i / sub;
                    const p = new Vec3();
                    const d = this.sample(tt, p);
                    if (d === null) break;
                    const w = new Vec3();
                    ut.convertToWorldSpaceAR(p, w);
                    this._points.push({ world: w, depth: d, time: tt });
                }
                ut.convertToWorldSpaceAR(this._local, this._world);
                this.updateComet(depth, dt);
            }
        }

        // Thời điểm hiện tại của vệt: sau khi sao tắt thì vệt tiếp tục già đi và mờ hết
        const now = this._time >= 0 ? this._time : this.ageAfterEnd(dt);
        while (this._points.length > 0 && now - this._points[0].time > this.trailTime) this._points.shift();
        this.drawTrail(now);
    }

    private _endClock = 0;
    private ageAfterEnd(dt: number): number {
        if (this._points.length === 0) return 0;
        if (this._endClock < this._points[this._points.length - 1].time) this._endClock = this._points[this._points.length - 1].time;
        this._endClock += dt;
        return this._endClock;
    }

    private updateComet(depth: number, dt: number): void {
        const comet = this.comet;
        if (!comet) return;
        const parent = depth >= 0 ? this.frontLayer : this.backLayer;
        if (parent && comet.parent !== parent) comet.setParent(parent, false);
        const put = comet.parent ? comet.parent.getComponent(UITransform) : null;
        if (put) comet.setPosition(put.convertToNodeSpaceAR(this._world));
        const inEnd = this._time > this.duration;
        const endK = inEnd ? Math.min(1, (this._time - this.duration) / Math.max(0.0001, this.endDuration)) : 0;
        const s = (this.scaleBack + (this.scaleFront - this.scaleBack) * this.k(depth)) * (1 - 0.6 * endK);
        comet.setScale(s, s, 1);
        comet.angle += this.spinSpeed * dt;
    }

    private clearGraphics(): void {
        if (this._frontG) this._frontG.clear();
        if (this._backG) this._backG.clear();
    }

    private drawTrail(now: number): void {
        this.clearGraphics();
        const pts = this._points;
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            const fade = 1 - Math.min(1, Math.max(0, (now - b.time) / this.trailTime));
            if (fade <= 0.02) continue;
            const depth = (a.depth + b.depth) / 2;
            const front = depth >= 0;
            const g = front ? this._frontG : this._backG;
            if (!g) continue;
            const gut = g.getComponent(UITransform);
            if (!gut) continue;
            const pa = gut.convertToNodeSpaceAR(a.world);
            const pb = gut.convertToNodeSpaceAR(b.world);
            const k = this.k(depth);
            const w = (this.strokeBack + (this.strokeFront - this.strokeBack) * k) * (0.2 + 0.8 * fade);
            const alpha = fade * (0.55 + 0.45 * k) * this.trailAlpha;
            this.seg(g, pa, pb, w * 1.9, this.glowColor, 0.25 * alpha);
            this.seg(g, pa, pb, w, this.coreColor, 0.95 * alpha);
            this.seg(g, pa, pb, w * 0.35, Color.WHITE, 0.9 * alpha);
        }
    }

    private seg(g: Graphics, a: Vec3, b: Vec3, width: number, color: Color, alpha: number): void {
        this._color.set(color.r, color.g, color.b, Math.round(255 * Math.max(0, Math.min(1, alpha))));
        g.lineWidth = width;
        g.strokeColor = this._color;
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
    }
}
