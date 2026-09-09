import { Collider2D, Component, Node, RigidBody2D } from 'cc';

/**
 * Physics2DSync
 *
 * Helper dùng chung để ép Box2D rebuild lại fixture/body cho một nhóm Node.
 *
 * LƯU Ý QUAN TRỌNG VỀ THỨ TỰ:
 * - Khi TẮT: phải tắt Collider2D TRƯỚC, RigidBody2D SAU.
 * - Khi BẬT: phải bật RigidBody2D TRƯỚC, Collider2D SAU.
 *
 * Nếu tắt RigidBody2D trước, b2Body bị destroy kèm toàn bộ fixture của nó.
 * Sau đó Collider2D mới tắt sẽ gọi body.DestroyFixture() trên body đã chết
 * => proxy trong b2DynamicTree bị free 2 lần => cây bị hỏng và lần query sau
 * (PhysicsSystem2D.testPoint / raycast) văng lỗi "b2GrowableStack.Pop".
 */

/** Tắt collider + body theo đúng thứ tự, trả về danh sách để bật lại sau. */
export function disablePhysics2D(
    colliders: Collider2D[],
    bodies: RigidBody2D[],
    outColliders: Collider2D[],
    outBodies: RigidBody2D[],
): void {
    for (const col of colliders) {
        if (col && col.isValid && col.enabled) {
            outColliders.push(col);
            col.enabled = false;
        }
    }
    for (const body of bodies) {
        if (body && body.isValid && body.enabled) {
            outBodies.push(body);
            body.enabled = false;
        }
    }
}

/** Bật lại collider + body theo đúng thứ tự, bỏ qua component đã bị destroy. */
export function enablePhysics2D(colliders: Collider2D[], bodies: RigidBody2D[]): void {
    for (const body of bodies) {
        if (body && body.isValid && body.node && body.node.isValid) body.enabled = true;
    }
    for (const col of colliders) {
        if (col && col.isValid && col.node && col.node.isValid) col.enabled = true;
    }
}

/**
 * Rebuild physics cho các Node (và Node con) sau khi đổi transform/animation.
 * Tắt frame này, bật lại frame sau.
 */
export function rebuildPhysics2D(scheduler: Component, roots: (Node | null)[]): void {
    if (!scheduler || !scheduler.isValid) return;

    const activeColliders: Collider2D[] = [];
    const activeBodies: RigidBody2D[] = [];

    for (const root of roots) {
        if (!root || !root.isValid) continue;
        disablePhysics2D(
            root.getComponentsInChildren(Collider2D),
            root.getComponentsInChildren(RigidBody2D),
            activeColliders,
            activeBodies,
        );
    }

    if (activeColliders.length === 0 && activeBodies.length === 0) return;

    scheduler.scheduleOnce(() => {
        enablePhysics2D(activeColliders, activeBodies);
    }, 0);
}
