import { _decorator, Component, Node, Vec3 } from 'cc';
import { Character } from '../SpineScript/Character';
import { EquipmentSetData } from '../Data/EquipmentSetData';
import { SlotAttachmentPair } from '../Data/SlotAttachmentPair';
import { EDITOR } from 'cc/env';
import { SpineEmotionController } from '../SpineScript/SpineEmotionController';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('CharacterEquipmentSetup')
export class CharacterEquipmentSetup {
    @property({ type: Character, tooltip: "Character component để thay đổi attachment" })
    public character: Character | null = null;

    @property({ type: EquipmentSetData, tooltip: "Bộ trang phục cần thay đổi" })
    public equipmentData: EquipmentSetData | null = null;
}

@ccclass('CharacterManager')
@executeInEditMode
export class CharacterManager extends Component {

    // KHAI BÁO CÁC BIẾN  
    public static instance: CharacterManager | null = null;

    @property({ type: [CharacterEquipmentSetup], tooltip: "Danh sách các cặp character và equipment data" })
    public characterSetups: CharacterEquipmentSetup[] = [];

    @property({ type: Node, tooltip: "Nhân vật đc scale" })
    public character1: Node;

    @property({ tooltip: "scale ban đầu" })
    public originalScales: Map<Node, Vec3> = new Map();

    @property({ tooltip: "vị trí ban đầu" })
    public originalPositions: Map<Node, Vec3> = new Map();


    // EDITOR TEST PROPERTIES (Thay thế Odin Inspector [Button], [TableList] trong Unity)
    // Giúp chọn và set giá trị ngay trong Editor mà không cần chạy game

    @property({ type: Character, tooltip: "Nhân vật target để test" })
    public targetTestCharacter: Character | null = null;

    @property({ type: EquipmentSetData, tooltip: "Equipment data target để test" })
    public testEquipmentDataAsset: EquipmentSetData | null = null;

    @property({ type: [SlotAttachmentPair], tooltip: "Set trang phục hiện tại" })
    public myEquipmentSet: SlotAttachmentPair[] = [];

    //BUTTON EDITOR
    @property({ displayName: "lấy tất cả slot từ target", tooltip: "Tích vào checkbox này để tự động lấy danh sách slot từ Spine Skeleton" })
    get btnGetAllSlot(): boolean { return false; }
    set btnGetAllSlot(value: boolean) {
        if (value == true) this.getAllSlots();
    }

    @property({ displayName: "Mặc đồ ngay", tooltip: "Tick vào checkbox để mặc đồ ngay" })
    get btnEditorEquip(): boolean { return false; }
    set btnEditorEquip(value: boolean) {
        if (value == true) this.onEditorEquip();
    }

    @property({ displayName: "Tắt Tất Cả Đồ", tooltip: "Tích vào checkbox này để ẩn toàn bộ trang bị" })
    get btnDisableAllItems(): boolean { return false; }
    set btnDisableAllItems(value: boolean) {
        if (value == true) this.disableAllItems();
    }


    //LOGIC GAME
    // hàm này = awake của unity
    protected onLoad(): void {
        CharacterManager.instance = this;
    }

    protected start(): void {
        // 1. Lưu lại origin scale và position cho character 1
        if (this.character1) {
            this.originalScales.set(this.character1, this.character1.scale.clone());
            this.originalPositions.set(this.character1, this.character1.position.clone());
        }

        for (let i = 0; i < this.characterSetups.length; i++) {
            const setup = this.characterSetups[i];

            if (setup && setup.character) {
                const node = setup.character.node;
                this.originalScales.set(node, node.scale.clone());
                this.originalPositions.set(node, node.position.clone());
            }
        }

        // tự động mặc đồ khi play
        if (!EDITOR) {
            this.equipAll();
        }
    }

    // duyệt danh sách nhân vật và mặc cho tất cả chúng
    public equipAll(): void {
        for (let i = 0; i < this.characterSetups.length; i++) {
            const setup = this.characterSetups[i];
            if (setup && setup.character && setup.equipmentData) {
                this.equipCharacter(setup.character, setup.equipmentData);
            }
        }
    }

