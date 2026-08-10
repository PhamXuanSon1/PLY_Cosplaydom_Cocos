import { _decorator, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Lop co ban cho cac game unit (doi tuong dung trong pool).
 * Tuong duong voi Ply_GameUnit : MonoBehaviour trong Unity.
 * 
 * Trong Unity, `tf` la transform duoc cache.
 * Trong Cocos, moi Component deu co san `this.node` tuong duong.
 */
@ccclass('Ply_GameUnit')
export class Ply_GameUnit extends Component {

    /**
     * Tham chieu toi node cua unit nay (tuong duong Transform `tf` trong Unity).
     * Trong Cocos, `this.node` luon co san, nhung ta giu getter nay
     * de tuong thich voi code dung `gameUnit.tf`.
     */
    public get tf(): Node {
        return this.node;
    }
}
