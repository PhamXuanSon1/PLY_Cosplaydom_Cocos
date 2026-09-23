import { _decorator, Component, Node, Vec3, Tween, tween, UIOpacity, CCFloat, Enum } from 'cc';
const { ccclass, property } = _decorator;

enum FadeDirection { None, FromLeft, FromRight, FromTop, FromBottom }
Enum(FadeDirection);

/**
 * Gắn lên node cha. Mỗi lần node được active (onEnable), các node con sẽ
 * fade từ trong suốt + lệch vị trí về đúng vị trí hiện tại (vị trí đặt trong editor).
 */
@ccclass('FadeInChildren')
export class FadeInChildren extends Component {
    @property({ type: FadeDirection, tooltip: 'Hướng các con bay vào' })
    direction: FadeDirection = FadeDirection.FromBottom;

    @property({ type: CCFloat, tooltip: 'Khoảng cách lệch ban đầu (px)' })
    offset: number = 100;

    @property({ type: CCFloat, tooltip: 'Thời gian fade mỗi con (giây)' })
    duration: number = 0.4;

    @property({ type: CCFloat, tooltip: 'Delay giữa các con (giây), 0 = cùng lúc' })
    stagger: number = 0.08;

    @property({ type: CCFloat, tooltip: 'Delay trước khi bắt đầu (giây)' })
    startDelay: number = 0;

    @property({ tooltip: 'Scale từ nhỏ lên kèm theo' })
    useScale: boolean = false;

    @property({ tooltip: 'Chỉ lấy con đang active' })
    onlyActiveChildren: boolean = true;

    // Vị trí/scale gốc của từng con, lưu lần đầu để lần active sau không bị lệch dần
    private originals = new Map<Node, { pos: Vec3; scale: Vec3 }>();

    protected onEnable(): void {
        this.play();
    }

    protected onDisable(): void {
        this.stopAll(true);
    }

    public play(): void {
        const children = this.node.children.filter(c => !this.onlyActiveChildren || c.active);
        children.forEach((child, i) => {
            let orig = this.originals.get(child);
            if (!orig) {
                orig = { pos: child.position.clone(), scale: child.scale.clone() };
                this.originals.set(child, orig);
            }

            const opacity = child.getComponent(UIOpacity) || child.addComponent(UIOpacity);
            Tween.stopAllByTarget(child);
            Tween.stopAllByTarget(opacity);

            child.setPosition(orig.pos.clone().add(this.getOffset()));
            if (this.useScale) child.setScale(orig.scale.clone().multiplyScalar(0.5));
            opacity.opacity = 0;

            const delay = this.startDelay + i * this.stagger;
            const props: any = { position: orig.pos };
            if (this.useScale) props.scale = orig.scale;

            tween(child).delay(delay).to(this.duration, props, { easing: 'quadOut' }).start();
            tween(opacity).delay(delay).to(this.duration, { opacity: 255 }).start();
        });
    }

    private stopAll(restore: boolean): void {
        this.originals.forEach((orig, child) => {
            if (!child.isValid) return;
            Tween.stopAllByTarget(child);
            const opacity = child.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
            if (restore) {
                child.setPosition(orig.pos);
                child.setScale(orig.scale);
                if (opacity) opacity.opacity = 255;
            }
        });
    }

    private getOffset(): Vec3 {
        switch (this.direction) {
            case FadeDirection.FromLeft: return new Vec3(-this.offset, 0, 0);
            case FadeDirection.FromRight: return new Vec3(this.offset, 0, 0);
            case FadeDirection.FromTop: return new Vec3(0, this.offset, 0);
            case FadeDirection.FromBottom: return new Vec3(0, -this.offset, 0);
            default: return new Vec3();
        }
    }
}
