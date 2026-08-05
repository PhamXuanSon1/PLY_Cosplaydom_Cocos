import { _decorator, Component, Node, Prefab, instantiate, Vec3, Quat, CCInteger, Enum } from 'cc';
import { Ply_Singleton } from './Ply_Singleton';
import { Ply_GameUnit } from './Ply_GameUnit';
const { ccclass, property } = _decorator;

/**
 * Enum cac loai Pool - them cac loai khac neu can.
 */
export enum PoolType {
    Heart = 0,
    CorrectEffect = 1,
    BreakHeart = 2,
}
// Dang ky enum de hien thi tren inspector cua Cocos Creator
Enum(PoolType);

/**
 * Quan ly Object Pool duoc chuyen tu Unity Ply_Pool.
 * 
 * Diem khac biệt so voi Unity:
 * - Dung Prefab thay vi tham chieu gameUnit truc tiep de khoi tao
 * - Dung node.active thay vi gameObject.SetActive()
 * - Dung instantiate() tu 'cc' thay vi UnityEngine.Object.Instantiate()
 * - Dat vi tri/goi quay qua node.setPosition() va node.setRotation()
 */
@ccclass('PoolAmount')
class PoolAmount {
    @property({ type: PoolType })
    type: PoolType = PoolType.Heart;

    @property(CCInteger)
    amount: number = 0;

    @property(Prefab)
    prefab: Prefab | null = null;
}

@ccclass('Ply_Pool')
export class Ply_Pool extends Ply_Singleton {

    public static Ins: Ply_Pool | null = null;

    @property([PoolAmount])
    poolAmounts: PoolAmount[] = [];

    private dict: Map<PoolType, Ply_GameUnit[]> = new Map();


    // onLoad() la ham duoc goi khi component duoc khoi tao, truoc khi bat dau scene
    onLoad() {
        super.onLoad();
        Ply_Pool.Ins = this;
        this.onInit();
    }


    // Ham khoi tao pool, tao cac game unit va luu vao dict
    private onInit() {
        for (let i = 0; i < this.poolAmounts.length; i++) {
            const poolAmount = this.poolAmounts[i];


            // Neu chua co danh sach cho loai pool nay, tao mot danh sach moi
            if (!this.dict.has(poolAmount.type)) {
                this.dict.set(poolAmount.type, []);
            }


            // Khoi tao cac game unit va them vao danh sach
            for (let j = 0; j < poolAmount.amount; j++) {
                if (!poolAmount.prefab) continue;

                const unitNode = instantiate(poolAmount.prefab);
                unitNode.active = false;
                unitNode.setParent(this.node);

                const gameUnit = unitNode.getComponent(Ply_GameUnit);
                if (gameUnit) {
                    this.dict.get(poolAmount.type)!.push(gameUnit);
                }
            }
        }
    }

    /**
     * Lay mot game unit ra tu pool (spawn).
     * @param poolType - Loai doi tuong can spawn
     * @param pos - Vi tri the gioi
     * @param rot - Goc quay (Quat), mac dinh la identity
     * @returns Ply_GameUnit duoc spawn
     */
    public spawn(poolType: PoolType, pos: Vec3, rot: Quat = new Quat()): Ply_GameUnit | null {
        const queue = this.dict.get(poolType); // Lay danh sach game unit tu pool
        let gameUnit: Ply_GameUnit | null = null; // Khai bao bien gameUnit de luu ket qua

        // Neu co game unit trong pool, lay mot cai ra va xoa khoi danh sach
        if (queue && queue.length > 0) {
            gameUnit = queue.shift()!; // queue.shift() lay phan tu dau tien va xoa khoi danh sach
        } else {
            // Neu khong co san trong pool, khoi tao mot cai moi
            const prefab = this.getPrefab(poolType);
            if (!prefab) return null;

            // Khoi tao mot node moi tu prefab va lay component Ply_GameUnit
            const unitNode = instantiate(prefab);
            unitNode.setParent(this.node);
            gameUnit = unitNode.getComponent(Ply_GameUnit);
        }

        if (gameUnit) {
            gameUnit.node.setPosition(pos);
            gameUnit.node.setRotation(rot);
            gameUnit.node.active = true;
        }

        return gameUnit;
    }

    /**
     * Tra game unit ve lai pool (despawn).
     * @param poolType - Loai doi tuong
     * @param gameUnit - Game unit can thu hoi
     */
    public despawn(poolType: PoolType, gameUnit: Ply_GameUnit) {
        gameUnit.node.active = false;

        if (!this.dict.has(poolType)) {
            this.dict.set(poolType, []);
        }
        this.dict.get(poolType)!.push(gameUnit);
    }

    /**
     * Lay prefab tuong ung voi loai pool.
     */
    public getPrefab(poolType: PoolType): Prefab | null {
        for (let i = 0; i < this.poolAmounts.length; i++) {
            if (this.poolAmounts[i].type === poolType) {
                return this.poolAmounts[i].prefab;
            }
        }
        return null;
    }

    onDestroy() {
        super.onDestroy();
        if (Ply_Pool.Ins === this) {
            Ply_Pool.Ins = null;
        }
    }
}
