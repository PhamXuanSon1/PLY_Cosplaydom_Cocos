import { _decorator, Component } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DipTarget')
export class DipTarget extends Component {

    @property({
        group: { name: '1. Basic Info', id: 'basicInfo' },
        displayName: 'Is Open',
        tooltip: "Đánh dấu xem hộp phấn/màu này đã được mở nắp chưa. Nếu chưa mở thì cọ không thể nhúng vào được."
    })
    public isOpen: boolean = false;

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
