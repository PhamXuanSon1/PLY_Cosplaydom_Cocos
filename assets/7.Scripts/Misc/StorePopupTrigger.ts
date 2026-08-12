import { _decorator, Component, EventHandler, input, Input, EventTouch, CCInteger, Node } from 'cc';
import { DrawItemManager } from '../Manager/DrawItemManager';
import { AppLovinAnalytics } from '../Tool/AppLovinAnalytics';
import { GameManager } from '../Manager/GameManager';

const { ccclass, property } = _decorator;

@ccclass('StorePopupTrigger')
export class StorePopupTrigger extends Component {

    @property({
        group: { name: 'Cài đặt điều kiện', id: 'condition' },
        tooltip: 'Index của map, Map 1 là 0, Map 2 là 1, Map 3 là 2',
        type: CCInteger
    })
    public targetMapIndex: number = 1; 

    @property({
        group: { name: 'Cài đặt điều kiện', id: 'condition' },
        tooltip: 'Số lượng item (hoặc makeup target) cần hoàn thành để kích hoạt tính năng này',
        type: CCInteger
    })
    public itemsRequired: number = 1;

    @property({
        group: { name: 'Cài đặt điều kiện', id: 'condition' },
        tooltip: 'BẬT: Mở Store ngay lập tức khi chơi đủ số item mà KHÔNG CẦN click thêm.\nTẮT: Chờ người chơi click chuột lần tiếp theo mới mở Store.'
    })
    public triggerImmediately: boolean = true;

    @property({
        type: [EventHandler],
        group: { name: 'Sự kiện mở Store', id: 'event' },
        tooltip: 'Kéo thả logic mở cửa hàng vào đây (VD: Kéo UI Store vào và chọn hành động)'
    })
    public onOpenStore: EventHandler[] = [];

    // Tránh việc gọi sự kiện nhiều lần trong 1 frame hoặc khi đã hiển thị Store
    private hasTriggeredStore: boolean = false;

    protected onEnable(): void {
        // Đăng ký sự kiện touch toàn cục để bắt thả chuột/chạm tay
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    protected onDisable(): void {
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    protected update(dt: number): void {
        const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
        if (drawItemMgr == null) return;

        // 2. Chỉ hoạt động ở Map chỉ định
        if (drawItemMgr.currentMapIndex !== this.targetMapIndex) {
            this.hasTriggeredStore = false; // Reset trạng thái nếu sang map khác
            return;
        }

        // 3. Đếm số lượng item/makeup đã hoàn thành ở Map hiện tại
        const completedCount = this.getCompletedItemsInCurrentMap(drawItemMgr);

        // 4. Nếu đủ số lượng yêu cầu
        if (completedCount >= this.itemsRequired) {
            if (!this.hasTriggeredStore) {
                if (this.triggerImmediately) {
                    this.hasTriggeredStore = true;
                    EventHandler.emitEvents(this.onOpenStore);

                    if (GameManager.instance) {
                        GameManager.instance.GotoStore();
                    } else if ((globalThis as any).GameManager?.instance) {
                        (globalThis as any).GameManager.instance.GotoStore();
                    }
                }
            }
        }
    }

    private onTouchEnd(event: EventTouch): void {
        // Nếu triggerImmediately = true thì logic đã chạy trong update rồi
        if (this.triggerImmediately) return; 

        const drawItemMgr = DrawItemManager.Instance || (globalThis as any).DrawItemManager?.Instance || (window as any).DrawItemManager?.Instance;
        if (drawItemMgr == null) return;

        if (drawItemMgr.currentMapIndex !== this.targetMapIndex) return;

        const completedCount = this.getCompletedItemsInCurrentMap(drawItemMgr);
        if (completedCount >= this.itemsRequired) {
            if (!this.hasTriggeredStore) {
                this.hasTriggeredStore = true;
                EventHandler.emitEvents(this.onOpenStore);

                const progressMgr = (globalThis as any).ProgressTrackingManager?.Instance || (window as any).ProgressTrackingManager?.Instance;
                if (progressMgr && typeof progressMgr.NotifyEndcardShown === 'function') {
                    progressMgr.NotifyEndcardShown();
                } else {
                    AppLovinAnalytics.endcardShown();
                }
            }
        }
    }

    private getCompletedItemsInCurrentMap(drawItemMgr: DrawItemManager): number {
        let count = 0;
        
        if (drawItemMgr.mapConfigs == null || drawItemMgr.mapConfigs.length <= drawItemMgr.currentMapIndex) {
            return count;
        }
            
        const currentConfig = drawItemMgr.mapConfigs[drawItemMgr.currentMapIndex];

        // 1. Đếm các Item trực tiếp trong danh sách Items In Map (DrawItemController / SnapToTarget)
        if (currentConfig.itemsInMap != null) {
            for (const item of currentConfig.itemsInMap) {
                if (item != null && item.isCompleted) {
                    count++;
                }
            }
        }

        // 2. Đếm các Target trong danh sách Targets In Map (MakeupTarget)
        if (currentConfig.targetsInMap != null) {
            for (const target of currentConfig.targetsInMap) {
                if (target != null && target.isApplied) {
                    count++;
                }
            }
        }

        return count;
    }
}
