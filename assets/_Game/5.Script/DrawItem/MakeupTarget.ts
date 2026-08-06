import { _decorator, Component, Node, Vec3, CCString, CCBoolean, CCInteger, CCFloat } from 'cc';
import { Character } from '../SpineScript/Character';
import { FxType, Ply_SoundManager } from '../ScriptTemplate/Ply_SoundManager';
import { CharacterManager } from '../Manager/CharacterManager';
import { Ply_Pool, PoolType } from '../ScriptTemplate/Ply_Pool';

const { ccclass, property } = _decorator;

@ccclass('MakeupSlotConfig')
export class MakeupSlotConfig {
    @property({ 
        type: CCString, 
        displayName: 'Slot Name',
        tooltip: 'Tên của Spine Slot' 
    })
    public slotName: string = '';

    @property({ 
        type: CCString, 
        displayName: 'Attachment Name',
        tooltip: 'Tên của Attachment cần bật' 
    })
    public attachmentName: string = '';
}

@ccclass('MakeupTarget')
export class MakeupTarget extends Component {

    // ==========================================
    // 1. Target & ID
    // ==========================================
    @property({
        type: Character,
        group: { name: '1. Target & ID', id: 'targetId' },
        displayName: 'Target Character',
        tooltip: 'Component Character của Spine nhân vật'
    })
    public targetCharacter: Character | null = null;

    @property({
        type: CCString,
        group: { name: '1. Target & ID', id: 'targetId' },
        displayName: 'Required Makeup ID',
        tooltip: 'ID đối chiếu với MakeupID của DrawItem'
    })
    public requiredMakeupID: string = '';

    // ==========================================
    // 2. Turn On Settings
    // ==========================================
    @property({
        type: CCString,
        group: { name: '2. Turn On Settings', id: 'turnOnSettings' },
        displayName: 'Slot Name',
        tooltip: 'Tên Slot cần bật'
    })
    public slotName: string = '';

    @property({
        type: CCString,
        group: { name: '2. Turn On Settings', id: 'turnOnSettings' },
        displayName: 'Attachment Name',
        tooltip: 'Tên Attachment cần bật'
    })
    public attachmentName: string = '';

    @property({
        type: [MakeupSlotConfig],
        group: { name: '2. Turn On Settings', id: 'turnOnSettings' },
        displayName: 'Multiple Turn On Slots',
        tooltip: 'Danh sách nhiều cặp Slot/Attachment muốn bật cùng lúc'
    })
    public multipleTurnOnSlots: MakeupSlotConfig[] = [];

    @property({
        type: Node,
        group: { name: '2. Turn On Settings', id: 'turnOnSettings' },
        displayName: 'Object To Turn On',
        tooltip: 'Kéo thả Node bạn muốn BẬT vào đây'
    })
    public objectToTurnOn: Node | null = null;

    @property({
        type: [Node],
        group: { name: '2. Turn On Settings', id: 'turnOnSettings' },
        displayName: 'Multiple Objects To Turn On',
        tooltip: 'Danh sách các Node bạn muốn BẬT vào đây'
    })
    public multipleObjectsToTurnOn: Node[] = [];

    // ==========================================
    // 3. Turn Off Settings (Optional)
    // ==========================================
    @property({
        type: CCString,
        group: { name: '3. Turn Off Settings', id: 'turnOffSettings' },
        displayName: 'Slot Name To Turn Off',
        tooltip: 'Nhập tên Slot mà bạn muốn tắt đi khi vẽ cái mới lên. Để trống nếu không cần.'
    })
    public slotNameToTurnOff: string = '';

    @property({
        type: [CCString],
        group: { name: '3. Turn Off Settings', id: 'turnOffSettings' },
        displayName: 'Multiple Turn Off Slots',
        tooltip: 'Danh sách các tên Slot cần tắt'
    })
    public multipleTurnOffSlots: string[] = [];

    @property({
        type: Node,
        group: { name: '3. Turn Off Settings', id: 'turnOffSettings' },
        displayName: 'Object To Turn Off',
        tooltip: 'Kéo thả Node bạn muốn TẮT vào đây'
    })
    public objectToTurnOff: Node | null = null;

