import { _decorator, Component, Node, 
    Vec2, EventTouch } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DragAndDrop')
export class DragAndDrop extends Component {

    @property(Node)
    targetNode: Node | null = null;


    start() {
        // lấy vị trí ban đầu của Node
        console.log("vị trí đầu tiên:" + this.node.position);
    }

    update(deltaTime: number) {
        
    }

    // NODE: giống như obj trong Unity, là 1 đối tượng trong scene, có thể chứa nhiều component khác nhau


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
    }
    private onTouchCancel(event: EventTouch) {
        // Lấy vị trí khi thao tác bị gián đoạn
        const touchPosition = event.getLocation();
        console.log('Touch Cancel at: ', touchPosition);
    }

}


