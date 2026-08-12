import { _decorator, Component, Node } from 'cc';
import { Ply_GameUnit } from '../ScriptTemplate/Ply_GameUnit';
import { Ply_Pool, PoolType } from '../ScriptTemplate/Ply_Pool';

const { ccclass, property } = _decorator;

@ccclass('BreakHeartEffect')
export class BreakHeartEffect extends Ply_GameUnit {

    @property({ tooltip: "Thời gian hiệu ứng tồn tại trước khi tự động biến mất (đơn vị: giây)" })
    public duration: number = 2.0;

    protected onEnable(): void {
        // Hẹn giờ tự động cất vào Pool sau khoảng thời gian duration
        this.scheduleOnce(this.despawn, this.duration);
    }

    protected onDisable(): void {
        // Hủy hẹn giờ nếu đối tượng bị tắt đột ngột (tránh lỗi logic)
        this.unschedule(this.despawn);
    }

    private despawn(): void {
        if (Ply_Pool.Ins) {
            // Trả đối tượng về đúng kho của nó
            Ply_Pool.Ins.despawn(PoolType.BreakHeart, this);
        } else {
            this.node.active = false;
        }
    }
}
