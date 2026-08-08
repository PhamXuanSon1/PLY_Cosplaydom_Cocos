import { _decorator, Component, Node, CCFloat, Animation, EventHandler } from 'cc';
import { DrawItemManager } from './DrawItemManager';
import { DrawInputManager } from './DrawInputManager';
import { HandHintManager } from './HandHintManager';

const { ccclass, property } = _decorator;

/**
 * 1 bước trong chuỗi animation chuyển Map 2 -> Map 3 (port từ GameManager.AnimSequenceStep).
 */
@ccclass('AnimSequenceStep')
export class AnimSequenceStep {
    @property({
        type: Node,
        displayName: 'Target Animator',
        tooltip: 'Node chứa Animation cần chạy (có thể để trống nếu chỉ dùng Event)'
    })
    public targetAnimator: Node | null = null;

    @property({
        displayName: 'Clip / Trigger Name',
        tooltip: 'Tên Animation Clip để phát (tương đương Trigger bên Unity, VD: Play)'
    })
    public triggerName: string = 'Play';

    @property({
        type: CCFloat,
        displayName: 'Delay After',
        tooltip: 'Thời gian chờ TRƯỚC KHI chạy bước tiếp theo (hoặc trước khi tự chuyển sang Map 3)'
    })
    public delayAfter: number = 1;

    @property({
        type: [EventHandler],
        displayName: 'On Step Start',
        tooltip: 'Event tuỳ chọn để gọi thêm logic (bật/tắt object, phát âm thanh...)'
    })
    public onStepStart: EventHandler[] = [];
}

/**
 * GameManager - port từ GameManager.cs (Unity).
 * - Đã bỏ Luna (LunaPlaygroundField, LifeCycle, Playable) & AppLovinAnalytics.
 * - static instance (chữ thường) + đăng ký globalThis để khớp các caller cũ
 *   (DrawInputManager tra cứu qua (globalThis as any).GameManager.instance).
 */
@ccclass('GameManager')
export class GameManager extends Component {

    public static instance: GameManager | null = null;

    @property({
        group: { name: '1. Build Settings', id: 'buildSettings' },
        displayName: 'Is Google Build',
        tooltip: 'Bật nếu là bản build cho Google (sẽ tắt các object/behaviour trong danh sách bên dưới)'
    })
    public isGoogleBuild: boolean = false;

    @property({
        type: [Node],
        group: { name: '1. Build Settings', id: 'buildSettings' },
        displayName: 'Google Disabled Objects',
        tooltip: 'Các Node sẽ bị tắt khi isGoogleBuild = true'
    })
    public googleDisabledObjects: Node[] = [];

    @property({
        type: [Component],
        group: { name: '1. Build Settings', id: 'buildSettings' },
        displayName: 'Google Disabled Behaviours',
        tooltip: 'Các Component sẽ bị disable khi isGoogleBuild = true'
    })
    public googleDisabledBehaviours: Component[] = [];

    @property({ type: [Node], group: { name: '2. Map Objects', id: 'mapObjects' }, displayName: 'List Object In Intro' })
    public listObjectInIntro: Node[] = [];
    @property({ type: [Node], group: { name: '2. Map Objects', id: 'mapObjects' }, displayName: 'List Object In Map1' })
    public listObjectInMap1: Node[] = [];
    @property({ type: [Node], group: { name: '2. Map Objects', id: 'mapObjects' }, displayName: 'List Object In Map2' })
    public listObjectInMap2: Node[] = [];
    @property({ type: [Node], group: { name: '2. Map Objects', id: 'mapObjects' }, displayName: 'List Object In Map3' })
    public listObjectInMap3: Node[] = [];
    @property({ type: [Node], group: { name: '2. Map Objects', id: 'mapObjects' }, displayName: 'List Object In Map4' })
    public listObjectInMap4: Node[] = [];

    @property({
        group: { name: '3. Map2 -> Map3 Sequence', id: 'map2to3' },
        displayName: 'Auto Switch To Map3 At End',
        tooltip: 'Nếu tắt, game sẽ KHÔNG tự bật Map 3 ở cuối chuỗi. Bạn phải tự gọi TurnOnMap3() qua Event.'
    })
    public autoSwitchToMap3AtEnd: boolean = true;

    @property({
        type: [AnimSequenceStep],
        group: { name: '3. Map2 -> Map3 Sequence', id: 'map2to3' },
        displayName: 'Map2 To Map3 Sequence'
    })
    public map2ToMap3Sequence: AnimSequenceStep[] = [];

    protected onLoad(): void {
        GameManager.instance = this;
        (globalThis as any).GameManager = GameManager;

        if (this.isGoogleBuild) {
            for (const obj of this.googleDisabledObjects) {
                if (obj != null) obj.active = false;
            }
            for (const comp of this.googleDisabledBehaviours) {
                if (comp != null) comp.enabled = false;
            }
        }
    }

    /** CTA ra Store. Luna (LifeCycle.GameEnded + Playable.InstallFullGame) & AppLovinAnalytics đã bị bỏ. */
    public GotoStore(): void {
        // TODO: nối lại logic mở Store / kết thúc game cho nền tảng đích ở đây.
        console.log('[GameManager] GotoStore() được gọi (đã bỏ Luna & AppLovinAnalytics).');
    }

