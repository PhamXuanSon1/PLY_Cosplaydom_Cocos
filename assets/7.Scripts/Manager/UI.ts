import { _decorator, Animation, Camera, Color, Component, Director, Enum, EventTouch, Label, misc, Node, ParticleSystem2D, PhysicsSystem, PhysicsSystem2D, Collider2D, RigidBody2D, size, Size, Sprite, toDegree, Tween, tween, UITransform, v2, v3, Vec2, Vec3, view, Widget } from 'cc';
import { World } from './World';
import { PointerController } from './PointerController';
import { SoundType } from './SoundManager';
import { Clock } from './Clock';
import { disablePhysics2D, enablePhysics2D } from '../Utils/Physics2DSync';
const { ccclass, property } = _decorator;

export enum BindUIType {
    Left,
    Right,
    Top,
    Bottom
}

@ccclass("BindingUI")
export class BindingUI {
    @property([Node])
    binds: Node[] = [];

    @property({type: Enum(BindUIType)})
    type: BindUIType = BindUIType.Left;
}

export var ui: UI = null;

@ccclass('UI')
export class UI extends Component {

    @property(Camera)
    uiCam: Camera = null;
    @property(Camera)
    pCam: Camera = null;
    @property(Node)
    hand: Node = null!;
    @property(Node)
    endcard: Node = null!;
    @property(Node)
    winCard: Node = null!;
    win: boolean = false;

    resizeFuncs: Function[] = [];
    onStoreFuncs: Function[] = [];

    onLoad() {
        ui = this;
    }

    bindingToStore() {
        PointerController.ins.unBindingEvent();
        PointerController.ins.onStore();
    }

    openStore(...args: any) {
        console.log('openStore');  
        World.ins.soundmanager.stopAll();      
        World.ins.openStore.redirectToStore();
    }

    first: boolean = true;
    firstMove() {
        if(this.first) {
            this.first = false;
            this.fisrtOn.forEach(node => { if (node) node.active = true; });
            this.firstOff.forEach(node => { if (node) node.active = false; });
        }
    }

    onLose() {
        if(this.endcard?.active || this.winCard?.active) return;  
        this.offEnds.forEach(button => { if (button) button.active = false; });
        this.offHand();
        if (this.endcard) this.endcard.active = true;
        this.bindingToStore();       
        World.ins.soundmanager.playSound(SoundType.Fail);    
    }


    onWin() {
        if(this.endcard?.active || this.winCard?.active) return; 
        this.offEnds.forEach(button => { if (button) button.active = false; });
        this.offHand();
        if (this.winCard) this.winCard.active = true;
        this.bindingToStore();  
        World.ins.soundmanager.playSound(SoundType.Win);      
    }

    offHand() {
        this.hand.active = false;
    }


    @property(BindingUI)
    topNode: BindingUI = null!;
    @property(BindingUI)
    bottomNode: BindingUI = null!;
    @property(BindingUI)
    leftNode: BindingUI = null!;
    @property(BindingUI)
    rightNode: BindingUI = null!;      
    @property([BindingUI])
    bindings: BindingUI[] = [];

    getEdge(type: BindUIType) {
        switch(type) {
            case BindUIType.Top:
                return this.topNode.binds[0].getWorldPosition().y;
            case BindUIType.Bottom:
                return this.bottomNode.binds[0].getWorldPosition().y;
            case BindUIType.Left:
                return this.leftNode.binds[0].getWorldPosition().x;
            case BindUIType.Right:
                return this.rightNode.binds[0].getWorldPosition().x;
        }
    }

    initialOffsets: Map<Node, Vec3> = new Map();
    lastWidth: number = 0;
    lastHeight: number = 0;

