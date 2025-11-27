declare module '@binance/futures-connector' {
    export class UMFutures {
        constructor(apiKey?: string, apiSecret?: string, options?: any);

        // Public endpoints
        ping(): Promise<any>;
        time(): Promise<any>;
        exchangeInfo(params?: any): Promise<any>;
        depth(symbol: string, params?: any): Promise<any>;
        trades(symbol: string, params?: any): Promise<any>;
        historicalTrades(symbol: string, params?: any): Promise<any>;
        aggTrades(symbol: string, params?: any): Promise<any>;
        klines(symbol: string, interval: string, params?: any): Promise<any>;
        continuousKlines(pair: string, contractType: string, interval: string, params?: any): Promise<any>;
        indexPriceKlines(pair: string, interval: string, params?: any): Promise<any>;
        markPriceKlines(symbol: string, interval: string, params?: any): Promise<any>;
        markPrice(params?: any): Promise<any>;
        fundingRate(params?: any): Promise<any>;
        ticker24hr(params?: any): Promise<any>;
        tickerPrice(params?: any): Promise<any>;
        bookTicker(params?: any): Promise<any>;
        openInterest(symbol: string): Promise<any>;
        openInterestHist(symbol: string, period: string, params?: any): Promise<any>;
        topLongShortAccountRatio(symbol: string, period: string, params?: any): Promise<any>;
        topLongShortPositionRatio(symbol: string, period: string, params?: any): Promise<any>;
        globalLongShortAccountRatio(symbol: string, period: string, params?: any): Promise<any>;
        takerlongshortRatio(symbol: string, period: string, params?: any): Promise<any>;

        // Account endpoints (require authentication)
        positionRisk(params?: any): Promise<any>;
        account(params?: any): Promise<any>;
        balance(params?: any): Promise<any>;

        // Order endpoints
        newOrder(symbol: string, side: string, type: string, params?: any): Promise<any>;
        placeMultipleOrders(orders: any[]): Promise<any>;
        queryOrder(symbol: string, params?: any): Promise<any>;
        cancelOrder(symbol: string, params?: any): Promise<any>;
        cancelAllOpenOrders(symbol: string, params?: any): Promise<any>;
        cancelMultipleOrders(symbol: string, params?: any): Promise<any>;
        countdownCancelAll(symbol: string, countdownTime: number, params?: any): Promise<any>;
        openOrder(symbol: string, params?: any): Promise<any>;
        openOrders(params?: any): Promise<any>;
        allOrders(symbol: string, params?: any): Promise<any>;

        // Account configuration
        leverage(symbol: string, leverage: number, params?: any): Promise<any>;
        marginType(symbol: string, marginType: string, params?: any): Promise<any>;
        positionMargin(symbol: string, params?: any): Promise<any>;
        positionMarginHistory(symbol: string, params?: any): Promise<any>;
        positionSideDual(params?: any): Promise<any>;
        positionSideDualSet(dualSidePosition: string, params?: any): Promise<any>;

        // User data stream
        getDataStream(): Promise<any>;
        keepAliveDataStream(listenKey: string): Promise<any>;
        closeDataStream(listenKey: string): Promise<any>;
    }
}

declare module 'tunnel' {
    export function httpsOverHttp(options: any): any;
    export function httpsOverHttps(options: any): any;
    export function httpOverHttp(options: any): any;
    export function httpOverHttps(options: any): any;
}
