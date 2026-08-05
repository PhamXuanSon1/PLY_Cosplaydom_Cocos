import { _decorator, Component, Node, sp } from 'cc';
import { SlotAttachmentPair } from '../Data/SlotAttachmentPair';
const { ccclass, property } = _decorator;

@ccclass('ToggleBoneSlot')
export class ToggleBoneSlot extends Component {

    @property({ type: sp.Skeleton,
                tooltip: "spine skeleton component để thay đổi attachment"
    })
    public spineSkeleton : sp.Skeleton | null = null;


    @property({ type: [SlotAttachmentPair],
                tooltip: "Danh sách các cặp slot và attachment ban đầu"
    })
    public initialAttachments: SlotAttachmentPair[] = [];

    start() {
        // Áp dụng các cặp slot và attachment ban đầu khi bắt đầu
        if(!this.spineSkeleton){
            this.spineSkeleton = this.getComponent(sp.Skeleton);
        }

        if(this.spineSkeleton){
            this.applyInitialAttachments();
        }
    }


    // Hàm áp dụng các cặp slot và attachment ban đầu cho Spine Skeleton
    public applyInitialAttachments(): void {
        if(!this.spineSkeleton){
            console.warn("Spine skeleton component không được gán. Không thể áp dụng các cặp slot và attachment ban đầu.");
            return;
        }

        for(const pair of this.initialAttachments){
            if(pair.isEnabled){
                pair.applyToSkeleton(this.spineSkeleton);
            }
        }
    }


    public turnSlotAttachmentOn(slotName: string, attachmentName: string): void {
        if(!this.spineSkeleton) return;

        try{
            const targetAttachment = attachmentName || null; // Nếu attachmentName là rỗng, đặt thành null để tắt attachment
            this.spineSkeleton.setAttachment(slotName, targetAttachment);
        } catch (error) {
            console.error(`Lỗi khi bật attachment cho slot "${slotName}" với attachment "${attachmentName}":`, error);
        }
    }
}


