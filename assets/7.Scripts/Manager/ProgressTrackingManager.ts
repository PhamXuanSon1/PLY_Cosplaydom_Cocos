import { _decorator, Component, CCInteger } from 'cc';
import { AppLovinAnalytics } from '../Tool/AppLovinAnalytics';

const { ccclass, property } = _decorator;

/**
 * ProgressTrackingManager
 * Quản lý đếm tiến độ hoàn thành các item/mục tiêu và tự động kích hoạt
 * các sự kiện AppLovinAnalytics tương ứng:
 * - challengeStarted(): Khi bắt đầu chơi / quẹt item đầu tiên
 * - challenge25(): Khi đạt 25% tổng số item
 * - challenge50(): Khi đạt 50% tổng số item
 * - challenge75(): Khi đạt 75% tổng số item
 * - challengeSolved(): Khi hoàn thành 100% tổng số item
 * - endcardShown(): Khi hiển thị Store popup / Endcard
 * - ctaClicked(): Khi bấm vào CTA ra Store
 */
@ccclass('ProgressTrackingManager')
export class ProgressTrackingManager extends Component {

    public static Instance: ProgressTrackingManager | null = null;

    @property({
        type: CCInteger,
        tooltip: 'Tổng số lượng item/mục tiêu cần hoàn thành trong game (dùng để tự động tính mốc 25%, 50%, 75%, 100%)'
    })
    public totalItemsRequired: number = 4;

    private currentProgress: number = 0;
    private hasStarted: boolean = false;
    private passed25: boolean = false;
    private passed50: boolean = false;
    private passed75: boolean = false;
    private solved: boolean = false;

    protected onLoad(): void {
        ProgressTrackingManager.Instance = this;
        (globalThis as any).ProgressTrackingManager = ProgressTrackingManager;
    }

    /** Gọi khi bắt đầu tương tác đầu tiên hoặc bắt đầu màn chơi */
    public StartChallenge(): void {
        if (this.hasStarted) return;
        this.hasStarted = true;
        AppLovinAnalytics.challengeStarted();
        console.log('[AppLovinAnalytics] -> challengeStarted()');
    }

    /** 
     * Gọi khi hoàn thành 1 item/mục tiêu.
     * Tự động tính toán % và gọi các mốc 25%, 50%, 75%, 100% (challengeSolved)
     */
    public AddProgress(amount: number = 1): void {
        if (!this.hasStarted) {
            this.StartChallenge();
        }

        this.currentProgress += amount;
        const total = Math.max(1, this.totalItemsRequired);
        const percent = (this.currentProgress / total) * 100;

        console.log(`[ProgressTracking] Tiến độ: ${this.currentProgress}/${total} (${percent.toFixed(1)}%)`);

        if (percent >= 25 && !this.passed25) {
            this.passed25 = true;
            AppLovinAnalytics.challenge25();
            console.log('[AppLovinAnalytics] -> challenge25()');
        }

        if (percent >= 50 && !this.passed50) {
            this.passed50 = true;
            AppLovinAnalytics.challenge50();
            console.log('[AppLovinAnalytics] -> challenge50()');
        }

        if (percent >= 75 && !this.passed75) {
            this.passed75 = true;
            AppLovinAnalytics.challenge75();
            console.log('[AppLovinAnalytics] -> challenge75()');
        }

        if (percent >= 100 && !this.solved) {
            this.solved = true;
            AppLovinAnalytics.challengeSolved();
            console.log('[AppLovinAnalytics] -> challengeSolved()');
        }
    }

    /** Gọi khi hiển thị Endcard / Store popup */
    public NotifyEndcardShown(): void {
        AppLovinAnalytics.endcardShown();
        console.log('[AppLovinAnalytics] -> endcardShown()');
    }

    /** Gọi khi người chơi bấm nút Store / CTA */
    public NotifyCtaClicked(): void {
        AppLovinAnalytics.ctaClicked();
        console.log('[AppLovinAnalytics] -> ctaClicked()');
    }

    /** Gọi khi người chơi thua/thất bại */
    public NotifyChallengeFailed(): void {
        AppLovinAnalytics.challengeFailed();
        console.log('[AppLovinAnalytics] -> challengeFailed()');
    }

    /** Gọi khi chơi lại màn */
    public NotifyChallengeRetry(): void {
        this.currentProgress = 0;
        this.hasStarted = false;
        this.passed25 = false;
        this.passed50 = false;
        this.passed75 = false;
        this.solved = false;
        AppLovinAnalytics.challengeRetry();
        console.log('[AppLovinAnalytics] -> challengeRetry()');
    }
}
