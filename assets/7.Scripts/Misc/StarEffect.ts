import { _decorator, ParticleSystem2D } from 'cc';
import { Ply_GameUnit } from '../ScriptTemplate/Ply_GameUnit';
import { Ply_Pool, PoolType } from '../ScriptTemplate/Ply_Pool';

const { ccclass, property } = _decorator;

/**
 * Hieu ung ngoi sao ban ra khi item snap trung Snap Target.
 *
 * Prefab Star truoc day gan script Cloud (ke thua PoolMember - he thong pool khac),
 * nen Ply_Pool.spawn() khong tim thay Ply_GameUnit va tra ve null. Script nay ke thua
 * dung Ply_GameUnit de Ply_Pool quan ly duoc, va tu tra ve pool sau `duration` giay.
 */
@ccclass('StarEffect')
export class StarEffect extends Ply_GameUnit {

    @property({ tooltip: "Thời gian hiệu ứng tồn tại trước khi tự động biến mất (đơn vị: giây)" })
    public duration: number = 2.0;

    protected onEnable(): void {
        // Bắn lại particle từ đầu. Ply_Pool.replayEffects đã gọi resetSystem() khi spawn,
        // nhưng lần đầu instantiate node vẫn đang tắt nên particle chưa chạy -> gọi lại ở đây.
        const particles = this.node.getComponentsInChildren(ParticleSystem2D);
        for (let i = 0; i < particles.length; i++) {
            const ps = particles[i];
            if (!ps || !ps.isValid) continue;
            ps.resetSystem();
        }

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
            Ply_Pool.Ins.despawn(PoolType.Star, this);
        } else {
            this.node.active = false;
        }
    }
}
