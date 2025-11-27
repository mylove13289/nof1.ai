/**
 * 止盈止损逻辑 - 使用官方SDK
 * 支持自动设置和智能调整
 */

import { getBinanceInstance, getBinanceBaseUrl } from "./binance-official";
import { fetchPositions } from "./positions";
import { getCurrentMarketState } from "./current-market-state";
import crypto from 'crypto';

// Cache for position mode (dual side or one-way)
let positionModeCache: "ONE_WAY" | "DUAL_SIDE" | null = null;

/**
 * Get position mode setting from Binance
 * Returns "ONE_WAY" (单向持仓) or "DUAL_SIDE" (双向持仓)
 */
async function getPositionMode(): Promise<"ONE_WAY" | "DUAL_SIDE"> {
    if (positionModeCache) {
        return positionModeCache;
    }

    try {
        const client = await getBinanceInstance();

        // Try SDK methods first
        try {
            if (typeof (client as any).positionMode === 'function') {
                const resp = await (client as any).positionMode();
                const dualSidePosition = resp.data?.dualSidePosition ?? resp?.dualSidePosition ?? false;
                positionModeCache = dualSidePosition ? "DUAL_SIDE" : "ONE_WAY";
                console.log(`📋 Position mode: ${positionModeCache} (dualSidePosition: ${dualSidePosition})`);
                return positionModeCache;
            }
            if (typeof (client as any).getPositionMode === 'function') {
                const resp = await (client as any).getPositionMode();
                const dualSidePosition = resp.data?.dualSidePosition ?? resp?.dualSidePosition ?? false;
                positionModeCache = dualSidePosition ? "DUAL_SIDE" : "ONE_WAY";
                console.log(`📋 Position mode: ${positionModeCache} (dualSidePosition: ${dualSidePosition})`);
                return positionModeCache;
            }
        } catch (e) {
            // continue to REST fallback
        }

        // REST fallback
        try {
            const tradingMode = process.env.TRADING_MODE || 'dry-run';
            const isDryRun = tradingMode === 'dry-run';
            const apiKey = isDryRun ? (process.env.BINANCE_TESTNET_API_KEY || '') : (process.env.BINANCE_LIVE_API_KEY || '');
            const apiSecret = isDryRun ? (process.env.BINANCE_TESTNET_API_SECRET || '') : (process.env.BINANCE_LIVE_API_SECRET || '');
            const baseUrl = getBinanceBaseUrl().replace(/\/$/, '');
            const timestamp = Date.now();
            const query = `timestamp=${timestamp}`;
            const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
            const url = `${baseUrl}/fapi/v1/positionSide/dual?${query}&signature=${signature}`;
            const resp = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
            if (resp.ok) {
                const data = await resp.json();
                const dualSidePosition = data?.dualSidePosition ?? false;
                positionModeCache = dualSidePosition ? "DUAL_SIDE" : "ONE_WAY";
                console.log(`📋 Position mode (REST): ${positionModeCache} (dualSidePosition: ${dualSidePosition})`);
                return positionModeCache;
            }
        } catch (e) {
            // ignore
        }

        positionModeCache = "ONE_WAY";
        return positionModeCache;
    } catch (error: any) {
        console.warn(`⚠️ Failed to get position mode, defaulting to ONE_WAY:`, error.message);
        positionModeCache = "ONE_WAY";
        return positionModeCache;
    }
}
export interface StopLossTakeProfitParams {
    symbol: string; // e.g., "BTC/USDT"
    stopLoss?: number; // 止损价格
    takeProfit?: number; // 止盈价格
    stopLossPercent?: number; // 止损百分比(相对入场价)
    takeProfitPercent?: number; // 止盈百分比(相对入场价)
    trailingStopPercent?: number; // 追踪止损百分比
}

export interface StopLossTakeProfitResult {
    success: boolean;
    stopLossOrderId?: string;
    takeProfitOrderId?: string;
    error?: string;
}

/**
 * 取消特定持仓方向的止盈止损订单
 * 用于清理旧订单,避免达到订单数量上限
 */
/**
 * 🆕 清理指定持仓的旧止损止盈订单
 */