    @property({
        type: [Node],
        group: { name: '3. Turn Off Settings', id: 'turnOffSettings' },
        displayName: 'Multiple Objects To Turn Off',
        tooltip: 'Danh sách các Node bạn muốn TẮT vào đây'
    })
    public multipleObjectsToTurnOff: Node[] = [];

    @property({
        type: CCBoolean,
        group: { name: '3. Turn Off Settings', id: 'turnOffSettings' },
        displayName: 'Turn Off Only When Done',
        tooltip: 'Bật cái này nếu CHỈ muốn tắt slot khi đã vẽ xong 100% (không làm mờ dần trong lúc vẽ).'
    })
    public turnOffOnlyWhenDone: boolean = false;

    // ==========================================
    // 4. Status
    // ==========================================
    @property({
        type: CCBoolean,
        group: { name: '4. Status', id: 'statusGroup' },
        displayName: 'Is Applied',
        tooltip: 'Check xem vị trí này đã hoàn thành makeup chưa'
    })
    public isApplied: boolean = false;

    // ==========================================
    // 5. Draw Settings
    // ==========================================
    @property({
        type: CCBoolean,
        group: { name: '5. Draw Settings', id: 'drawSettings' },
        displayName: 'Continuous Mode',
        tooltip: 'Bật tuỳ chọn này nếu bạn muốn tiến độ tăng liên tục khi di chuột đè lên (không cần nhấc ra).'
    })
    public continuousMode: boolean = false;

    @property({
        type: CCInteger,
        group: { name: '5. Draw Settings', id: 'drawSettings' },
        displayName: 'Required Draw Times',
        tooltip: 'Số lần quẹt (vào rồi ra) để hiển thị đầy đủ 100% alpha'
    })
    public requiredDrawTimes: number = 1;

    @property({
        type: CCFloat,
        group: { name: '5. Draw Settings', id: 'drawSettings' },
        displayName: 'Continuous Required Seconds',
        tooltip: 'Thời gian chà xát để hiển thị 100% (tính bằng giây). Dành riêng cho Continuous Mode.'
    })
    public continuousRequiredSeconds: number = 1;

    // Getters & Privates
    public get currentDrawTimesValue(): number {
        return this.currentDrawTimes;
    }
    public get CurrentDrawTimes(): number {
        return this.currentDrawTimes;
    }
    private currentDrawTimes: number = 0;

    private isBeingHovered: boolean = false;
    private lastMousePos: Vec3 = new Vec3();

    // RAM Cache cho Spine Slot
    private cachedSlot: any = null;
    private cachedSlotOff: any = null;
    private cachedMultipleSlotsOn: any[] = [];
    private cachedMultipleSlotsOff: any[] = [];

    private isAttachmentTurnedOn: boolean = false;
    private isAttachmentTurnedOff: boolean = false;

    protected start(): void {
        if (this.targetCharacter && this.targetCharacter.spineSkeleton) {
            const skeletonComp = this.targetCharacter.spineSkeleton;
            const skeleton = (skeletonComp as any)._skeleton;

            if (skeletonComp && skeleton) {
                if (this.slotName) {
                    this.cachedSlot = skeletonComp.findSlot(this.slotName) || skeleton.findSlot(this.slotName);
                }
                if (this.slotNameToTurnOff) {
                    this.cachedSlotOff = skeletonComp.findSlot(this.slotNameToTurnOff) || skeleton.findSlot(this.slotNameToTurnOff);
                }
                if (this.multipleTurnOnSlots && this.multipleTurnOnSlots.length > 0) {
                    for (const config of this.multipleTurnOnSlots) {
                        if (config && config.slotName) {
                            const slot = skeletonComp.findSlot(config.slotName) || skeleton.findSlot(config.slotName);
                            if (slot) this.cachedMultipleSlotsOn.push(slot);
                        }
                    }
                }
                if (this.multipleTurnOffSlots && this.multipleTurnOffSlots.length > 0) {
                    for (const slotNameOff of this.multipleTurnOffSlots) {
                        if (slotNameOff) {
                            const slot = skeletonComp.findSlot(slotNameOff) || skeleton.findSlot(slotNameOff);
                            if (slot) this.cachedMultipleSlotsOff.push(slot);
                        }
                    }
                }
            }
        }
    }

