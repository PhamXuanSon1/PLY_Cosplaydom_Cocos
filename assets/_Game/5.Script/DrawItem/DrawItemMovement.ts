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

    public GoToSpawn(): void {
        // Di chuyển item về vị trí ban đầu và khôi phục lại Node cha cũ & thứ tự SiblingIndex
        if (this.originalParent && this.node.parent !== this.originalParent) {
            this.node.setParent(this.originalParent, true);
        }
        this.node.setPosition(this.SpawnLocalPos);
        if (this.node.parent) {
            this.node.setSiblingIndex(this.originalSiblingIndex);
        }
    }
}
