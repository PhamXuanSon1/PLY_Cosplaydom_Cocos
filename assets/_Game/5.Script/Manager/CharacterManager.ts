import { _decorator, Component, Node, Vec3, JsonAsset } from 'cc';
import { Character } from '../SpineScript/Character';
import { EquipmentSetData } from '../Data/EquipmentSetData';
import { SlotAttachmentPair } from '../Data/SlotAttachmentPair';
import { EDITOR } from 'cc/env';
import { SpineEmotionController } from '../SpineScript/SpineEmotionController';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('CharacterEquipmentSetup')
export class CharacterEquipmentSetup {
    @property({ 
        type: Character, 
        displayName: "Character",
        tooltip: "Character component để thay đổi attachment" 
    })
    public character: Character | null = null;

    @property({ 
        type: JsonAsset, 
        displayName: "Equipment Data (JSON)",
        tooltip: "File JSON chứa dữ liệu trang phục" 
    })
    public equipmentData: JsonAsset | null = null;
}

@ccclass('CharacterManager')
@executeInEditMode
export class CharacterManager extends Component {

    // KHAI BÁO CÁC BIẾN  
    public static instance: CharacterManager | null = null;

    @property({ 
        type: [CharacterEquipmentSetup], 
        group: { name: '1. Character Setup', id: 'characterSetup' },
        displayName: 'Character Setups',
        tooltip: "Danh sách các cặp character và equipment data (JSON)" 
    })
    public characterSetups: CharacterEquipmentSetup[] = [];

    @property({ 
        type: Node, 
        group: { name: '1. Character Setup', id: 'characterSetup' },
        displayName: 'Character Node 1',
        tooltip: "Nhân vật được scale" 
    })
    public character1: Node;

    // scale ban đầu
    private originalScales: Map<Node, Vec3> = new Map();

    // vị trí ban đầu
    private originalPositions: Map<Node, Vec3> = new Map();


    // EDITOR TEST PROPERTIES (Thay thế Odin Inspector [Button], [TableList] trong Unity)
    // Giúp chọn và set giá trị ngay trong Editor mà không cần chạy game

    @property({ 
        type: Character, 
        group: { name: '2. Editor Test Target', id: 'editorTarget' },
        displayName: 'Target Test Character',
        tooltip: "Nhân vật target để test" 
    })
    public targetTestCharacter: Character | null = null;

    @property({ 
        type: JsonAsset, 
        group: { name: '2. Editor Test Target', id: 'editorTarget' },
        displayName: 'Test Equipment Data Asset',
        tooltip: "Equipment data JSON asset target để test/lưu" 
    })
    public testEquipmentDataAsset: JsonAsset | null = null;

    // SEARCH KEYWORD PROPERTY
    private _searchKeyword: string = "";

    @property({ 
        group: { name: '3. Equipment Set & Search', id: 'equipmentSearch' },
        displayName: "Search Keyword", 
        tooltip: "Nhập từ khóa để lọc trực tiếp các phần tử trong myEquipmentSet" 
    })
    get searchKeyword(): string {
        return this._searchKeyword;
    }
    set searchKeyword(value: string) {
        this._searchKeyword = value;
        this.filterEquipmentSet();
    }

    @property({ 
        type: [SlotAttachmentPair], 
        group: { name: '3. Equipment Set & Search', id: 'equipmentSearch' },
        displayName: 'My Equipment Set',
        tooltip: "Set trang phục hiện tại" 
    })
    public myEquipmentSet: SlotAttachmentPair[] = [];

    // Master list chứa toàn bộ các slot/attachment
    private _allEquipmentSet: SlotAttachmentPair[] = [];

    // BUTTON EDITOR
    @property({ 
        group: { name: '4. Editor Actions', id: 'editorActions' },
        displayName: "🔘 Get All Slots", 
        tooltip: "Tích vào checkbox này để tự động lấy danh sách slot từ Spine Skeleton" 
    })
    get btnGetAllSlot(): boolean { return false; }
    set btnGetAllSlot(value: boolean) {
        if (value == true) this.getAllSlots();
    }

    @property({ 
        group: { name: '4. Editor Actions', id: 'editorActions' },
        displayName: "📂 Load From Test JSON", 
        tooltip: "Đọc dữ liệu từ file Test Equipment Data Asset (JSON) nạp vào myEquipmentSet" 
    })
    get btnLoadFromTestJson(): boolean { return false; }
    set btnLoadFromTestJson(value: boolean) {
        if (value == true) this.loadFromTestJson();
    }

