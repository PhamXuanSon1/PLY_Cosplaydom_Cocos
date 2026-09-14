import { _decorator, Component, Node, sp } from "cc";
import { Character } from "./Character";
const { ccclass, property } = _decorator;

@ccclass("EmotonSlotConfig")
export class EmotonSlotConfig {

    @property({ tooltip: "Tên Slot trên Spine (VD: Set_P1_Mouth)" })
    public slotName: string = "";

    @property({
        tooltip: "Tên Attachment muốn đổi thành khi cười (VD: Base/mouth smile)",
    })

    public targetAttachmentName: string = "";
    @property({
        tooltip:
            "CHỈ ĐỔI SANG MẶT CƯỜI NẾU rãnh này đang hiển thị Attachment này (VD: Base/dry mouth 3). Để trống nếu muốn luôn đổi.",
    })

    public requiredCurrentAttachment: string = "";
    @property({
        tooltip:
            "Tên Attachment gốc để quay về sau khi cười. Nếu để trống, code sẽ tự lấy Attachment đang mặc định lúc đó.",
    })
    public defaultAttachmentName: string = "";
}

@ccclass("SpineEmotionController")
export class SpineEmotionController extends Component {
    @property({ type: sp.Skeleton, tooltip: "Spine skeleton component để thay đổi attachment" })
    public skeletonAnimation: sp.Skeleton | null = null;

    @property({ tooltip: "Tên animation cười trong Spine (VD: Happy)" })
    public happyAnimationName: string = "happy";

    @property({ tooltip: "Tên animation tức giận trong Spine (VD: Angry)" })
    public angryAnimationName: string = "angry";

    @property({ tooltip: "Chỉ số track animation để thay đổi" })
    public animationTrack: number = 1;

    @property({ tooltip: "Thời gian hiển thị cảm xúc" })
    public emotionDuration: number = 1.0;

    @property({ type: [EmotonSlotConfig], tooltip: "Danh sách các cặp slot và attachment để thay đổi khi cười" })
    public smileSlots: EmotonSlotConfig[] = [];

    @property({ type: [EmotonSlotConfig], tooltip: "Danh sách các cặp slot và attachment để thay đổi khi tức giận" })
    public angrySlots: EmotonSlotConfig[] = [];

    @property({ tooltip: "Tên animation mặc định (idle) để quay về sau cảm xúc. Nếu để trống, code sẽ tự lấy animation đang chạy trước đó." })
    public defaultAnimationName: string = "";

    private charComponent: Character | null = null;
    private _originalAnimName: string = "";

    // Spine WASM (4.x) chỉ expose getter dạng hàm (getName/getAnimation/getAttachment),
    // bản JS (3.8) expose property. Helper này đọc được cả hai.
    private static readProp(obj: any, prop: string, getter: string): any {
        if (!obj) return undefined;
        const direct = obj[prop];
        if (direct !== undefined && direct !== null) return direct;
        if (typeof obj[getter] === 'function') {
            try { return obj[getter](); } catch (e) { return undefined; }
        }
        return undefined;
    }

    private static getCurrentAnimName(entry: any): string {
        const anim = SpineEmotionController.readProp(entry, 'animation', 'getAnimation');
        const name = SpineEmotionController.readProp(anim, 'name', 'getName');
        return typeof name === 'string' ? name : '';
    }

    private getSlotAttachmentName(slotName: string): string | null {
        if (!this.skeletonAnimation) return null;
        const runtimeSkeleton = (this.skeletonAnimation as any)._skeleton;
        let slot: any = null;
        if (runtimeSkeleton && typeof runtimeSkeleton.findSlot === 'function') slot = runtimeSkeleton.findSlot(slotName);
        if (!slot && typeof (this.skeletonAnimation as any).findSlot === 'function') slot = (this.skeletonAnimation as any).findSlot(slotName);
        if (!slot) return undefined as any; // slot không tồn tại
        const att = SpineEmotionController.readProp(slot, 'attachment', 'getAttachment');
        if (!att) return null;
        const name = SpineEmotionController.readProp(att, 'name', 'getName');
        return typeof name === 'string' ? name : null;
    }

