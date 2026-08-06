import { _decorator, CCBoolean, Component, Node, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DrawItemGraphic')
export class DrawItemGraphic extends Component {

    @property({
        type: Vec3
    })
    public SpawnRotation: Vec3;

    @property({
        type: Vec3
    })
    public DragRotation: Vec3;


    @property({
        type: CCBoolean,
        group: { name: "Scale Setup" },
        tooltip: "Bật nếu muốn vật phẩm to ra/nhỏ lại khi cầm lên"
    })
    public enableScaleOnDrag: boolean = false;


    @property({
        type: Number,
        group: { name: "Scale Setup" },
        tooltip: "Tỷ lệ Scale khi kéo (Ví dụ: 1.2 là to lên 20%)"
    })
    public dragScaleMultiplier: number = 1.2;

    public SpawnScale: Vec3;

    protected start(): void {
        // lưu góc quay ban đầu
        this.SpawnRotation = this.node.eulerAngles.clone();

        // lưu lại scale ban đầu nếu bật scale on drag
        if (this.enableScaleOnDrag) {
            this.SpawnScale = this.node.scale.clone();
        }
    }
}


