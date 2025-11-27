/**
 * Position type compatible with Binance Futures API
 * Replaces the CCXT Position type
 */
export interface Position {
    symbol: string;
    side: 'long' | 'short' | 'none';
    contracts: number;
    contractSize?: number;
    unrealizedPnl: number;
    leverage: number;
    liquidationPrice: number;
    entryPrice: number;
    notional: number;
    marginType?: 'isolated' | 'cross';
    isolated?: boolean;
    markPrice?: number;
    initialMargin?: number;
    takeProfitPrice?: number;
    stopLossPrice?: number;
    info?: any;
}
