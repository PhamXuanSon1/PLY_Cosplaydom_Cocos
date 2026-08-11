import { _decorator, Component, Node, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DrawItemMovement')
export class DrawItemMovement extends Component {

    @property
    public SpawnPos: Vec3 = new Vec3();

    @property
    public SpawnLocalPos: Vec3 = new Vec3();

    public originalParent: Node | null = null;
    public originalSiblingIndex: number = 0;
    public originalLayer: number = 0;

    // Layer gốc của chính node này VÀ tất cả node con. Mỗi node có thể nằm ở Layer khác nhau
    // (VD: node cha ở Layer của ParticleCam, node con chứa Sprite ở UI_2D của UICam),
    // nên khi thả tay phải trả lại từng Layer riêng, không được gán chung 1 Layer cho cả cây.
    public originalLayers: Map<Node, number> = new Map<Node, number>();

    protected onLoad(): void {
        // Lưu vị trí, Node cha, thứ tự hiển thị và Layer ban đầu của item
        this.UpdateSpawnPos();
    }

    public UpdateSpawnPos(): void {
        this.SpawnPos = this.node.worldPosition.clone();
        this.SpawnLocalPos = this.node.position.clone();
        this.originalParent = this.node.parent;
        this.originalSiblingIndex = this.node.getSiblingIndex();
        this.originalLayer = this.node.layer;
    }

    /** Lưu Layer gốc của node và toàn bộ node con. Gọi TRƯỚC khi đổi Layer sang DragLayer/Canvas. */
    public CaptureLayers(): void {
        this.originalLayers.clear();
        this.collectLayers(this.node);
    }

    private collectLayers(node: Node): void {
        this.originalLayers.set(node, node.layer);
        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            this.collectLayers(children[i]);
        }
    }

    /** Trả lại Layer gốc cho từng node đã lưu ở CaptureLayers(). */
    public RestoreLayers(): void {
        this.originalLayers.forEach((layer, node) => {
            if (node && node.isValid) {
                node.layer = layer;
            }
        });
    }

    public GoToSpawn(): void {
        // Di chuyển item về vị trí ban đầu và khôi phục lại Node cha cũ & thứ tự SiblingIndex
        if (this.originalParent && this.node.parent !== this.originalParent) {
            this.node.setParent(this.originalParent, true);
        }
        this.node.setPosition(this.SpawnLocalPos);
        if (this.node.parent) {
            this.node.setSiblingIndex(this.originalSiblingIndex);
        }
        // Trả lại Layer gốc (nếu đã bị đổi sang Layer của DragLayer/Canvas lúc cầm lên)
        this.RestoreLayers();
    }
}
