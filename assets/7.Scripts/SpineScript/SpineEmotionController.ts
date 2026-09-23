import { _decorator, Component, director, Director, sp } from "cc";
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
            "(Không còn bắt buộc) Hết cảm xúc, slot tự trả về đúng trạng thái trước đó. Chỉ dùng khi muốn ép về 1 attachment cụ thể.",
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

    @property({ tooltip: "Thời gian giữ biểu cảm (giây). Attachment cảm xúc được giữ suốt khoảng này, kể cả khi animation Spine có key khác." })
    public emotionDuration: number = 1.0;

    @property({ type: [EmotonSlotConfig], tooltip: "Danh sách các cặp slot và attachment để thay đổi khi cười" })
    public smileSlots: EmotonSlotConfig[] = [];

    @property({ type: [EmotonSlotConfig], tooltip: "Danh sách các cặp slot và attachment để thay đổi khi tức giận" })
    public angrySlots: EmotonSlotConfig[] = [];

    @property({ tooltip: "Animation cho track cảm xúc sau khi xong (để trống = trả track về rỗng, mix mượt). Thường để trống." })
    public defaultAnimationName: string = "";

    @property({ tooltip: "Thời gian mix (giây) khi animation cảm xúc kết thúc để trả track về." })
    public mixOutDuration: number = 0.2;

    // slot -> attachment đang ép trong lúc có cảm xúc
    private overrides: Map<string, string> = new Map();
    private revertTimer: (() => void) | null = null;

    start() {
        if (!this.skeletonAnimation) {
            this.skeletonAnimation = this.getComponent(sp.Skeleton);
        }
    }

    protected onEnable(): void {
        // Spine áp animation SAU mọi update()/lateUpdate() của script -> nếu đổi attachment trong update
        // thì animation (happy/angry có key miệng) sẽ đè lại. Áp override ngay trước khi vẽ để luôn thắng.
        director.on(Director.EVENT_BEFORE_DRAW, this.applyOverrides, this);
    }

    protected onDisable(): void {
        director.off(Director.EVENT_BEFORE_DRAW, this.applyOverrides, this);
        this.endEmotion();
    }

    public PlayHappyAnim(): void {
        this.EmotionRoutine(this.happyAnimationName, this.smileSlots);
    }
    public PlayAngryAnim(): void {
        this.EmotionRoutine(this.angryAnimationName, this.angrySlots);
    }

    public EmotionRoutine(animName: string, slots: EmotonSlotConfig[]): void {
        const skel = this.skeletonAnimation;
        if (!skel) return;

        // Cảm xúc mới đè cảm xúc cũ: huỷ hẹn hoàn tác của lần trước
        this.endEmotion();

        for (const cfg of slots) {
            if (!cfg || !cfg.slotName || !cfg.targetAttachmentName) continue;
            const slot = skel.findSlot(cfg.slotName);
            if (!slot) {
                console.warn(`[SpineEmotion] Không tìm thấy slot: ${cfg.slotName}`);
                continue;
            }

            const currentName = SpineEmotionController.readAttachmentName(slot);
            // Slot đang tắt (không có attachment) -> không bật mặt cười lên chỗ trống
            if (!currentName) continue;
            if (cfg.requiredCurrentAttachment && cfg.requiredCurrentAttachment.trim() !== ""
                && currentName !== cfg.requiredCurrentAttachment) {
                continue;
            }
            this.overrides.set(cfg.slotName, cfg.targetAttachmentName);
        }
        // Đổi ngay trong frame này (không đợi tới lúc vẽ) để code khác đọc slot thấy đúng
        this.applyOverrides();

        if (animName) {
            const entry = skel.setAnimation(this.animationTrack, animName, false);
            if (entry) {
                skel.setTrackCompleteListener(entry, () => {
                    if (this.defaultAnimationName && this.defaultAnimationName.trim() !== "") {
                        skel.setAnimation(this.animationTrack, this.defaultAnimationName, true);
                    } else {
                        // Trả track về rỗng, mix mượt -> không để lại animation lặp chồng lên track 0
                        skel.getState()?.setEmptyAnimation(this.animationTrack, Math.max(0, this.mixOutDuration));
                    }
                });
            }
        }

        this.revertTimer = () => this.endEmotion();
        this.scheduleOnce(this.revertTimer, Math.max(0, this.emotionDuration));
    }

    /** Kết thúc cảm xúc: nhả override, slot tự quay về theo Character / animation như trước. */
    private endEmotion(): void {
        if (this.revertTimer) {
            this.unschedule(this.revertTimer);
            this.revertTimer = null;
        }
        if (this.overrides.size === 0) return;
        const skel = this.skeletonAnimation;
        const character: any = this.getComponent("Character");
        this.overrides.forEach((_att, slotName) => {
            // Trả về attachment Character đang ép (nếu có), không thì về setup pose của slot
            const forced = character && character.forcedAttachments ? character.forcedAttachments.get(slotName) : undefined;
            if (skel) {
                try {
                    if (forced !== undefined) skel.setAttachment(slotName, forced ?? "");
                    else {
                        const slot: any = skel.findSlot(slotName);
                        if (slot && typeof slot.setToSetupPose === "function") slot.setToSetupPose();
                    }
                } catch (e) { /* slot không còn -> bỏ qua */ }
            }
        });
        this.overrides.clear();
    }

    private applyOverrides(): void {
        if (this.overrides.size === 0 || !this.skeletonAnimation) return;
        this.overrides.forEach((att, slotName) => {
            try {
                this.skeletonAnimation!.setAttachment(slotName, att);
            } catch (e) { /* bỏ qua */ }
        });
    }

    // Spine bản JS có property .name, bản WASM chỉ có getName()
    private static readAttachmentName(slot: any): string | null {
        const att = slot.attachment !== undefined ? slot.attachment : (typeof slot.getAttachment === "function" ? slot.getAttachment() : null);
        if (!att) return null;
        const name = att.name !== undefined ? att.name : (typeof att.getName === "function" ? att.getName() : null);
        return typeof name === "string" && name ? name : null;
    }
}
