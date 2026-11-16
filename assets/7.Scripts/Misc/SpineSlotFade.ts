import { _decorator, Component, CCString } from 'cc';
import { Character } from '../SpineScript/Character';
const { ccclass, property } = _decorator;

/**
 * Bật / tắt mờ dần các slot Spine của nhân vật.
 * - fadeIn(): bật attachment (qua Character nên được giữ cố định) rồi tăng alpha 0 -> 1.
 * - fadeOut(): giảm alpha 1 -> 0 rồi tắt attachment.
 * Gọi được từ EventHandler hoặc Animation Event (đặt component này cùng node với Animation).
 * VD: bật "makeup_conclear" để nhân vật hết nếp nhăn sau khi uống nước tăng lực.
 */
@ccclass('SpineSlotFade')
export class SpineSlotFade extends Component {
    @property({ type: Character, tooltip: 'Character của nhân vật Spine (VD: SharkManSpine)' })
    public character: Character | null = null;

    @property({ type: [CCString], tooltip: 'Tên các slot cần bật/tắt (VD: makeup_conclear)' })
    public slotNames: string[] = [];

    @property({ type: [CCString], tooltip: 'Tên attachment tương ứng từng slot. Để trống = trùng tên slot.' })
    public attachmentNames: string[] = [];

    @property({ tooltip: 'Thời gian mờ dần (giây)' })
    public duration: number = 0.8;

    private _time = -1;
    private _from = 0;
    private _to = 1;
    private _turnOffAtEnd = false;

    public fadeIn(): void {
        if (!this.character) return;
        for (let i = 0; i < this.slotNames.length; i++) {
            const slot = this.slotNames[i];
            if (!slot) continue;
            const att = this.attachmentNames[i] && this.attachmentNames[i].trim() !== '' ? this.attachmentNames[i] : slot;
            this.character.turnSlotAttachment(slot, att);
        }
        this.start_(0, 1, false);
    }

    public fadeOut(): void {
        this.start_(1, 0, true);
    }

    private start_(from: number, to: number, turnOff: boolean): void {
        this._from = from;
        this._to = to;
        this._turnOffAtEnd = turnOff;
        this._time = 0;
        this.setAlpha(from);
        if (this.duration <= 0) this.finish();
    }

    protected update(dt: number): void {
        if (this._time < 0) return;
        this._time += dt;
        const k = Math.min(1, this._time / this.duration);
        const e = k * k * (3 - 2 * k); // smoothstep
        this.setAlpha(this._from + (this._to - this._from) * e);
        if (k >= 1) this.finish();
    }

    private finish(): void {
        this._time = -1;
        this.setAlpha(this._to);
        if (this._turnOffAtEnd && this.character) {
            for (const slot of this.slotNames) if (slot) this.character.turnSlotAttachment(slot, null);
            this.setAlpha(1); // trả alpha về 1 để lần bật sau hiển thị đúng
        }
    }

    private setAlpha(a: number): void {
        const skel = this.character ? this.character.spineSkeleton : null;
        if (!skel) return;
        for (const name of this.slotNames) {
            if (!name) continue;
            const slot: any = skel.findSlot(name);
            if (slot && slot.color) slot.color.a = a;
        }
    }
}