    start() {
        if (!this.skeletonAnimation) {
            this.skeletonAnimation = this.getComponent(sp.Skeleton);
        }
        this.charComponent = this.getComponent(Character);

        // Lưu animation ban đầu (thường là idle)
        if (this.skeletonAnimation) {
            const name = SpineEmotionController.getCurrentAnimName(this.skeletonAnimation.getCurrent(0));
            if (name) this._originalAnimName = name;
        }
    }

    public PlayHappyAnim(): void {
        this.EmotionRoutine(this.happyAnimationName, this.smileSlots);
    }
    public PlayAngryAnim(): void {
        this.EmotionRoutine(this.angryAnimationName, this.angrySlots);
    }

    public EmotionRoutine(animName: string, slots: EmotonSlotConfig[]): void {
        if (!this.skeletonAnimation || !this.charComponent) return;

        // Lưu lại animation đang chạy ở track 0 trước khi chuyển sang emotion
        const currentName = SpineEmotionController.getCurrentAnimName(this.skeletonAnimation.getCurrent(0));
        if (currentName) this._originalAnimName = currentName;

        const revertAnimName = (this.defaultAnimationName && this.defaultAnimationName.trim() !== "")
            ? this.defaultAnimationName
            : this._originalAnimName;

        const revertActions: (() => void)[] = []; // Mảng lưu các hành động để quay về trạng thái ban đầu

        for (const slotConfig of slots) {
            const currentAttachmentName = this.getSlotAttachmentName(slotConfig.slotName); // undefined = không có slot, null = slot đang tắt

            if (currentAttachmentName === undefined) {
                console.warn(`Không tìm thấy slot: ${slotConfig.slotName}`);
                continue;
            }

            //nếu requiredCurrentAttachment được đặt và attachment hiện tại không khớp, bỏ qua slot này
            if (slotConfig.requiredCurrentAttachment && slotConfig.requiredCurrentAttachment.trim() !== ""
                && currentAttachmentName !== slotConfig.requiredCurrentAttachment) {
                console.log(`Slot ${slotConfig.slotName} đang là '${currentAttachmentName}', không khớp '${slotConfig.requiredCurrentAttachment}'. Bỏ qua.`);
                continue;
            } else {
                if (!currentAttachmentName) continue; // Nếu không có attachment hiện tại, bỏ qua slot này
            }

            const revertTo = (!slotConfig.defaultAttachmentName || slotConfig.defaultAttachmentName.trim() === "")
                ? currentAttachmentName  // Nếu không có defaultAttachmentName, revert về attachment hiện tại
                : slotConfig.defaultAttachmentName;

            // Đổi attachment sang biểu cảm mới & lưu lại action hoàn tác
            if (this.charComponent) {
                this.charComponent.turnSlotAttachment(slotConfig.slotName, slotConfig.targetAttachmentName);
                revertActions.push(() => {
                    // bật lại skin
                    this.charComponent.turnSlotAttachment(slotConfig.slotName, revertTo);
                })
            } else {
                this.skeletonAnimation.setAttachment(slotConfig.slotName, slotConfig.targetAttachmentName);
                revertActions.push(() => {
                    // bật lại skin
                    this.skeletonAnimation.setAttachment(slotConfig.slotName, revertTo);
                })
            }
        }

        if (animName && animName !== "") {
            // Chạy animation cảm xúc (happy/angry) KHÔNG loop
            const entry = this.skeletonAnimation.setAnimation(this.animationTrack, animName, false);

            // Khi animation emotion chạy xong → tự động quay về animation ban đầu
            if (entry) {
                this.skeletonAnimation.setTrackCompleteListener(entry, () => {
                    if (revertAnimName && revertAnimName !== "") {
                        this.skeletonAnimation.setAnimation(this.animationTrack, revertAnimName, true);
                        console.log(`[SpineEmotion] Animation '${animName}' xong → Quay về '${revertAnimName}'`);
                    } else {
                        this.skeletonAnimation.clearTrack(this.animationTrack);
                    }
                });
            }
        }

        // Đợi sau khoảng thời gian emotionDuration thì hoàn tác trả lại mặt ban đầu
        this.scheduleOnce(() => {
            for (const action of revertActions) {
                action();
            }
        }, this.emotionDuration);

    }
}
