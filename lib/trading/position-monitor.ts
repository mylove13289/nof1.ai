/**
 * Position Monitor - Automatically tracks position closures and records lessons
 * 
 * This module monitors Binance positions and automatically calls the learning
 * feedback system when positions are closed (either by TP/SL or manual closure).
 */

import { analyzeTradeOutcome } from "../ai/learning-feedback";
import { getAccountInformationAndPerformance } from "./account-information-and-performance";
import { prisma } from "../prisma";

interface ClosedPosition {
    symbol: string;
    realizedPnl: number;
    closeReason: string;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
}

/**
 * Check for recently closed positions and record lessons
 */
export async function checkAndRecordClosedPositions(): Promise<void> {
    try {
        console.log("🔍 Checking for closed positions to record lessons...");

        // Get current positions
        const accountInfo = await getAccountInformationAndPerformance(20);
        const currentSymbols = new Set(accountInfo.positions.map(p => p.symbol));

        // Find trades in database that might have been closed
        const recentTrades = await prisma.trading.findMany({
            where: {
                opeartion: "Buy",
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
                },
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 20,
        });

        for (const trade of recentTrades) {
            const symbol = `${trade.symbol}USDT`;

            // Check if this trade has already been recorded as a lesson
            const existingLesson = await prisma.tradingLesson.findFirst({
                where: {
                    tradeId: trade.id,
                },
            });

            if (existingLesson) {
                // Already recorded, skip
                continue;
            }

            // If the symbol is no longer in current positions, it was closed
            if (!currentSymbols.has(symbol)) {
                console.log(`📝 Position ${symbol} was closed, recording lesson...`);

                // Try to determine PnL (simplified - you should get actual PnL from exchange)
                // For now, we'll mark it as pending and let manual updates fill in the actual PnL
                const estimatedPnl = 0; // Placeholder - should fetch from exchange history
                const exitReason = "Position closed (manual or TP/SL triggered)";

                await analyzeTradeOutcome(trade.id, estimatedPnl, exitReason);
            }
        }

        console.log("✅ Finished checking closed positions");
    } catch (error) {
        console.error("❌ Error checking closed positions:", error);
    }
}

/**
 * Manually record a lesson for a closed trade
 * Use this when you have actual PnL data from the exchange
 */
export async function manuallyRecordTradeLesson(
    tradeId: string,
    actualPnl: number,
    exitReason: string
): Promise<void> {
    console.log(`📝 Manually recording lesson for trade ${tradeId}: PnL = $${actualPnl.toFixed(2)}`);
    await analyzeTradeOutcome(tradeId, actualPnl, exitReason);
    console.log("✅ Lesson recorded successfully");
}

/**
 * Get learning summary for display
 */
export async function getLearingSummary(days: number = 7): Promise<string> {
    const { getLearningStats, formatLearningFeedback } = await import("../ai/learning-feedback");

    try {
        const stats = await getLearningStats(days);
        if (stats.total_trades === 0) {
            return "📊 No trading history available yet. Start trading to build your learning history!";
        }
        return formatLearningFeedback(stats);
    } catch (error) {
        console.error("Error getting learning summary:", error);
        return "❌ Error fetching learning data";
    }
}

export default {
    checkAndRecordClosedPositions,
    manuallyRecordTradeLesson,
    getLearingSummary,
};
