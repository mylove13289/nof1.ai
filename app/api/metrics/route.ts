import { prisma } from "@/lib/prisma";
import { ModelType } from "@prisma/client";
import { NextResponse } from "next/server";
import { MetricData } from "@/lib/types/metrics";

// 🔧 移除数据点限制,返回所有历史数据
// 前端通过滑动窗口控制显示,服务端返回完整数据集

export const GET = async () => {
  try {
    const metrics = await prisma.metrics.findFirst({
      where: {
        model: ModelType.Deepseek,
      },
    });

    if (!metrics) {
      return NextResponse.json({
        data: {
          metrics: [],
          totalCount: 0,
        },
        success: true,
      });
    }

    const databaseMetrics = metrics.metrics as unknown as {
      createdAt: string;
      accountInformationAndPerformance: MetricData[];
    }[];

    const metricsData = databaseMetrics.map((item) => {
      return {
        ...item.accountInformationAndPerformance,
        createdAt: item?.createdAt || new Date().toISOString(),
      } as unknown as MetricData;
    });

    // 🔧 返回所有数据,不再采样
    // 前端通过滑动窗口控制显示数量
    console.log(
      `📊 Returning all metrics: ${metricsData.length} points`
    );

    return NextResponse.json({
      data: {
        metrics: metricsData, // 返回完整数据集
        totalCount: metricsData.length,
        model: metrics?.model || ModelType.Deepseek,
        name: metrics?.name || "Deepseek Trading Bot",
        createdAt: metrics?.createdAt || new Date().toISOString(),
        updatedAt: metrics?.updatedAt || new Date().toISOString(),
      },
      success: true,
    });
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json({
      data: {
        metrics: [],
        totalCount: 0,
        model: ModelType.Deepseek,
        name: "Deepseek Trading Bot",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      success: true,
    });
  }
};
