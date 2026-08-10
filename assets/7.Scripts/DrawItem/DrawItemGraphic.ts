import { _decorator, Component, Node, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DrawItemGraphic')
export class DrawItemGraphic extends Component {

    @property
    public SpawnRotation: Vec3 = new Vec3();

    @property
    public DragRotation: Vec3 = new Vec3();

    @property({
        group: { name: "Scale Setup" },
        tooltip: "Bật nếu muốn vật phẩm to ra/nhỏ lại khi cầm lên"
    })
    public enableScaleOnDrag: boolean = false;

    @property({
        group: { name: "Scale Setup" },
        tooltip: "Tỷ lệ Scale khi kéo (Ví dụ: 1.2 là to lên 20%)"
    })
    public dragScaleMultiplier: number = 1.2;

    @property({
        group: { name: "Scale Setup" },
        tooltip: "Thời gian tween phóng to/thu nhỏ (giây). Càng nhỏ càng nhanh. Ví dụ: 0.1 = nhanh, 0.2 = mặc định"
    })
    public dragScaleDuration: number = 0.1;

    /** Scale tuyệt đối trong world space lúc spawn (dùng để tính lại local scale đúng dù node có bị đổi parent tạm thời khi kéo). */
    public SpawnWorldScale: Vec3 = new Vec3();

    private _baselineCaptured: boolean = false;

    protected start(): void {
        // Chỉ lưu góc quay ban đầu. KHÔNG lưu scale ở đây vì start() không chạy nếu node đang tắt lúc load map,
        // và node gắn component này có thể khác node bị kéo. Baseline scale được lưu lúc cầm item lên (CaptureBaseline).
        this.SpawnRotation = this.node.eulerAngles.clone();
    }

    /**
     * Lưu scale gốc (lúc item nằm yên ở chỗ spawn) để sau này trả về cho đúng. Chỉ lưu 1 lần,
     * và PHẢI gọi TRƯỚC khi item bị đổi parent sang DragLayer/Canvas.
     * targetNode: node thật sự bị kéo (có thể khác node gắn component này).
     */
    public CaptureBaseline(targetNode: Node | null = null): void {
        if (this._baselineCaptured) return;
        this.SpawnWorldScale = (targetNode || this.node).worldScale.clone();
        this._baselineCaptured = true;
    }
}
