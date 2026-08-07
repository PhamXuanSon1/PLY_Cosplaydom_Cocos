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

    // Bật danh sách các cặp Slot-Attachment.
    // Hỗ trợ 2 kiểu gọi:
    //  - Từ code:         truyền mảng SlotAttachmentPair[]
    //  - Từ EventHandler: truyền chuỗi "slot/attachment, slot/attachment" (Cocos đưa CustomEventData vào dưới dạng string)
    public turnOnSlotAttachments(pairs: SlotAttachmentPair[] | string): void {
        if(!this.spineSkeleton) return;

        if(typeof pairs === 'string'){
            this.applySlotDataString(pairs, true);
            return;
        }

        for(const pair of pairs){
            if(pair.isEnabled){
                this.turnSlotAttachment(pair.slotName, pair.attachmentName);
            }
        }
    }


    //Tắt danh sách các cặp Slot-Attachment (nhận mảng hoặc chuỗi "slot, slot" / "slot/attachment, ..." từ EventHandler)
    public turnOffSlotAttachments(pairs: SlotAttachmentPair[] | string): void {
        if(!this.spineSkeleton) return;

        if(typeof pairs === 'string'){
            this.applySlotDataString(pairs, false);
            return;
        }

        for(const pair of pairs){
            if(pair.isEnabled){
                this.turnSlotAttachment(pair.slotName, null); // Tắt attachment bằng cách đặt null
            }
        }
    }

    /**
     * Parse chuỗi CustomEventData rồi bật/tắt từng slot.
     * Định dạng: "slotName, attachmentName" cho 1 cặp; nhiều cặp ngăn nhau bằng dấu ';'.
     * Ví dụ: "Hair_F/Added_Bangs, Hair/Added_Bangs; Item_F/Set_K_Headband, Item/Headband"
     * Nếu bỏ phần attachment (không có dấu phẩy) thì mặc định attachment = tên slot.
     *
     * LƯU Ý: tên slot & attachment của Spine có thể chứa dấu '/', nên KHÔNG dùng '/' làm dấu phân cách.
     * @param turnOn true = bật (gán attachment), false = tắt (gán null)
     */
    private applySlotDataString(data: string, turnOn: boolean): void {
        const pairs = data.split(';');
        for(const rawPair of pairs){
            // Chỉ tách ở dấu phẩy ĐẦU TIÊN: trước là slot, sau là attachment (để tên chứa '/' không bị vỡ).
            const commaIdx = rawPair.indexOf(',');
            const slotName = (commaIdx >= 0 ? rawPair.substring(0, commaIdx) : rawPair).trim();
            if(!slotName) continue;

            const attachmentName = commaIdx >= 0 ? rawPair.substring(commaIdx + 1).trim() : '';
            this.turnSlotAttachment(slotName, turnOn ? (attachmentName || slotName) : null);
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