async function cancelStopLossTakeProfitForPosition(
    binanceSymbol: string,
    positionSide: "LONG" | "SHORT"
): Promise<{ success: boolean; canceledCount: number; error?: string }> {
    try {
        const client = await getBinanceInstance();

        // Get position mode
        const positionMode = await getPositionMode();

        // 🔧 获取该交易对的所有未成交订单
        const openOrders = await (async () => {
            // Try multiple SDK method names first
            try {
                if (typeof (client as any).openOrders === 'function') {
                    const resp = await (client as any).openOrders({ symbol: binanceSymbol });
                    return resp.data || resp || [];
                }
                if (typeof (client as any).getOpenOrders === 'function') {
                    const resp = await (client as any).getOpenOrders({ symbol: binanceSymbol });
                    return resp.data || resp || [];
                }
                if (typeof (client as any).fetchOpenOrders === 'function') {
                    const resp = await (client as any).fetchOpenOrders({ symbol: binanceSymbol });
                    return resp.data || resp || [];
                }
            } catch (e) {
                // fall through to REST fallback
            }

            // REST fallback: sign request and fetch /fapi/v1/openOrders
            try {
                const tradingMode = process.env.TRADING_MODE || 'dry-run';
                const isDryRun = tradingMode === 'dry-run';
                const apiKey = isDryRun ? (process.env.BINANCE_TESTNET_API_KEY || '') : (process.env.BINANCE_LIVE_API_KEY || '');
                const apiSecret = isDryRun ? (process.env.BINANCE_TESTNET_API_SECRET || '') : (process.env.BINANCE_LIVE_API_SECRET || '');
                const baseUrl = getBinanceBaseUrl().replace(/\/$/, '');
                const timestamp = Date.now();
                const query = `symbol=${binanceSymbol}&timestamp=${timestamp}`;
                const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
                const url = `${baseUrl}/fapi/v1/openOrders?${query}&signature=${signature}`;
                const resp = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
                if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
                const data = await resp.json();
                return data || [];
            } catch (e: any) {
                console.error('�?REST fallback for openOrders failed:', e?.message || e);
                return [];
            }
        })();

        console.log(`   📋 Found ${openOrders.length} open orders for ${binanceSymbol} (mode: ${positionMode})`);

        // 筛选出止损止盈�?
        let slTpOrders;
        if (positionMode === "DUAL_SIDE") {
            // 双向持仓模式：需要匹�?positionSide
            slTpOrders = openOrders.filter(
                (order: any) =>
                    (order.type === "STOP_MARKET" || order.type === "TAKE_PROFIT_MARKET") &&
                    order.positionSide === positionSide
            );
        } else {
            // 单向持仓模式：只需要匹配订单类型（不检�?positionSide�?
            slTpOrders = openOrders.filter(
                (order: any) =>
                    order.type === "STOP_MARKET" || order.type === "TAKE_PROFIT_MARKET"
            );
        }

        console.log(`   🎯 Found ${slTpOrders.length} SL/TP orders for ${positionMode === "DUAL_SIDE" ? positionSide : "ONE_WAY"} position`);

        if (slTpOrders.length === 0) {
            console.log(`   ℹ️ No SL/TP orders to clean`);
            return { success: true, canceledCount: 0 };
        }

        let canceledCount = 0;
        for (const order of slTpOrders) {
            try {
                // Try SDK cancel methods
                let canceled = false;
                if (typeof (client as any).cancelOrder === 'function') {
                    await (client as any).cancelOrder(binanceSymbol, { orderId: order.orderId });
                    canceled = true;
                } else if (typeof (client as any).cancel === 'function') {
                    await (client as any).cancel(binanceSymbol, { orderId: order.orderId });
                    canceled = true;
                } else {
                    // REST fallback cancel via API
                    try {
                        const tradingMode = process.env.TRADING_MODE || 'dry-run';
                        const isDryRun = tradingMode === 'dry-run';
                        const apiKey = isDryRun ? (process.env.BINANCE_TESTNET_API_KEY || '') : (process.env.BINANCE_LIVE_API_KEY || '');
                        const apiSecret = isDryRun ? (process.env.BINANCE_TESTNET_API_SECRET || '') : (process.env.BINANCE_LIVE_API_SECRET || '');
                        const baseUrl = getBinanceBaseUrl().replace(/\/$/, '');
                        const timestamp = Date.now();
                        const query = `symbol=${binanceSymbol}&orderId=${order.orderId}&timestamp=${timestamp}`;
                        const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
                        const url = `${baseUrl}/fapi/v1/order?${query}&signature=${signature}`;
                        const resp = await fetch(url, { method: 'DELETE', headers: { 'X-MBX-APIKEY': apiKey } });
                        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                        canceled = true;
                    } catch (e2: any) {
                        console.error(`  �?REST cancel failed for ${order.orderId}:`, e2?.message || e2);
                    }
                }

                if (canceled) {
                    canceledCount++;
                    console.log(`  �?Canceled ${order.type} order: ${order.orderId} (stopPrice: $${order.stopPrice || 'N/A'})`);
                }
            } catch (e: any) {
                console.error(`  �?Failed to cancel order ${order.orderId}:`, e?.response?.data?.msg || e.message);
            }
        }

        return { success: true, canceledCount };
    } catch (error: any) {
        console.error(`   �?Error fetching/canceling orders:`, error?.response?.data?.msg || error.message);
        return {
            success: false,
            canceledCount: 0,
            error: error?.response?.data?.msg || error.message || "Unknown error",
        };
    }
}

