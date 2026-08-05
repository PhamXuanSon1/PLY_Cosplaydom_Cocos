import { _decorator, Component, Node, 
    Vec2, EventTouch, 
    Vec3, tween, Tween,
    easing, CCFloat} from 'cc';
const { ccclass, property } = _decorator;

    // NODE: giống như obj trong Unity, là 1 đối tượng trong scene, có thể chứa nhiều component khác nhau
    // mọi node trong cocos đều là Vec3 


@ccclass('DragAndDrop')
export class DragAndDrop extends Component {

    @property(Vec3)
    SpawnPos: Vec3 = new Vec3();

    @property(Node)
    targetNode: Node | null = null;

    @property({type: CCFloat, displayName:"Khoảng cách tối thiểu để bay đến target Node"})
    minDistance: number = 50;


    start() {

        // .clone() tạo bản sao độc lập, giúp SpawnPos giữ nguyên vị trí ban đầu dù Node có di chuyển sau này
        // nếu ko dùng clone SpawnPos sẽ trỏ chung ô nhớ với this.node.position
        // -> Khi kéo Node di chuyển, SpawnPos cũng bị biến đổi theo và mất vị trí mốc ban đầu!
        this.SpawnPos = this.node.position.clone(); 

        // lấy vị trí ban đầu của Node
        console.log("vị trí đầu tiên:" + this.node.position);
    }

    update(deltaTime: number) {
        
    }



    public onEnable(): void {
        // Lắng nghe sự kiện bắt đầu chạm/click vào Node
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);

        // Lắng nghe sự kiện khi giữ và di chuyển ngón tay/con trỏ chuột
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);

        // Lắng nghe sự kiện khi nhấc ngón tay/thả chuột ra khỏi Node
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);

        // Lắng hệ sự kiện khi thao tác kéo bị gián đoạn (ví dụ: bị cuộc gọi đến, bị vuốt ra ngoài màn hình...)
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
    }


    private onTouchStart(event: EventTouch) {
        // Lấy vị trí chạm/click ban đầu
        const touchPosition = event.getLocation();
        console.log('Touch Start at: ', touchPosition);
    }

    private onTouchMove(event: EventTouch) {
        // 1: lấy độ lệch = getUIDelta() (lấy vị trí hiện tại - vị trí trước đó)
        const delta = event.getUIDelta();

        // 2: lấy vị trí hiện tại của Node
        const currentPos = this.node.position;

        // 3: tính toán vị trí mới = vị trí hiện tại + độ lệch
        const newX = currentPos.x + delta.x;
        const newY = currentPos.y + delta.y;

        // 4: cập nhật vị trí mới cho Node
        this.node.setPosition(newX, newY);
    }

    private onTouchEnd(event: EventTouch) {
        // Lấy vị trí khi nhấc ngón tay/thả chuột
        const touchPosition = event.getLocation();
        console.log('Touch End at: ', touchPosition);
        this.SnapToTarget();
    }

    private onTouchCancel(event: EventTouch) {
        // Lấy vị trí khi thao tác bị gián đoạn
        const touchPosition = event.getLocation();
        console.log('Touch Cancel at: ', touchPosition);
    }

    private SnapToTarget() {
        // nếu mà vị trí hiện tại các vị trí target Node 2f thì bay về vị trí SpawnPos
        const distance = Vec3.distance(this.node.position, this.targetNode!.position);
        if(distance < this.minDistance){
            console.log("bay đến target Node"); 
            tween(this.node)
                .to(0.2, { position: this.targetNode!.position }, { easing: easing.smooth }) // easing.smooth là hiệu ứng mượt mà khi di chuyển
                .start();
        }  else {
            console.log("bay về vị trí SpawnPos");
                        tween(this.node)
                .to(0.5, { position: this.SpawnPos }, { easing: easing.smooth }) // easing.smooth là hiệu ứng mượt mà khi di chuyển
                .start();
        }
    }

}