    bind() {
        if (!this.uiCam) return;
        let pos = this.uiCam.node.position.clone();
        
        if (this.topNode?.binds?.[0]) {
            let item = this.topNode.binds[0];
            if (!this.initialOffsets.has(item)) this.initialOffsets.set(item, item.position.clone());
            let initPos = this.initialOffsets.get(item)!;
            item.position = v3(initPos.x + pos.x, this.height + pos.y, initPos.z);
        }

        if (this.bottomNode?.binds?.[0]) {
            let item = this.bottomNode.binds[0];
            if (!this.initialOffsets.has(item)) this.initialOffsets.set(item, item.position.clone());
            let initPos = this.initialOffsets.get(item)!;
            item.position = v3(initPos.x + pos.x, -this.height + pos.y, initPos.z);
        }

        if (this.leftNode?.binds?.[0]) {
            let item = this.leftNode.binds[0];
            if (!this.initialOffsets.has(item)) this.initialOffsets.set(item, item.position.clone());
            let initPos = this.initialOffsets.get(item)!;
            item.position = v3(-this.width + pos.x, initPos.y + pos.y, initPos.z);
        }

        if (this.rightNode?.binds?.[0]) {
            let item = this.rightNode.binds[0];
            if (!this.initialOffsets.has(item)) this.initialOffsets.set(item, item.position.clone());
            let initPos = this.initialOffsets.get(item)!;
            item.position = v3(this.width + pos.x, initPos.y + pos.y, initPos.z);
        }

        this.bindings.forEach(bind => {
            if (!bind || !bind.binds) return;
            bind.binds.forEach(item => {
                if (!item || !item.parent) return;
                if (!this.initialOffsets.has(item)) this.initialOffsets.set(item, item.position.clone());
                let pos = item.getWorldPosition();
                switch(bind.type) {
                    case BindUIType.Top:
                        pos.y = this.getEdge(bind.type);
                        break;
                    case BindUIType.Bottom:
                        pos.y = this.getEdge(bind.type);
                        break;
                    case BindUIType.Left:
                        pos.x = this.getEdge(bind.type);
                        break;
                    case BindUIType.Right:
                        pos.x = this.getEdge(bind.type);
                        break;
                }
                let lpos = item.parent.inverseTransformPoint(v3(), pos);
                item.position = lpos;
            });
        });
    }

    keepTap() {    
        if(this.current && this.hand.active) {
            this.handTap(this.current);
        }   
    }

    width: number = 0;
    height: number = 0;
    scale: number = 0;
    
    @property([Node])
    offButtons: Node[] = [];
    @property([Node])
    offEnds: Node[] = [];

    @property([Node])
    fisrtOn: Node[] = [];
    @property([Node])
    firstOff: Node[] = [];

    @property([Node])
    adaptUIs: Node[] = [];
    @property([Node])
    gameplays: Node[] = []

    @property([Node])
    portraitNodes: Node[] = [];
    @property([Node])
    landscapeNodes: Node[] = [];


    firstScale: boolean = false;
    resize(scale: number = this.scale) {
        this.scale = scale;
        let time = 0;
        let visibleSize = view.getVisibleSize();
        this.height = this.uiCam ? this.uiCam.orthoHeight : 960;
        if (visibleSize.height > 0) {
            this.width = (visibleSize.width / visibleSize.height) * this.height;
        } else {
            this.width = 1080/2350 * this.height * scale;
        }
        
        setTimeout(() => {            
            this.keepTap();          
        }, time);

        let isPortrait = visibleSize.width < visibleSize.height;
        if (isPortrait) {
            scale = misc.clampf(scale, 0, 1.1); 
            this.portraitNodes.forEach((item) => {
                if (item) item.active = true;
            });
            this.landscapeNodes.forEach((item) => {
                if (item) item.active = false;
            });
            this.adaptUIs.forEach((item) => {
                if (item) item.scale = v3(1, 1, 1);
            });
            this.gameplays.forEach((item) => {
                if (item) item.scale = v3(1, 1, 1).multiplyScalar(scale);
            });
        } else {
            this.portraitNodes.forEach((item) => {
                if (item) item.active = false;
            });
            this.landscapeNodes.forEach((item) => {
                if (item) item.active = true;
            });
            this.adaptUIs.forEach((item) => {
                if (item) item.scale = v3(1, 1, 1);
            });
            this.gameplays.forEach((item) => {
                if (item) item.scale = v3(1, 1, 1).multiplyScalar(1.1);
            });
        }
        this.bind();
        this.syncPhysics();
    }

