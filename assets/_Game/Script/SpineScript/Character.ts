import { _decorator, Component, Node, sp } from 'cc';
import { SlotAttachmentPair } from '../Data/SlotAttachmentPair';
const { ccclass, property } = _decorator;

@ccclass('Character')
export class Character extends Component {

    @property({ type: sp.Skeleton,
                tooltip: "Spine skeleton component của nhân vật"
    })
    public spineSkeleton: sp.Skeleton | null = null;

    // Lưu lại trạng thái ép buộc của các slot (slotName -> attachmentName)
    private forcedAttachments: Map<string, string | null> = new Map();

    protected start(): void {
        if(!this.spineSkeleton){
            this.spineSkeleton = this.getComponent(sp.Skeleton);
        }
    }
    
    protected update(dt: number): void {
        // lưu lại trạng thái ép buộc của các slot trong mỗi frame
        this.applyForcedAttachments();
    }

    // áp dụng lại các attachment đã ép buộc cho các slot
    public applyForcedAttachments(): void {
        if(!this.spineSkeleton) return;

        for(const [slotName, attachmentName] of this.forcedAttachments.entries()){
            try{
                this.spineSkeleton.setAttachment(slotName, attachmentName);
            } catch (error) {
                // Bỏ qua log warning ở update loop để tránh spam console
            }
        }
    }

    //Thay đổi attachment cho 1 slot cụ thể và lưu vào trạng thái ép buộc 
    public turnSlotAttachment(slotName: string, attachmentName: string | null = null): void {
        if(!this.spineSkeleton) return;

        try{
            // Nếu attachmentName là rỗng, đặt thành null để tắt attachment
            const targetAttachment = (!attachmentName || attachmentName.trim() === '') ? null : attachmentName;
            this.spineSkeleton.setAttachment(slotName, targetAttachment);
            // Lưu lại trạng thái ép buộc
            this.forcedAttachments.set(slotName, targetAttachment);
        } catch (error) {
            console.error(`Lỗi khi thay đổi attachment cho slot "${slotName}" với attachment "${attachmentName}":`, error);
        }
    }

    // Bật danh sách các cặp Slot-Attachment
    public turnOnSlotAttachments(pairs: SlotAttachmentPair[]): void {
        if(!this.spineSkeleton) return;

        for(const pair of pairs){
            if(pair.isEnabled){
                this.turnSlotAttachment(pair.slotName, pair.attachmentName);
            }
        }
    }


    //Tắt danh sách các cặp Slot-Attachment
    public turnOffSlotAttachments(pairs: SlotAttachmentPair[]): void {
        if(!this.spineSkeleton) return;

        for(const pair of pairs){
            if(pair.isEnabled){
                this.turnSlotAttachment(pair.slotName, null); // Tắt attachment bằng cách đặt null
            }
        }
    }


    // Tắt 1 slot cụ thể
    public turnOffSlotAttachment(slotName: string): void {
        if(!this.spineSkeleton) return;
        this.turnSlotAttachment(slotName, null); // Tắt attachment bằng cách đặt null
    }


    //Chỉnh độ trong suốt (Alpha 0..1) của 1 Slot
    public setSlotAlpha(slotName: string, alpha: number): void {
        if(!this.spineSkeleton) return;

        const slot = this.spineSkeleton.findSlot(slotName);
        if(slot){
            slot.color.a = alpha;
        } else {
            console.warn(`Không tìm thấy slot "${slotName}" trong Spine Skeleton để chỉnh độ trong suốt.`);
        }
    }
}

