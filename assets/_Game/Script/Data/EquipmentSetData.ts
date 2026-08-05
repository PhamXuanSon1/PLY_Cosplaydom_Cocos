import { _decorator, Component, Node } from 'cc';
import { SlotAttachmentPair } from './SlotAttachmentPair';
const { ccclass, property } = _decorator;

@ccclass('EquipmentSetData')
export class EquipmentSetData {
    // tên file dữ liệu skeleton của Spine
    @property({ type: String,
                tooltip: "Tên file dữ liệu skeleton của Spine"
    })
    public skeletonDataFileName: string;

    // danh sách các cặp slot và attachment
    @property({ type: [SlotAttachmentPair],
                tooltip: "Danh sách các cặp slot và attachment"
    })
    public slotAttachmentPairs: SlotAttachmentPair[];
}


