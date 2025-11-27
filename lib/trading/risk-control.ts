/**
 * Risk Control Configuration and Utilities
 */

export interface RiskConfig {
    tradingMode: "dry-run" | "live";
    maxPositionSizeUSDT: number;
    maxLeverage: number;
    dailyLossLimitPercent: number;
}

export interface RiskCheckResult {
    allowed: boolean;
    reason?: string;
}

/**
 * Get risk control configuration from environment variables
 */
export function getRiskConfig(): RiskConfig {
    const mode = (process.env.TRADING_MODE || "dry-run").toLowerCase();

    return {
        tradingMode: mode === "live" ? "live" : "dry-run",
        maxPositionSizeUSDT: Number(process.env.MAX_POSITION_SIZE_USDT || 5000),
        maxLeverage: Number(process.env.MAX_LEVERAGE || 30),
        dailyLossLimitPercent: Number(process.env.DAILY_LOSS_LIMIT_PERCENT || 20),
    };
}

/**
 * Check if a buy order passes risk controls
 */
export function checkBuyRisk(params: {
    amount: number;
    price: number;
    leverage: number;
    currentBalance: number;
    config: RiskConfig;
}): RiskCheckResult {
    const { amount, price, leverage, currentBalance, config } = params;

    // Check leverage limit
    if (leverage > config.maxLeverage) {
        return {
            allowed: false,
            reason: `Leverage ${leverage}x exceeds maximum ${config.maxLeverage}x`,
        };
    }

    // Check position size limit
    const positionValue = amount * price;
    if (positionValue > config.maxPositionSizeUSDT) {
        return {
            allowed: false,
            reason: `Position size $${positionValue.toFixed(2)} exceeds limit $${config.maxPositionSizeUSDT}`,
        };
    }

    // Check if sufficient balance for margin
    const requiredMargin = positionValue / leverage;
    if (requiredMargin > currentBalance * 0.98) {
        // 允许使用 98% 的余额 (更激进的杠杆策略)
        return {
            allowed: false,
            reason: `Insufficient balance. Required margin: $${requiredMargin.toFixed(2)}, Available: $${currentBalance.toFixed(2)}`,
        };
    }

    return { allowed: true };
}

/**
 * Check if daily loss limit has been reached
 */
export function checkDailyLossLimit(params: {
    todayPnL: number;
    initialCapital: number;
    config: RiskConfig;
}): RiskCheckResult {
    const { todayPnL, initialCapital, config } = params;

    const lossPercent = (Math.abs(todayPnL) / initialCapital) * 100;

    if (todayPnL < 0 && lossPercent >= config.dailyLossLimitPercent) {
        return {
            allowed: false,
            reason: `Daily loss limit reached: -${lossPercent.toFixed(2)}% (limit: ${config.dailyLossLimitPercent}%)`,
        };
    }

    return { allowed: true };
}

/**
 * Log trade execution (for audit trail)
 */
export function logTrade(params: {
    action: "buy" | "sell" | "dry-run-buy" | "dry-run-sell";
    symbol: string;
    amount: number;
    price?: number;
    leverage?: number;
    orderId?: string;
    reason?: string;
}) {
    const timestamp = new Date().toISOString();
    console.log(
        `[${timestamp}] TRADE: ${params.action.toUpperCase()} ${params.symbol}`,
        JSON.stringify(
            {
                amount: params.amount,
                price: params.price,
                leverage: params.leverage,
                orderId: params.orderId,
                reason: params.reason,
            },
            null,
            2
        )
    );
}
