import { NextResponse } from "next/server";
import { getCurrentMarketState } from "@/lib/trading/current-market-state";

export const GET = async () => {
  try {
    // 并行获取所有加密货币价格（对单个失败做降级，避免整体 500）
    const symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "DOGE/USDT", "BNB/USDT"] as const;
    const results = await Promise.allSettled(symbols.map((s) => getCurrentMarketState(s)));

    const [btcPricing, ethPricing, solPricing, dogePricing, bnbPricing] = results.map((r) =>
      r.status === "fulfilled" ? r.value : null
    );

    return NextResponse.json({
      data: {
        pricing: {
          btc: btcPricing,
          eth: ethPricing,
          sol: solPricing,
          doge: dogePricing,
          bnb: bnbPricing,
        },
        errors: results
          .map((r, i) => (r.status === "rejected" ? { symbol: symbols[i], reason: String(r.reason) } : null))
          .filter(Boolean),
      },
      success: results.some((r) => r.status === "fulfilled"),
    });
  } catch (error) {
    console.error("Error fetching pricing:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch pricing data",
        success: false,
      },
      { status: 500 }
    );
  }
};