    /** Bật/tắt cả 1 danh sách Node (tôn trọng googleDisabledObjects khi bật). */
    public SetListActive(list: Node[], isActive: boolean): void {
        if (!list) return;
        for (const obj of list) {
            if (obj != null) {
                if (isActive && this.isGoogleBuild && this.googleDisabledObjects.indexOf(obj) !== -1) {
                    obj.active = false;
                    continue;
                }
                obj.active = isActive;
            }
        }
    }

    public TurnOnIntro(): void {
        this.SetListActive(this.listObjectInMap1, false);
        this.SetListActive(this.listObjectInMap2, false);
        this.SetListActive(this.listObjectInMap3, false);
        this.SetListActive(this.listObjectInMap4, false);
        this.SetListActive(this.listObjectInIntro, true);
    }

    public TurnOnMap1(): void {
        this.SetListActive(this.listObjectInIntro, false);
        this.SetListActive(this.listObjectInMap2, false);
        this.SetListActive(this.listObjectInMap3, false);
        this.SetListActive(this.listObjectInMap4, false);
        this.SetListActive(this.listObjectInMap1, true);
        if (HandHintManager.Instance != null) HandHintManager.Instance.ShowHintImmediately();
    }

    public TurnOnMap2(): void {
        this.SetListActive(this.listObjectInIntro, false);
        this.SetListActive(this.listObjectInMap1, false);
        this.SetListActive(this.listObjectInMap3, false);
        this.SetListActive(this.listObjectInMap4, false);
        this.SetListActive(this.listObjectInMap2, true);

        if (DrawItemManager.Instance != null) DrawItemManager.Instance.currentMapIndex = 1;
        if (HandHintManager.Instance != null) HandHintManager.Instance.ShowHintImmediately();
    }

    public TurnOnMap3(): void {
        this.SetListActive(this.listObjectInIntro, false);
        this.SetListActive(this.listObjectInMap1, false);
        this.SetListActive(this.listObjectInMap2, false);
        this.SetListActive(this.listObjectInMap3, true);
        this.SetListActive(this.listObjectInMap4, false);

        if (DrawItemManager.Instance != null) DrawItemManager.Instance.currentMapIndex = 2;
        if (HandHintManager.Instance != null) HandHintManager.Instance.ShowHintImmediately();
    }

    public TurnOnMap4(): void {
        this.SetListActive(this.listObjectInIntro, false);
        this.SetListActive(this.listObjectInMap1, false);
        this.SetListActive(this.listObjectInMap2, false);
        this.SetListActive(this.listObjectInMap3, false);
        this.SetListActive(this.listObjectInMap4, true);

        if (DrawItemManager.Instance != null) DrawItemManager.Instance.currentMapIndex = 3;
        if (HandHintManager.Instance != null) HandHintManager.Instance.ShowHintWithDelay();
        if (DrawInputManager.Instance != null) DrawInputManager.Instance.enableGoToStoreOnClick();
    }

    public GoToMap3WithAnimation(): void {
        if (DrawInputManager.Instance != null) DrawInputManager.Instance.forceDropItem();
        void this.runMap2ToMap3Sequence();
    }

    private async runMap2ToMap3Sequence(): Promise<void> {
        if (this.map2ToMap3Sequence && this.map2ToMap3Sequence.length > 0) {
            for (const step of this.map2ToMap3Sequence) {
                if (step.targetAnimator && step.triggerName) {
                    const anim = step.targetAnimator.getComponent(Animation);
                    if (anim) anim.play(step.triggerName);
                }

                EventHandler.emitEvents(step.onStepStart);

                if (step.delayAfter > 0) {
                    await this.delay(step.delayAfter);
                }
            }
        }

        // Sau khi chạy hết chuỗi (hoặc nếu chuỗi trống), tự bật Map 3 nếu được phép
        if (this.autoSwitchToMap3AtEnd) {
            this.TurnOnMap3();
        }
    }

    /** Promise delay dựa trên scheduleOnce (thay cho WaitForSeconds của Unity). */
    private delay(seconds: number): Promise<void> {
        return new Promise((resolve) => {
            this.scheduleOnce(() => resolve(), seconds);
        });
    }

    // Khai báo UI cho custom inspector (extension ply-inspector). Không hard-code trong extension.
    public getInspectorConfig() {
        return {
            sections: [
                { header: '1. Build Settings', props: ['isGoogleBuild', 'googleDisabledObjects', 'googleDisabledBehaviours'] },
                { header: '2. Map Objects', props: ['listObjectInIntro', 'listObjectInMap1', 'listObjectInMap2', 'listObjectInMap3', 'listObjectInMap4'] },
                { header: '3. Map2 → Map3 Sequence', props: ['autoSwitchToMap3AtEnd', 'map2ToMap3Sequence'] },
            ],
            buttonsHeader: '4. Công cụ Test Map',
            buttons: [
                { label: 'Chỉ bật Intro', method: 'TurnOnIntro', color: 'primary' },
                { label: 'Chỉ bật Map 1', method: 'TurnOnMap1', color: 'success' },
                { label: 'Chỉ bật Map 2', method: 'TurnOnMap2', color: 'warn' },
                { label: 'Chỉ bật Map 3', method: 'TurnOnMap3', color: 'warn' },
                { label: 'Chỉ bật Map 4', method: 'TurnOnMap4', color: 'danger' },
            ],
        };
    }
}