    /**
     * Ép hệ thống Physics2D đồng bộ lại vị trí/kích thước collider
     * sau khi UI.ts thay đổi scale/position của các Node.
     * Fix lỗi collider bị lệch trên Chrome so với Editor.
     */
    private syncPhysics(): void {
        if (!PhysicsSystem2D.instance) return;

        // Đợi 1 frame để transform đã cập nhật xong
        this.scheduleOnce(() => {
            const nodesToSync = [...this.gameplays, ...this.adaptUIs];
            const activeBodies: RigidBody2D[] = [];
            const activeColliders: Collider2D[] = [];

            for (const parentNode of nodesToSync) {
                if (!parentNode || !parentNode.isValid) continue;

                // Tắt Collider TRƯỚC, RigidBody SAU. Ngược thứ tự sẽ destroy fixture
                // 2 lần và làm hỏng b2DynamicTree (lỗi b2GrowableStack.Pop khi testPoint).
                disablePhysics2D(
                    parentNode.getComponentsInChildren(Collider2D),
                    parentNode.getComponentsInChildren(RigidBody2D),
                    activeColliders,
                    activeBodies,
                );
            }

            if (activeBodies.length === 0 && activeColliders.length === 0) return;

            // Đợi thêm 1 frame nữa rồi bật lại để Box2D rebuild hoàn toàn
            this.scheduleOnce(() => {
                enablePhysics2D(activeColliders, activeBodies);
            }, 0);
        }, 0);
    }

    handTap(node: Node) {
        if(!node) return;
        this.current = node;
        this.hand.worldPosition = node.getWorldPosition();
        this.hand.active = true;
    }

    moveDir: number = 1;
    startHand: Node = null!;
    endHand: Node = null!;
    current: Node = null!;
    cTween: Tween<any> = null!;
    hTween: Tween<any> = null!;
    isFirtMove: number = 0;
    delayTime: number = 0;
    moveHand() {
        if(!this.startHand || !this.endHand) return;
        let dt = this.delayTime;
        if(this.isFirtMove > 0) {
            this.isFirtMove--;
            dt = 0;
        }
        this.hTween = tween({t: 0})
        .delay(dt)
        .call(() => {
            this.handTap(this.startHand);
            const hand = this.hand;
            let child = this.hand.children[0].getComponentInChildren(Sprite)!;
            child.color = new Color(255, 255, 255, 255);
            let pos = this.endHand.getWorldPosition();
            let delta = this.hand.worldPosition.clone().subtract(pos);
            
            if(this.moveDir == 0) {
                let p = v3(pos.x, this.hand.worldPosition.y,  this.hand.worldPosition.z);
                let time = delta.length() * 0.5;

                this.hTween = tween(this.hand)
                .delay(0.2)
                .to(time, {worldPosition: p}, {easing: 'smooth'})
                .call(() => {          
                    p = v3(this.hand.worldPosition.x,  this.hand.worldPosition.y, pos.z);
                    let time = delta.length() * 0.5;
                    this.hTween = tween(this.hand)
                    .to(time, {worldPosition: p}, {easing: 'smooth'})
                    .call(() => {
                        this.cTween = tween(child).delay(0.2).to(0.2, {color: new Color(255, 255, 255, 0)}, {easing: 'smooth'})
                        .call(() => {
                            this.moveHand();
                        })
                        .start();   
                    })
                    .start();
                })
                .start();

            } else if (this.moveDir == 1) {
                let p = v3(pos.x, pos.y, pos.z);
                let time = delta.length() / 1000;

                this.hTween = tween(this.hand)
                .delay(0.2)
                .to(time, {worldPosition: p}, {easing: 'smooth',
                    onUpdate(target, ratio) {
                    },
                })
                .call(() => {         
                    this.cTween = tween(child).delay(0.2).to(0.2, {}, {easing: 'smooth',
                        onUpdate(target, ratio) {
                            child.color = new Color(255, 255, 255, 255 * (1 - ratio));
                        },
                    })
                    .call(() => {
                        this.moveHand();
                    })
                    .start();   
                })
                .start();
            }
        })
        .start();
    }

    start() {

        try{
            if(PlayableSDK.channel == "Google") {
                this.offButtons.forEach(button => { if (button) button.active = false; });
            }
        } catch(error){

        }
    }

    update(dt: number) {
        let size = view.getVisibleSize();
        let scale = size.width / 1080;
        if (scale != this.scale || size.width !== this.lastWidth || size.height !== this.lastHeight) {
            this.lastWidth = size.width;
            this.lastHeight = size.height;
            this.resize(scale);
        }
    }
}


