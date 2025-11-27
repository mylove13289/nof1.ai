import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ModelType } from "@prisma/client";

export const POST = async (request: NextRequest) => {
    try {
        // 获取请求参数
        const body = await request.json();
        const { resetTime = true } = body;

        if (!resetTime) {
            return NextResponse.json({
                success: false,
                message: "resetTime parameter is required"
            });
        }

        // 查找现有的metrics数据
        const existMetrics = await prisma.metrics.findFirst({
            where: {
                model: ModelType.Deepseek,
            },
        });

        if (!existMetrics || !existMetrics.metrics) {
            return NextResponse.json({
                success: false,
                message: "No metrics found"
            });
        }

        // 计算今天晚上10:25的时间
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startTime = new Date(today.getTime() + 22 * 60 * 60 * 1000 + 25 * 60 * 1000); // 今天22:25

        // 处理现有metrics数据
        const metrics = existMetrics.metrics as any[];
        const updatedMetrics = metrics.map((metric, index) => {
            // 为每个数据点分配从起始时间开始的时间戳
            // 假设数据点间隔30秒
            const intervalMs = 30 * 1000; // 30秒间隔
            const adjustedTime = new Date(startTime.getTime() + index * intervalMs);

            return {
                ...metric,
                createdAt: adjustedTime.toISOString()
            };
        });

        // 更新数据库
        await prisma.metrics.update({
            where: {
                id: existMetrics.id,
            },
            data: {
                metrics: updatedMetrics as any,
            },
        });

        return NextResponse.json({
            success: true,
            message: `Successfully updated ${updatedMetrics.length} metrics with new timestamps`,
            startTime: startTime.toISOString(),
            updatedCount: updatedMetrics.length
        });

    } catch (error) {
        console.error("Error resetting metrics time:", error);
        return NextResponse.json({
            success: false,
            message: "Failed to reset metrics time",
            error: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
    }
};