    // mặc cho từng nhân vật 
    public equipCharacter(character: Character, equipmentData: EquipmentSetData): void {
        // nếu ko có character hoặc equipmentData hoặc slotAttachmentPairs thì return
        if (!character || !equipmentData || !equipmentData.slotAttachmentPairs) return;

        for (let i = 0; i < equipmentData.slotAttachmentPairs.length; i++) {
            const pair = equipmentData.slotAttachmentPairs[i];
            const attachName = pair.isEnabled ? pair.attachmentName : null;
            character.turnSlotAttachment(pair.slotName, attachName);
        }
    }

    // Phát Animation Vui vẻ cho tất cả nhân vật
    public playHappyAnim(): void {
        for (let i = 0; i < this.characterSetups.length; i++) {
            const setup = this.characterSetups[i];
            if (setup && setup.character) {
                const emotionController = setup.character.getComponent(SpineEmotionController);
                if (emotionController) {
                    emotionController.PlayHappyAnim();
                }
            }
        }
    }

    // Phát Animation tức giận cho tất cả nhân vật
    public playAngryAnim(): void {
        for (let i = 0; i < this.characterSetups.length; i++) {
            const setup = this.characterSetups[i];
            if (setup && setup.character) {
                const emotionController = setup.character.getComponent(SpineEmotionController);
                if (emotionController) {
                    emotionController.PlayAngryAnim();
                }
            }
        }
    }


    //Lấy tất cả Slot & Attachment từ Target Character
    getAllSlots() {
        if (!this.targetTestCharacter || !this.targetTestCharacter.spineSkeleton) {
            console.error("Chưa gán Target Test Character hoặc Spine Skeleton chưa khởi tạo!");
            return;
        }

        this.myEquipmentSet = [];

        // Lấy đối tượng _skeleton nguyên bản của Spine
        const spineSkeleton = this.targetTestCharacter.spineSkeleton._skeleton;
        if (!spineSkeleton) {
            console.error("Không lấy được dữ liệu Skeleton từ Target!");
            return;
        }

        // Lấy danh sách slots
        const slots = spineSkeleton.slots;
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];

            // 1. Lấy TÊN của attachment (dùng .name)
            const currentAttachmentName = slot.attachment ? slot.attachment.name : null;
            const slotName = slot.data ? slot.data.name : "";

            const pair = new SlotAttachmentPair();
            pair.isEnabled = currentAttachmentName !== null;
            pair.slotName = slotName;

            // 2. Gán tên chuỗi (string) vào pair.attachmentName
            pair.attachmentName = currentAttachmentName || (slot.data ? slot.data.attachmentName : "") || "";

            this.myEquipmentSet.push(pair);
        }
        console.log(`[CharacterManager] Đã lấy ${this.myEquipmentSet.length} slot từ Spine Skeleton.`);
    }



    //Mặc thử trang bị trên Editor (Chỉ với Target Character)
    onEditorEquip() {
        if (!this.myEquipmentSet || !this.targetTestCharacter) return;
        for (let i = 0; i < this.myEquipmentSet.length; i++) {
            const pair = this.myEquipmentSet[i];
            const attachName = !pair.attachmentName || pair.attachmentName.trim() === '' ? null : pair.attachmentName;
            this.targetTestCharacter.turnSlotAttachment(pair.slotName, pair.isEnabled ? attachName : null);
        }
        console.log("[CharacterManager] Đã cập nhật trang bị trên Editor cho Target Character.");
    }



    //Tắt toàn bộ trang bị (Chỉ với Target Character)
    disableAllItems() {
        if (!this.myEquipmentSet || !this.targetTestCharacter) return;
        for (let i = 0; i < this.myEquipmentSet.length; i++) {
            const pair = this.myEquipmentSet[i];
            pair.isEnabled = false;
            this.targetTestCharacter.turnSlotAttachment(pair.slotName, null);
        }
        console.log("[CharacterManager] Đã tắt toàn bộ trang bị trên Target Character.");
    }
}