    @property({ 
        group: { name: '4. Editor Actions', id: 'editorActions' },
        displayName: "👕 Equip Now (Editor)", 
        tooltip: "Tick vào checkbox để mặc đồ ngay" 
    })
    get btnEditorEquip(): boolean { return false; }
    set btnEditorEquip(value: boolean) {
        if (value == true) this.onEditorEquip();
    }

    @property({ 
        group: { name: '4. Editor Actions', id: 'editorActions' },
        displayName: "🚫 Disable All Items", 
        tooltip: "Tích vào checkbox này để ẩn toàn bộ trang bị" 
    })
    get btnDisableAllItems(): boolean { return false; }
    set btnDisableAllItems(value: boolean) {
        if (value == true) this.disableAllItems();
    }

    @property({ 
        group: { name: '4. Editor Actions', id: 'editorActions' },
        displayName: "💾 Save To Test JSON", 
        tooltip: "Lưu dữ liệu hiện tại trong myEquipmentSet vào file Test Equipment Data Asset (JSON) và ghi đè file trên ổ đĩa" 
    })
    get btnSaveToTestJson(): boolean { return false; }
    set btnSaveToTestJson(value: boolean) {
        if (value == true) this.saveToTestJson();
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
    public equipCharacter(character: Character, equipmentData: JsonAsset | EquipmentSetData): void {
        if (!character || !equipmentData) return;

        let pairs: SlotAttachmentPair[] = [];
        if (equipmentData instanceof JsonAsset) {
            const json = equipmentData.json as any;
            if (json && json.slotAttachmentPairs) {
                pairs = json.slotAttachmentPairs;
            }
        } else if ('slotAttachmentPairs' in equipmentData && equipmentData.slotAttachmentPairs) {
            pairs = equipmentData.slotAttachmentPairs;
        }

        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const attachName = (pair.isEnabled && pair.attachmentName && pair.attachmentName.trim() !== '') ? pair.attachmentName : null;
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
    public getAllSlots(): void {
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

            // 1. Lấy TÊN của attachment đang bật (nếu có)
            const currentAttachmentName = slot.attachment ? slot.attachment.name : null;
            const slotName = slot.data ? slot.data.name : "";

            // 2. Tìm tên attachment kể cả khi currentAttachmentName là null (isEnabled = false)
            let attachmentName = currentAttachmentName || (slot.data ? slot.data.attachmentName : null);

            // Nếu chưa tìm thấy attachmentName, duyệt các Skins của Skeleton để lấy tên attachment gán cho slot này
            if (!attachmentName && spineSkeleton.data) {
                const skins = spineSkeleton.data.skins || [];
                const getNameStr = (obj: any): string => {
                    if (!obj) return "";
                    if (typeof obj === 'string') return obj;
                    if (typeof obj.name === 'string') return obj.name;
                    if (obj.name && typeof obj.name.name === 'string') return obj.name.name;
                    return "";
                };

                for (let s = 0; s < skins.length; s++) {
                    const skin = skins[s];
                    if (!skin) continue;

                    if (skin.attachments) {
                        if (Array.isArray(skin.attachments)) {
                            const entry = skin.attachments.find((att: any) => att && att.slotIndex === i);
                            if (entry) {
                                const found = getNameStr(entry.name) || getNameStr(entry.attachment) || getNameStr(entry);
                                if (found) attachmentName = found;
                            }
                        } else if (typeof skin.attachments === 'object') {
                            const slotMap = skin.attachments[i];
                            if (slotMap) {
                                const names = Object.keys(slotMap);
                                if (names.length > 0) {
                                    attachmentName = names[0];
                                }
                            }
                        }
                    }

                    if (!attachmentName && typeof skin.getAttachments === 'function') {
                        const attList = skin.getAttachments();
                        if (Array.isArray(attList)) {
                            const entry = attList.find((att: any) => att && att.slotIndex === i);
                            if (entry) {
                                const found = getNameStr(entry.name) || getNameStr(entry.attachment) || getNameStr(entry);
                                if (found) attachmentName = found;
                            }
                        }
                    }

                    if (attachmentName) break;
                }
            }

            const pair = new SlotAttachmentPair();
            pair.isEnabled = currentAttachmentName !== null;
            pair.slotName = slotName;
            // Dù isEnabled là false hay true, vẫn lưu giữ attachmentName (fallback về slotName nếu không có attachment nào)
            pair.attachmentName = attachmentName || slotName;

            this._allEquipmentSet.push(pair);
        }
        this.myEquipmentSet = [...this._allEquipmentSet];
        console.log(`[CharacterManager] Đã lấy ${this._allEquipmentSet.length} slot từ Spine Skeleton.`);
        this.filterEquipmentSet();
    }

    // Tải dữ liệu từ JsonAsset testEquipmentDataAsset vào myEquipmentSet
    public loadFromTestJson(): void {
        if (!this.testEquipmentDataAsset) {
            console.error("[CharacterManager] Chưa gán Test Equipment Data Asset (JsonAsset)!");
            return;
        }

        const json = this.testEquipmentDataAsset.json as any;
        if (!json || !json.slotAttachmentPairs || !Array.isArray(json.slotAttachmentPairs)) {
            console.error("[CharacterManager] File JSON không hợp lệ hoặc không chứa danh sách slotAttachmentPairs!");
            return;
        }

        this._allEquipmentSet = [];
        for (let i = 0; i < json.slotAttachmentPairs.length; i++) {
            const item = json.slotAttachmentPairs[i];
            const pair = new SlotAttachmentPair();
            pair.isEnabled = item.isEnabled !== undefined ? item.isEnabled : true;
            pair.slotName = item.slotName || "";
            pair.attachmentName = item.attachmentName || "";
            this._allEquipmentSet.push(pair);
        }
        this.myEquipmentSet = [...this._allEquipmentSet];
        console.log(`[CharacterManager] Đã tải ${this._allEquipmentSet.length} slot từ JSON asset "${this.testEquipmentDataAsset.name}".`);
        this.filterEquipmentSet();
    }

    // Lọc danh sách myEquipmentSet trực tiếp theo từ khóa Search Keyword
    public filterEquipmentSet(): void {
        if ((!this._allEquipmentSet || this._allEquipmentSet.length === 0) && this.myEquipmentSet.length > 0) {
            this._allEquipmentSet = [...this.myEquipmentSet];
        }

        const keyword = (this._searchKeyword || "").trim().toLowerCase();
        if (!keyword) {
            if (this._allEquipmentSet.length > 0) {
                this.myEquipmentSet = [...this._allEquipmentSet];
            }
            return;
        }

        if (this._allEquipmentSet.length > 0) {
            this.myEquipmentSet = this._allEquipmentSet.filter(pair => {
                const slotMatch = pair.slotName && pair.slotName.toLowerCase().includes(keyword);
                const attachMatch = pair.attachmentName && pair.attachmentName.toLowerCase().includes(keyword);
                return slotMatch || attachMatch;
            });
        }
    }

    // Thêm 1 dòng trống vào bảng trang bị (dùng cho nút ＋ của custom inspector)
    public addEquipmentPair(): void {
        const pair = new SlotAttachmentPair();
        this.myEquipmentSet.push(pair);
        this._allEquipmentSet = [...this.myEquipmentSet];
    }

    // Xoá 1 dòng theo index (dùng cho nút ✕ của custom inspector)
    public removeEquipmentPair(index: number): void {
        if (index < 0 || index >= this.myEquipmentSet.length) return;
        this.myEquipmentSet.splice(index, 1);
        this._allEquipmentSet = [...this.myEquipmentSet];
    }

    //Mặc thử trang bị trên Editor (Chỉ với Target Character)
    public onEditorEquip(): void {
        const targetList = (this._allEquipmentSet && this._allEquipmentSet.length > 0) ? this._allEquipmentSet : this.myEquipmentSet;
        if (!targetList || !this.targetTestCharacter) return;
        for (let i = 0; i < targetList.length; i++) {
            const pair = targetList[i];
            const attachName = !pair.attachmentName || pair.attachmentName.trim() === '' ? null : pair.attachmentName;
            this.targetTestCharacter.turnSlotAttachment(pair.slotName, pair.isEnabled ? attachName : null);
        }
        console.log("[CharacterManager] Đã cập nhật trang bị trên Editor cho Target Character.");
    }

    //Tắt toàn bộ trang bị (Chỉ với Target Character)
    public disableAllItems(): void {
        const targetList = (this._allEquipmentSet && this._allEquipmentSet.length > 0) ? this._allEquipmentSet : this.myEquipmentSet;
        if (!targetList || !this.targetTestCharacter) return;
        for (let i = 0; i < targetList.length; i++) {
            const pair = targetList[i];
            pair.isEnabled = false;
            this.targetTestCharacter.turnSlotAttachment(pair.slotName, null);
        }
        console.log("[CharacterManager] Đã tắt toàn bộ trang bị trên Target Character.");
    }

    // Lưu dữ liệu myEquipmentSet vào testEquipmentDataAsset và ghi đè file JSON trên ổ đĩa
    public saveToTestJson(): void {
        if (!this.testEquipmentDataAsset) {
            console.error("[CharacterManager] Chưa gán Test Equipment Data Asset (JsonAsset)!");
            return;
        }

        const targetList = (this._allEquipmentSet && this._allEquipmentSet.length > 0) ? this._allEquipmentSet : this.myEquipmentSet;
        const rawPairs = targetList.map(pair => ({
            isEnabled: pair.isEnabled,
            slotName: pair.slotName,
            attachmentName: pair.attachmentName
        }));

        const existingJson = this.testEquipmentDataAsset.json as any;
        const skeletonFileName = (existingJson && existingJson.skeletonDataFileName)
            || (this.targetTestCharacter ? this.targetTestCharacter.node.name : this.testEquipmentDataAsset.name);

        const jsonObject = {
            skeletonDataFileName: skeletonFileName,
            slotAttachmentPairs: rawPairs
        };

        // Cập nhật memory asset
        this.testEquipmentDataAsset.json = jsonObject;

        const contentStr = JSON.stringify(jsonObject, null, 2);
        const success = this.saveJsonFileToDisk(this.testEquipmentDataAsset.name, contentStr);
        if (success) {
            console.log(`[CharacterManager] Đã lưu và ghi đè file JSON thành công cho asset "${this.testEquipmentDataAsset.name}".`);
        }
    }

    private saveJsonFileToDisk(assetName: string, contentStr: string): boolean {
        if (!EDITOR) {
            console.warn("[CharacterManager] Ghi đè file JSON chỉ khả thi trong môi trường Editor.");
            return false;
        }

        try {
            const req = (typeof globalThis !== 'undefined' && (globalThis as any).require)
                || (typeof window !== 'undefined' && (window as any).require);

            if (!req) {
                console.error("[CharacterManager] Không thể truy cập Node require trong Editor environment.");
                return false;
            }

            const fs = req('fs');
            const path = req('path');

            const nodeProcess = (typeof globalThis !== 'undefined' && (globalThis as any).process) || (typeof window !== 'undefined' && (window as any).process);
            const cwdPath = nodeProcess && nodeProcess.cwd ? nodeProcess.cwd() : '';

            let searchDir = path.join(cwdPath, 'assets');
            if (typeof (window as any).Editor !== 'undefined' && (window as any).Editor.Project) {
                const projPath = (window as any).Editor.Project.path || (window as any).Editor.Project.assetsPath;
                if (projPath) {
                    searchDir = path.isAbsolute(projPath) ? (projPath.endsWith('assets') ? projPath : path.join(projPath, 'assets')) : path.join(cwdPath, projPath, 'assets');
                }
            }

            if (!fs.existsSync(searchDir)) {
                searchDir = cwdPath;
            }

            const fileName = assetName.endsWith('.json') ? assetName : `${assetName}.json`;
            const foundPath = this.findFileRecursive(fs, path, searchDir, fileName);

            if (foundPath) {
                fs.writeFileSync(foundPath, contentStr, 'utf-8');
                console.log(`[CharacterManager] GHI ĐÈ THÀNH CÔNG FILE: ${foundPath}`);

                if ((window as any).Editor && (window as any).Editor.Message) {
                    try {
                        const relPath = path.relative(path.join(searchDir, '..'), foundPath).replace(/\\/g, '/');
                        (window as any).Editor.Message.request('asset-db', 'refresh-asset', `db://${relPath}`);
                    } catch (e) {
                        // ignore asset-db refresh error
                    }
                }
                return true;
            } else {
                console.error(`[CharacterManager] Không tìm thấy file "${fileName}" trong thư mục "${searchDir}"!`);
                return false;
            }
        } catch (err) {
            console.error("[CharacterManager] Lỗi khi thực hiện ghi đè file JSON:", err);
            return false;
        }
    }

    private findFileRecursive(fs: any, path: any, dir: string, fileName: string): string | null {
        if (!fs.existsSync(dir)) return null;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === 'temp' || entry.name === 'library' || entry.name === '.git' || entry.name === 'build') continue;
                    const res = this.findFileRecursive(fs, path, fullPath, fileName);
                    if (res) return res;
                } else if (entry.isFile() && entry.name === fileName) {
                    return fullPath;
                }
            }
        } catch (e) {
            // Error reading dir
        }
        return null;
    }
}



