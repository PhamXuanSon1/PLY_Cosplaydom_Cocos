import { _decorator, Component, EventHandler } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DipTarget')
export class DipTarget extends Component {

    @property({
        group: { name: '1. Basic Info', id: 'basicInfo' },
        displayName: 'Is Open',
        tooltip: "Đánh dấu xem hộp phấn/màu này đã được mở nắp chưa. Nếu chưa mở thì cọ không thể nhúng vào được."
    })
    public isOpen: boolean = false;

    @property({
        type: [EventHandler],
        group: { name: '2. Events', id: 'events' },
        displayName: 'On Dip Event',
        tooltip: 'Các event được gọi mỗi khi cọ nhúng vào hộp này thành công (VD: bật FX, play anim, sound...)'
    })
    public OnDipEvent: EventHandler[] = [];

    /** Gọi bởi DrawInputManager khi cọ nhúng thành công. */
    public emitDipEvent(): void {
        EventHandler.emitEvents(this.OnDipEvent);
    }

    /**
     * Hàm này dùng để gọi trong OnCompleteEvent của nắp hộp phấn
     */
    public openBox(): void {
        this.isOpen = true;
    }

    public OpenBox(): void {
        this.openBox();
    }

    /**
     * Tuỳ chọn: Hàm dùng để đóng lại nếu cần
     */
    public closeBox(): void {
        this.isOpen = false;
    }

    public CloseBox(): void {
        this.closeBox();
    }
}
