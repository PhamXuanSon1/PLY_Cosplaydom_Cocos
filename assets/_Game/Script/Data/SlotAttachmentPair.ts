import { _decorator, CCBoolean, CCString, Component, Node, sp } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SlotAttachmentPair')
export class SlotAttachmentPair {
    
    @property({
        tooltip: "Bat tat tinh nang cua cap slot va attachment"
    })
    public isEnabled: boolean = true;

    @property({
        tooltip: "Ten cua slot trong skeleton data"
    })
    public slotName: string = "";

    @property({
        tooltip: "Ten cua attachment trong skeleton data"
    })
    public attachmentName: string = '';


    /**
     * Hàm xử lý thay attachment trực tiếp cho Spine Component
     */
    public applyToSkeleton(skeleton: sp.Skeleton): void{ // sp la namespace cua spine trong Cocos Creator
        if(!this.isEnabled || !skeleton || !skeleton.skeletonData){
            return;
        } 
        // Gọi API của Spine để thay đổi attachment cho slot tương ứng
        skeleton.setAttachment(this.slotName, this.attachmentName);
    } 
}


