import { _decorator, Component, EventHandler } from 'cc';
import { FxType, Ply_SoundManager } from '../ScriptTemplate/Ply_SoundManager';
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
        group: { name: '2. On Dip', id: 'onDip' },
        displayName: 'Play FX On Dip',
        tooltip: 'Phát 1 âm thanh khi cọ/item chấm trúng hộp này.'
    })
    public playFxOnDip: boolean = false;

    @property({
        type: FxType,
        group: { name: '2. On Dip', id: 'onDip' },
        displayName: 'Dip FX Type',
        tooltip: 'Loại âm thanh phát khi chấm trúng.',
        visible(this: DipTarget) { return this.playFxOnDip; }
    })
    public dipFxType: FxType = FxType.Pop;

    @property({
        type: [EventHandler],
        group: { name: '2. On Dip', id: 'onDip' },
        displayName: 'On Dip Event',
        tooltip: 'Chạy khi có item chấm trúng hộp này.'
    })
    public onDipEvent: EventHandler[] = [];

    /** Được DrawInputManager gọi khi 1 item DipAndDraw chấm trúng hộp này. */
    public onDipped(): void {
        if (this.playFxOnDip && Ply_SoundManager.Ins) {
            Ply_SoundManager.Ins.playFx(this.dipFxType);
        }
        EventHandler.emitEvents(this.onDipEvent, this);
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
