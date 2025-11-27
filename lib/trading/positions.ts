/**
 * 直接通过 REST API 获取 Binance 持仓信息
 * 避免 ccxt 的 exchangeInfo bootstrap 问题
 */

import crypto from "crypto";
import { ProxyAgent } from "undici";
import { ensureTimeSync, getAdjustedTimestamp, getBinanceBaseUrl } from "./binance-official"; // 🔧 导入时间同步

interface BinancePosition {
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    markPrice: string;
    unRealizedProfit: string;
    liquidationPrice: string;
    leverage: string;
    notional: string;
    marginType: string;
    isolatedMargin: string;
    isAutoAddMargin: string;
    positionSide: string;
    maxNotionalValue: string;
    updateTime: number;
}

export interface Position {
    symbol: string;
    side: string; // "long" | "short"
    contracts: number;
    contractSize: number;
    entryPrice: number;
    markPrice: number;
    notional: number;
    leverage: number;
    unrealizedPnl: number;
    percentage: number;
    marginType: string;
    liquidationPrice: number;
    initialMargin: number;
    maintenanceMargin: number;
}

/**
 * 使用 REST API 直接获取持仓
 */
export async function fetchPositions(): Promise<Position[]> {
    // 🔧 根据 TRADING_MODE 自动选择 API 配置
    const tradingMode = process.env.TRADING_MODE || "dry-run";
    const isDryRun = tradingMode === "dry-run";

    let apiKey: string | undefined;
    let apiSecret: string | undefined;

    if (isDryRun) {
        // 虚拟盘配置
        apiKey = process.env.BINANCE_TESTNET_API_KEY;
        apiSecret = process.env.BINANCE_TESTNET_API_SECRET;
    } else {
        // 实盘配置
        apiKey = process.env.BINANCE_LIVE_API_KEY;
        apiSecret = process.env.BINANCE_LIVE_API_SECRET;
    }

    if (!apiKey || !apiSecret) {
        const configType = isDryRun ? "TESTNET" : "LIVE";
        throw new Error(
            `BINANCE_${configType}_API_KEY or BINANCE_${configType}_API_SECRET not configured. ` +
            `Please set them in .env file for ${isDryRun ? 'virtual' : 'live'} trading.`
        );
    }

    // 配置代理（仅当未禁用时）
    const disableProxy = String(process.env.BINANCE_DISABLE_PROXY || "").toLowerCase() === "true";
    const proxyUrl = process.env.BINANCE_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const baseUrls = (
        getBinanceBaseUrl()
    ).split(",");
    const timeout = Number(process.env.BINANCE_FETCH_TIMEOUT_MS || 30000);

    // 🔧 先同步服务器时间，避�?-1021 错误
    await ensureTimeSync();

    // 生成签名（使用同步后的时间戳�?
    const timestamp = getAdjustedTimestamp();
    const queryString = `timestamp=${timestamp}&recvWindow=60000`; // 添加 60 秒窗�?
    const signature = crypto
        .createHmac("sha256", apiSecret)
        .update(queryString)
        .digest("hex");

    const url = `/fapi/v2/positionRisk?${queryString}&signature=${signature}`;

    let lastError: Error | null = null;

    // 尝试多个域名
    for (let i = 0; i < baseUrls.length; i++) {
        const baseUrl = baseUrls[i];
        try {
            const fullUrl = `${baseUrl.trim()}${url}`;
            console.log(`🔄 [${i + 1}/${baseUrls.length}] Fetching from: ${baseUrl.trim()}`);

            const fetchOptions: RequestInit = {
                method: "GET",
                headers: {
                    "X-MBX-APIKEY": apiKey,
                    "Content-Type": "application/json",
                },
                signal: AbortSignal.timeout(timeout),
            };

            // 添加代理
            if (proxyUrl && !disableProxy) {
                (fetchOptions as any).dispatcher = new ProxyAgent(proxyUrl);
            }

            const response = await fetch(fullUrl, fetchOptions);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Binance API error: ${response.status} ${errorText}`
                );
            }

            // 获取响应文本并验�?
            const responseText = await response.text();

            if (!responseText || responseText.trim() === '') {
                throw new Error(`Empty response from server`);
            }

            // 尝试解析 JSON
            let positions: BinancePosition[];
            try {
                positions = JSON.parse(responseText);
            } catch (jsonError) {
                throw new Error(
                    `Invalid JSON response: ${responseText.substring(0, 100)}...`
                );
            }

            // 验证响应格式
            if (!Array.isArray(positions)) {
                throw new Error(`Expected array response, got: ${typeof positions}`);
            }

            // 过滤并转换持仓数�?
            const activePositions: Position[] = positions
                .filter((p) => parseFloat(p.positionAmt) !== 0)
                .map((p) => {
                    const contracts = Math.abs(parseFloat(p.positionAmt));
                    const entryPrice = parseFloat(p.entryPrice);
                    const markPrice = parseFloat(p.markPrice);
                    const notional = Math.abs(parseFloat(p.notional));
                    const leverage = parseFloat(p.leverage);
                    const unrealizedPnl = parseFloat(p.unRealizedProfit);
                    const liquidationPrice = parseFloat(p.liquidationPrice);

                    // 计算初始保证金和维持保证�?
                    const initialMargin = notional / leverage;
                    const maintenanceMargin = notional * 0.004; // 简化计算，实际需要查询维持保证金�?

                    // 计算收益�?
                    const percentage =
                        entryPrice > 0
                            ? ((markPrice - entryPrice) / entryPrice) *
                            100 *
                            (parseFloat(p.positionAmt) > 0 ? 1 : -1)
                            : 0;

                    return {
                        symbol: p.symbol,
                        side: parseFloat(p.positionAmt) > 0 ? "long" : "short",
                        contracts,
                        contractSize: 1,
                        entryPrice,
                        markPrice,
                        notional,
                        leverage,
                        unrealizedPnl,
                        percentage,
                        marginType: p.marginType.toLowerCase(),
                        liquidationPrice,
                        initialMargin,
                        maintenanceMargin,
                    };
                });

            console.log(
                `�?Success! Fetched ${activePositions.length} active positions from ${baseUrl.trim()}`
            );
            return activePositions;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);

            // 特殊处理不同类型的错�?
            let errorType = "Unknown";
            if (errorMsg.includes("429")) errorType = "Rate Limit";
            else if (errorMsg.includes("401")) errorType = "Auth Failed";
            else if (errorMsg.includes("Empty response")) errorType = "Empty Response";
            else if (errorMsg.includes("Invalid JSON")) errorType = "Invalid JSON";
            else if (errorMsg.includes("timeout")) errorType = "Timeout";

            console.error(
                `�?Failed [${i + 1}/${baseUrls.length}] ${baseUrl.trim()}: [${errorType}] ${errorMsg}`
            );
            lastError = error as Error;

            // 如果不是最后一个域�?继续尝试
            if (i < baseUrls.length - 1) {
                console.log(`�?Trying next domain...`);
            }
            continue;
        }
    }

    // 所有域名都失败
    throw new Error(
        `Failed to fetch positions from all domains: ${lastError?.message || "Unknown error"}`
    );
}
