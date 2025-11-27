import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { getAccountInformationAndPerformance } from "@/lib/trading/account-information-and-performance";
import { prisma } from "@/lib/prisma";
import { ModelType } from "@prisma/client";
import { InputJsonValue, JsonValue } from "@prisma/client/runtime/library";

// 🔧 大幅提高存储上限,保留更多历史数据
// 10080 个点 = 7天数据 (每20秒一个点)
// 43200 个点 = 30天数据
const MAX_METRICS_COUNT = 10080; // 保留7天历史数据

export const GET = async (request: NextRequest) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Token is required", { status: 400 });
  }

  try {
    jwt.verify(token, process.env.CRON_SECRET_KEY || "");
  } catch {
    return new Response("Invalid token", { status: 401 });
  }

  let accountInformationAndPerformance;
  try {
    // 不再硬编码 START_MONEY，首次自动读取真实余额作为基准
    accountInformationAndPerformance = await getAccountInformationAndPerformance();
  } catch (err) {
    console.error(
      "[cron:20s] getAccountInformationAndPerformance failed:",
      err
    );
    throw err; // 连接失败不写入兜底数据，让调用方知晓
  }

  let existMetrics = await prisma.metrics.findFirst({
    where: {
      model: ModelType.Deepseek,
    },
  });

  if (!existMetrics) {
    existMetrics = await prisma.metrics.create({
      data: {
        name: "live-trading",
        metrics: [],
        model: ModelType.Deepseek,
      },
    });
  }

  // add new metrics
  const newMetrics = [
    ...((existMetrics?.metrics || []) as JsonValue[]),
    {
      accountInformationAndPerformance,
      createdAt: new Date().toISOString(),
    },
  ] as JsonValue[];

  // 🔧 简单截断旧数据,保留最新的 MAX_METRICS_COUNT 个点
  // 不再使用采样,保证数据连续性
  let finalMetrics = newMetrics;
  if (newMetrics.length > MAX_METRICS_COUNT) {
    // 只保留最新的数据点,删除最旧的
    finalMetrics = newMetrics.slice(newMetrics.length - MAX_METRICS_COUNT);
    console.log(`🗑️ Trimmed old data: ${newMetrics.length} -> ${finalMetrics.length} points`);
  }

  await prisma.metrics.update({
    where: {
      id: existMetrics?.id,
    },
    data: {
      metrics: finalMetrics as InputJsonValue[],
    },
  });

  return new Response(
    `Process executed successfully. Metrics count: ${finalMetrics.length}`
  );
};