/**
 * 为现有持仓设置止盈止�?
 */
export async function setStopLossTakeProfit(
    params: StopLossTakeProfitParams
): Promise<StopLossTakeProfitResult> {
    const { symbol, stopLoss, takeProfit, stopLossPercent, takeProfitPercent } = params;

    if (!symbol || !symbol.includes("/")) {
        return { success: false, error: "Invalid symbol format. Use 'BTC/USDT'" };
    }

    // 允许无参数调用：若未提供百分�?价格，将基于ATR动态计�?

    try {
        const client = await getBinanceInstance();
        const binanceSymbol = symbol.replace("/", "");

        // 获取当前持仓
        console.log(`🔍 Fetching position for ${symbol}...`);
        const positions = await fetchPositions();
        // 🔧 修复：使�?binanceSymbol（无斜杠）进行匹�?
        const position = positions.find((p) => p.symbol === binanceSymbol);

        if (!position || position.contracts === 0) {
            return {
                success: false,
                error: `No open position found for ${symbol}`,
            };
        }

        const positionAmount = Math.abs(position.contracts);
        const isLong = position.side === "long";
        const entryPrice = position.entryPrice;

        console.log(`📊 Position found:`);
        console.log(`   Side: ${isLong ? "LONG" : "SHORT"}`);
        console.log(`   Amount: ${positionAmount}`);
        console.log(`   Entry Price: $${entryPrice}`);

        // 计算止损止盈价格
        let finalStopLoss = stopLoss;
        let finalTakeProfit = takeProfit;
        let effectiveSLPercent = stopLossPercent;
        let effectiveTPPercent = takeProfitPercent;

        // 若未提供任何参数，使�?H ATR动态推导百分比
        if (!finalStopLoss && !finalTakeProfit && !effectiveSLPercent && !effectiveTPPercent) {
            try {
                const ms = await getCurrentMarketState(symbol);
                const refPrice = ms.current_price || entryPrice;
                const atr14 = ms.longer_term?.atr_14 || 0;
                const volPct = refPrice > 0 && atr14 > 0 ? (atr14 / refPrice) * 100 : 2.5; // %
                // 🔧 完全基于ATR,不限制范�?由市场波动率决定
                // AI可以通过传入参数覆盖这个默认�?
                effectiveSLPercent = volPct * 1.5;  // 1.5倍ATR作为止损
                effectiveTPPercent = effectiveSLPercent * 3.0;  // 3倍止损作为止�?
                console.log(`🧮 Dynamic SL/TP from ATR: vol%=${volPct.toFixed(2)} �?SL=${effectiveSLPercent.toFixed(2)}% TP=${effectiveTPPercent.toFixed(2)}%`);
            } catch (e: any) {
                // 回退到默认�?
                effectiveSLPercent = 3.0;
                effectiveTPPercent = 10.0;
                console.warn(`⚠️ Failed to compute ATR-based SL/TP: ${e?.message || e}. Using defaults SL=3% TP=10%.`);
            }
        }

        if (effectiveSLPercent && !finalStopLoss) {
            finalStopLoss = isLong
                ? entryPrice * (1 - effectiveSLPercent / 100)
                : entryPrice * (1 + effectiveSLPercent / 100);
            console.log(`📉 Calculated stop loss from ${effectiveSLPercent}%: $${finalStopLoss.toFixed(2)}`);
        }

        if (effectiveTPPercent && !finalTakeProfit) {
            finalTakeProfit = isLong
                ? entryPrice * (1 + effectiveTPPercent / 100)
                : entryPrice * (1 - effectiveTPPercent / 100);
            console.log(`📈 Calculated take profit from ${effectiveTPPercent}%: $${finalTakeProfit.toFixed(2)}`);
        }

        // 🆕 先清理该持仓的旧止损/止盈订单,避免达到订单上限
        console.log(`🧹 Cleaning up old SL/TP orders for ${symbol}...`);
        try {
            const cancelResult = await cancelStopLossTakeProfitForPosition(binanceSymbol, isLong ? "LONG" : "SHORT");
            if (cancelResult.canceledCount > 0) {
                console.log(`�?Cleared ${cancelResult.canceledCount} old orders`);
                // 🔧 等待订单系统完全处理取消请求（增加到 5 秒）
                console.log(`�?Waiting 5 seconds for order system to sync...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                console.log(`   ℹ️ No old orders found (this is normal for new positions)`);
                // 即使没有找到旧订单，也短暂等待确保系统状态一�?
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (e: any) {
            console.warn(`⚠️ Failed to cleanup old orders (continuing anyway): ${e?.message || e}`);
        }

        let stopLossOrderId: string | undefined;
        let takeProfitOrderId: string | undefined;

        // Get position mode
        const positionMode = await getPositionMode();

        // 创建止损�?(STOP_MARKET)
        if (finalStopLoss) {
            // 验证止损价格合理�?
            if (isLong && finalStopLoss >= entryPrice) {
                return {
                    success: false,
                    error: `Stop loss price (${finalStopLoss}) must be below entry price (${entryPrice}) for long position`,
                };
            }
            if (!isLong && finalStopLoss <= entryPrice) {
                return {
                    success: false,
                    error: `Stop loss price (${finalStopLoss}) must be above entry price (${entryPrice}) for short position`,
                };
            }

            // 准备止损订单参数（在外层定义，以便错误处理时可以访问�?
            const stopLossParams: any = {
                stopPrice: finalStopLoss.toFixed(2),
                closePosition: "true",
            };

            // Only set positionSide for DUAL_SIDE mode
            if (positionMode === "DUAL_SIDE") {
                stopLossParams.positionSide = isLong ? "LONG" : "SHORT";
            }

            try {
                console.log(`🛑 Creating stop loss order at $${finalStopLoss.toFixed(2)} (mode: ${positionMode})...`);

                const response = await (client as any).newOrder(
                    binanceSymbol,
                    isLong ? "SELL" : "BUY",
                    "STOP_MARKET",
                    stopLossParams
                );

                stopLossOrderId = response.data.orderId?.toString();
                console.log(`�?Stop loss order created: ${stopLossOrderId}`);
            } catch (error: any) {
                console.error(`�?Failed to create stop loss:`, error?.response?.data || error.message);
                return {
                    success: false,
                    error: `Failed to create stop loss: ${error?.response?.data?.msg || error.message}`,
                };
            }
        }

        // 创建止盈�?(TAKE_PROFIT_MARKET)
        if (finalTakeProfit) {
            // 验证止盈价格合理�?
            if (isLong && finalTakeProfit <= entryPrice) {
                return {
                    success: false,
                    error: `Take profit price (${finalTakeProfit}) must be above entry price (${entryPrice}) for long position`,
                };
            }
            if (!isLong && finalTakeProfit >= entryPrice) {
                return {
                    success: false,
                    error: `Take profit price (${finalTakeProfit}) must be below entry price (${entryPrice}) for short position`,
                };
            }

            try {
                console.log(`🎯 Creating take profit order at $${finalTakeProfit.toFixed(2)} (mode: ${positionMode})...`);

                const takeProfitParams: any = {
                    stopPrice: finalTakeProfit.toFixed(2),
                    closePosition: "true", // 平仓整个持仓
                };

                // Only set positionSide for DUAL_SIDE mode
                if (positionMode === "DUAL_SIDE") {
                    takeProfitParams.positionSide = isLong ? "LONG" : "SHORT";
                }

                const response = await (client as any).newOrder(
                    binanceSymbol,
                    isLong ? "SELL" : "BUY",
                    "TAKE_PROFIT_MARKET",
                    takeProfitParams
                );

                takeProfitOrderId = response.data.orderId?.toString();
                console.log(`�?Take profit order created: ${takeProfitOrderId}`);
            } catch (error: any) {
                console.error(`�?Failed to create take profit:`, error?.response?.data || error.message);
                return {
                    success: false,
                    error: `Failed to create take profit: ${error?.response?.data?.msg || error.message}`,
                };
            }
        }

        return {
            success: true,
            stopLossOrderId,
            takeProfitOrderId,
        };
    } catch (error: any) {
        console.error("�?Failed to set stop-loss/take-profit:", error);
        return {
            success: false,
            error: error.message || "Unknown error occurred",
        };
    }
}

/**
 * 自动为所有持仓设置止盈止�?
 * 使用智能百分比策�?
 */
export async function setAutoStopLossTakeProfitForAll(params?: {
    defaultStopLossPercent?: number; // 默认止损 3%
    defaultTakeProfitPercent?: number; // 默认止盈 10%
}): Promise<{ success: boolean; results: any[] }> {
    const stopLossPercent = params?.defaultStopLossPercent || 3;
    const takeProfitPercent = params?.defaultTakeProfitPercent || 10;

    console.log(`🤖 Auto setting SL/TP for all positions...`);
    console.log(`   Default Stop Loss: ${stopLossPercent}%`);
    console.log(`   Default Take Profit: ${takeProfitPercent}%`);

    try {
        const positions = await fetchPositions();
        const activePositions = positions.filter(p => p.contracts !== 0);

        if (activePositions.length === 0) {
            console.log(`ℹ️ No active positions to set SL/TP`);
            return { success: true, results: [] };
        }

        console.log(`📊 Found ${activePositions.length} active positions`);

        const results = [];
        for (const position of activePositions) {
            console.log(`\n🔧 Processing ${position.symbol}...`);

            const result = await setStopLossTakeProfit({
                symbol: position.symbol,
                stopLossPercent,
                takeProfitPercent,
            });

            results.push({
                symbol: position.symbol,
                ...result,
            });
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`\n�?Auto SL/TP completed: ${successCount}/${results.length} successful`);

        return { success: true, results };
    } catch (error: any) {
        console.error("�?Failed to set auto SL/TP:", error);
        return {
            success: false,
            results: [],
        };
    }
}

/**
 * 取消止盈止损订单
 */
export async function cancelStopLossTakeProfit(
    symbol: string
): Promise<{ success: boolean; canceledCount: number; error?: string }> {
    try {
        const client = await getBinanceInstance();
        const binanceSymbol = symbol.replace("/", "");

        // 获取所有未成交订单
        console.log(`🔍 Fetching open orders for ${symbol}...`);
        const openOrders = await (async () => {
            try {
                if (typeof (client as any).openOrders === 'function') {
                    const resp = await (client as any).openOrders({ symbol: binanceSymbol });
                    return resp.data || resp || [];
                }
                if (typeof (client as any).getOpenOrders === 'function') {
                    const resp = await (client as any).getOpenOrders({ symbol: binanceSymbol });
                    return resp.data || resp || [];
                }
                if (typeof (client as any).fetchOpenOrders === 'function') {
                    const resp = await (client as any).fetchOpenOrders({ symbol: binanceSymbol });
                    return resp.data || resp || [];
                }
            } catch (e) {
                // fall through
            }

            // REST fallback
            try {
                const tradingMode = process.env.TRADING_MODE || 'dry-run';
                const isDryRun = tradingMode === 'dry-run';
                const apiKey = isDryRun ? (process.env.BINANCE_TESTNET_API_KEY || '') : (process.env.BINANCE_LIVE_API_KEY || '');
                const apiSecret = isDryRun ? (process.env.BINANCE_TESTNET_API_SECRET || '') : (process.env.BINANCE_LIVE_API_SECRET || '');
                const baseUrl = getBinanceBaseUrl().replace(/\/$/, '');
                const timestamp = Date.now();
                const query = `symbol=${binanceSymbol}&timestamp=${timestamp}`;
                const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
                const url = `${baseUrl}/fapi/v1/openOrders?${query}&signature=${signature}`;
                const resp = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
                if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
                const data = await resp.json();
                return data || [];
            } catch (e: any) {
                console.error('�?REST fallback for openOrders failed:', e?.message || e);
                return [];
            }
        })();

        // 筛选出止损止盈�?
        const slTpOrders = openOrders.filter(
            (order: any) =>
                order.type === "STOP_MARKET" || order.type === "TAKE_PROFIT_MARKET"
        );

        console.log(`📋 Found ${slTpOrders.length} SL/TP orders to cancel`);

        let canceledCount = 0;
        for (const order of slTpOrders) {
            try {
                await (client as any).cancelOrder(binanceSymbol, {
                    orderId: order.orderId,
                });
                canceledCount++;
                console.log(`�?Canceled order: ${order.orderId}`);
            } catch (e: any) {
                console.error(`�?Failed to cancel order ${order.orderId}:`, e?.response?.data || e.message);
            }
        }

        console.log(`�?Canceled ${canceledCount}/${slTpOrders.length} orders`);
        return { success: true, canceledCount };
    } catch (error: any) {
        console.error("�?Failed to cancel stop-loss/take-profit orders:", error);
        return {
            success: false,
            canceledCount: 0,
            error: error.message || "Unknown error occurred",
        };
    }
}

/**
 * 追踪止损逻辑
 * 当价格向有利方向移动时，自动调整止损价格
 */
export async function updateTrailingStop(
    symbol: string,
    trailingPercent: number = 2 // 默认追踪2%
): Promise<{ success: boolean; newStopLoss?: number; error?: string }> {
    try {
        const binanceSymbol = symbol.replace("/", "");
        const positions = await fetchPositions();
        // 🔧 修复：使�?binanceSymbol（无斜杠）进行匹�?
        const position = positions.find((p) => p.symbol === binanceSymbol);

        if (!position || position.contracts === 0) {
            return {
                success: false,
                error: `No open position found for ${symbol}`,
            };
        }

        const isLong = position.side === "long";
        const entryPrice = position.entryPrice;
        const currentPrice = position.markPrice;
        const unrealizedPnL = position.unrealizedPnl;

        // 只有在盈利时才更新追踪止�?
        if (unrealizedPnL <= 0) {
            console.log(`ℹ️ Position not in profit yet, skipping trailing stop update`);
            return { success: true };
        }

        // 计算新的止损价格
        const newStopLoss = isLong
            ? currentPrice * (1 - trailingPercent / 100)
            : currentPrice * (1 + trailingPercent / 100);

        // 取消现有止损�?
        await cancelStopLossTakeProfit(symbol);

        // 设置新的止损�?
        const result = await setStopLossTakeProfit({
            symbol,
            stopLoss: newStopLoss,
        });

        if (result.success) {
            console.log(`�?Trailing stop updated to $${newStopLoss.toFixed(2)}`);
            return { success: true, newStopLoss };
        }

        return result;
    } catch (error: any) {
        console.error("�?Failed to update trailing stop:", error);
        return {
            success: false,
            error: error.message || "Unknown error occurred",
        };
    }
}