    private setSlotAlphaValue(slot: any, alpha: number): void {
        if (!slot) return;
        if (slot.color) {
            slot.color.a = alpha;
        } else if (typeof slot.a !== 'undefined') {
            slot.a = alpha;
        }
    }

    public applyMakeup(dt: number = 0.016, currentMousePos?: Vec3): void {
        if (this.isApplied || !this.targetCharacter) return;

        if (this.continuousMode && currentMousePos) {
            const mouseDelta = Vec3.squaredDistance(currentMousePos, this.lastMousePos);
            this.lastMousePos.set(currentMousePos);

            // Nếu chuột gần như đứng im thì không tính tiến độ
            if (mouseDelta < 0.1) return;
        }

        const canProgress = this.continuousMode || !this.isBeingHovered;

        if (canProgress) {
            this.isBeingHovered = true;

            if (this.continuousMode) {
                this.currentDrawTimes += dt;
            } else {
                this.currentDrawTimes += 1.0;
            }

            const targetMaxDraws = this.continuousMode ? this.continuousRequiredSeconds : this.requiredDrawTimes;
            const targetAlpha = targetMaxDraws > 0 ? Math.min(1.0, Math.max(0.0, this.currentDrawTimes / targetMaxDraws)) : 1.0;

            const hasTurnOnSettings = !!(this.slotName || (this.multipleTurnOnSlots && this.multipleTurnOnSlots.length > 0) || this.objectToTurnOn || (this.multipleObjectsToTurnOn && this.multipleObjectsToTurnOn.length > 0));

            if (hasTurnOnSettings) {
                // Gọi 1 lần duy nhất để tránh lag khi quét cọ
                if (!this.isAttachmentTurnedOn) {
                    if (this.slotName) {
                        this.targetCharacter.turnSlotAttachment(this.slotName, this.attachmentName);
                    }
                    if (this.multipleTurnOnSlots) {
                        for (const config of this.multipleTurnOnSlots) {
                            if (config && config.slotName) {
                                this.targetCharacter.turnSlotAttachment(config.slotName, config.attachmentName);
                            }
                        }
                    }
                    if (this.objectToTurnOn) {
                        this.objectToTurnOn.active = true;
                    }
                    if (this.multipleObjectsToTurnOn) {
                        for (const obj of this.multipleObjectsToTurnOn) {
                            if (obj) obj.active = true;
                        }
                    }
                    this.isAttachmentTurnedOn = true;
                }

                // Từ từ tăng Alpha mượt qua RAM
                if (this.cachedSlot) {
                    this.setSlotAlphaValue(this.cachedSlot, targetAlpha);
                } else if (this.slotName) {
                    this.targetCharacter.setSlotAlpha(this.slotName, targetAlpha);
                }

                for (const slot of this.cachedMultipleSlotsOn) {
                    this.setSlotAlphaValue(slot, targetAlpha);
                }
            }

            // Xử lý cái cần tắt (nếu có nhập tên slot cần tắt)
            const hasTurnOffSettings = !!(this.slotNameToTurnOff || (this.multipleTurnOffSlots && this.multipleTurnOffSlots.length > 0) || this.objectToTurnOff || (this.multipleObjectsToTurnOff && this.multipleObjectsToTurnOff.length > 0));

            if (hasTurnOffSettings) {
                if (!this.turnOffOnlyWhenDone) {
                    // Từ từ giảm Alpha của cái đang bị xóa đi
                    if (this.cachedSlotOff) {
                        this.setSlotAlphaValue(this.cachedSlotOff, 1.0 - targetAlpha);
                    } else if (this.slotNameToTurnOff) {
                        this.targetCharacter.setSlotAlpha(this.slotNameToTurnOff, 1.0 - targetAlpha);
                    }

                    for (const slotOff of this.cachedMultipleSlotsOff) {
                        this.setSlotAlphaValue(slotOff, 1.0 - targetAlpha);
                    }
                }

                // Nếu đã quẹt xong thì tắt hẳn nó đi luôn cho nhẹ (chỉ gọi 1 lần)
                if (this.currentDrawTimes >= targetMaxDraws && !this.isAttachmentTurnedOff) {
                    if (this.slotNameToTurnOff) {
                        this.targetCharacter.turnSlotAttachment(this.slotNameToTurnOff, null);
                    }
                    if (this.multipleTurnOffSlots) {
                        for (const slotNameOff of this.multipleTurnOffSlots) {
                            if (slotNameOff) {
                                this.targetCharacter.turnSlotAttachment(slotNameOff, null);
                            }
                        }
                    }
                    if (this.objectToTurnOff) {
                        this.objectToTurnOff.active = false;
                    }
                    if (this.multipleObjectsToTurnOff) {
                        for (const obj of this.multipleObjectsToTurnOff) {
                            if (obj) obj.active = false;
                        }
                    }
                    this.isAttachmentTurnedOff = true;
                }
            }

            // Nếu đã quẹt đủ số lần yêu cầu thì đánh dấu là đã hoàn thành makeup
            if (this.currentDrawTimes >= targetMaxDraws) {
                if (!this.isApplied) {
                    this.isApplied = true;

                    const drawItemMgr = (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
                    let isIdCompleteInMap = true;
                    if (drawItemMgr && typeof drawItemMgr.IsMakeupIDCompletedInCurrentMap === 'function') {
                        isIdCompleteInMap = drawItemMgr.IsMakeupIDCompletedInCurrentMap(this.requiredMakeupID);
                    }

                    if (isIdCompleteInMap) {
                        if (Ply_SoundManager.Ins != null) {
                            Ply_SoundManager.Ins.playFx(FxType.Happy);
                        }
                        if (CharacterManager.instance != null) {
                            CharacterManager.instance.playHappyAnim();
                        }

                        if (Ply_Pool.Ins != null) {
                            let spawnPos = this.node.worldPosition;
                            if (drawItemMgr && typeof drawItemMgr.GetHeartSpawnPosForCurrentMap === 'function') {
                                const spawnParent = drawItemMgr.GetHeartSpawnPosForCurrentMap();
                                if (spawnParent) {
                                    spawnPos = spawnParent.worldPosition || spawnParent.position;
                                }
                            }

                            const heartUnit = Ply_Pool.Ins.spawn(PoolType.Heart, spawnPos);
                            if (heartUnit) {
                                const prefab = Ply_Pool.Ins.getPrefab ? Ply_Pool.Ins.getPrefab(PoolType.Heart) : null;
                                if (prefab) {
                                    heartUnit.node.setScale(prefab.data ? prefab.data.scale : heartUnit.node.scale);
                                }
                            }
                        }
                    }

                    if (drawItemMgr && typeof drawItemMgr.CheckMapCompletion === 'function') {
                        drawItemMgr.CheckMapCompletion();
                    }

                    const handHintMgr = (globalThis as any).HandHintManager?.Instance || (window as any).HandHintManager?.Instance;
                    if (handHintMgr && typeof handHintMgr.CheckAndAdvanceHint === 'function') {
                        handHintMgr.CheckAndAdvanceHint();
                    }
                }
            }
        }
    }

    public ApplyMakeup(): void {
        this.applyMakeup();
    }

    public forceComplete(): void {
        if (this.isApplied || !this.targetCharacter) return;

        const targetMaxDraws = this.continuousMode ? this.continuousRequiredSeconds : this.requiredDrawTimes;

        let safetyCounter = 0;
        while (!this.isApplied && this.currentDrawTimes < targetMaxDraws && safetyCounter < 100) {
            this.isBeingHovered = false;
            this.applyMakeup();
            safetyCounter++;
        }
    }

    public ForceComplete(): void {
        this.forceComplete();
    }

    public onBrushExit(): void {
        this.isBeingHovered = false;
    }

    public OnBrushExit(): void {
        this.onBrushExit();
    }
}
