import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchPositions } from "@/lib/trading/positions";

export const GET = async () => {
    try {
        // 获取最新的 AI 决策聊天（最近 10 条）
        const recentChats = await prisma.chat.findMany({
            take: 10,
            orderBy: { createdAt: "desc" },
            include: {
                tradings: true,
            },
        });

        // 获取当前真实持仓（使用直接 REST API，避免 ccxt exchangeInfo）
        let activePositions: any[] = [];
        try {
            activePositions = await fetchPositions();
        } catch (positionError) {
            console.error("Failed to fetch positions (non-critical):", positionError);
            // 持仓获取失败不影响整体响应,返回空数组
            activePositions = [];
        }

        return NextResponse.json({
            success: true,
            data: {
                chats: recentChats.map((chat) => ({
                    id: chat.id,
                    model: chat.model,
                    chat: chat.chat,
                    reasoning: chat.reasoning,
                    userPrompt: chat.userPrompt,
                    tradings: chat.tradings,
                    createdAt: chat.createdAt.toISOString(),
                })),
                positions: activePositions,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error("Failed to fetch activity:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
};