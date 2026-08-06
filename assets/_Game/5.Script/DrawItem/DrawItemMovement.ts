import { _decorator, Component, Node, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DrawItemMovement')
export class DrawItemMovement extends Component {

    @property({
        type: Vec3
    })
    public SpawnPos: Vec3 = new Vec3();

    @property({
        type: Vec3
    })
    public SpawnLocalPos: Vec3 = new Vec3();

    protected onLoad(): void {
        // Lưu vị trí ban đầu của item để sử dụng khi cần reset
        // Dùng onLoad thay vì start để tránh bị ảnh hưởng bởi các hiệu ứng bay Tween
        this.UpdateSpawnPos();
    }

    public UpdateSpawnPos(): void {
        this.SpawnPos = this.node.worldPosition.clone();
        this.SpawnLocalPos = this.node.position.clone();
    }

    public GoToSpawn(): void {
        // Di chuyển item về vị trí ban đầu
        this.node.setPosition(this.SpawnLocalPos);
    }
}
