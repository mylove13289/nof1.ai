import dns from 'dns';

// Force DNS resolution to use reliable public DNS servers
// This can help in environments where the default DNS is unreliable
// dns.setServers([
//   '1.1.1.1', // Cloudflare
//   '8.8.8.8', // Google
//   '1.0.0.1',
//   '8.8.4.4',
// ]);
// console.log('🔒 DNS servers have been set to Cloudflare and Google for this process.');

// 使用 CommonJS bundle 以更好地处理错误类型检测
import * as ccxt from "ccxt";
import { type Exchange } from "ccxt";

// Prefer per-service proxy. Do NOT rely on system/global proxy so DeepSeek remains unaffected.
const disableProxy = String(process.env.BINANCE_DISABLE_PROXY || "").toLowerCase() === "true";

// 1. 创建一个 Promise 来处理一次性初始化
let initializationPromise: Promise<Exchange> | null = null;

// 2. 导出一个异步函数来获取实例
export function getBinanceInstance(): Promise<Exchange> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const apiKey = process.env.BINANCE_API_KEY;
      const apiSecret = process.env.BINANCE_API_SECRET;

      if (!apiKey || !apiSecret) {
        throw new Error("BINANCE_API_KEY or BINANCE_API_SECRET not configured");
      }

      // 仅针对 Binance 按需使用代理，避免影响 DeepSeek 等其他出网请求
      const envProxy = process.env.BINANCE_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      const useProxy = !!envProxy && !disableProxy;

      if (useProxy) {
        console.log("🔄 Using per-service proxy for Binance");
        console.log(`   - Proxy URL: ${envProxy}`);
      } else {
        console.log("🔄 Not using proxy for Binance (either BINANCE_DISABLE_PROXY=true or no proxy env provided)");
      }

      // 创建基础实例配置
      const baseCandidates = (process.env.BINANCE_FAPI_BASE_URL && process.env.BINANCE_FAPI_BASE_URL.trim().length > 0
        ? process.env.BINANCE_FAPI_BASE_URL.split(",").map((s) => s.trim()).filter(Boolean)
        : [
          "https://fapi.binance.me",
          "https://demo-fapi.binance.com",
        ]);

      const commonConfig: any = {
        apiKey,
        secret: apiSecret,
        timeout: 60000,
        enableRateLimit: true,
        sandbox: false,
        rateLimit: 2000,
        ...(useProxy ? { 'httpsProxy': envProxy } : {}),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        options: {
          defaultType: 'future', // 使用期货市场
          adjustForTimeDifference: true, // 自动调整时间差
          recvWindow: 60000, // 增加接收窗口到60秒
          marginMode: 'isolated', // 逐仓模式
          positionMode: 'hedged', // 对冲模式
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          // 强制使用期货API，避免调用现货API
          'futures': true,
          'spot': false,
          // 明确禁用可能触发现货API的功能
          'fetchTradingFees': false,
          'fetchDepositWithdrawFees': false,
          'fetchCurrencies': false,
        }
      };

      let binanceInstance: ccxt.Exchange | null = null;
      let lastErr: any = null;
      for (let hostIdx = 0; hostIdx < baseCandidates.length; hostIdx++) {
        const fapiBase = baseCandidates[hostIdx];
        const config: any = {
          ...commonConfig,
          urls: {
            api: {
              fapiPublic: `${fapiBase}/fapi/v1`,
              fapiPublicV2: `${fapiBase}/fapi/v2`,
              fapiPublicV3: `${fapiBase}/fapi/v3`,
              fapiPrivate: `${fapiBase}/fapi/v1`,
              fapiPrivateV2: `${fapiBase}/fapi/v2`,
              fapiPrivateV3: `${fapiBase}/fapi/v3`,
              fapiData: `${fapiBase}/futures/data`,
            },
          },
        };

        console.log("� Binance ccxt config prepared");
        console.log(`   - Proxy enabled: ${useProxy}`);
        console.log(`   - Agent configured: ${!!config.httpsProxy}`);
        console.log(`   - FAPI base: ${fapiBase}`);

        binanceInstance = new ccxt.binanceusdm(config);
        console.log(`🔍 Verifying proxy configuration on ccxt instance:`);
        // @ts-ignore
        console.log(`   - instance.httpsProxy: ${!!(binanceInstance as any).httpsProxy}`);

        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            console.log(`�️ Loading markets (attempt ${attempt}/5) with host [${hostIdx + 1}/${baseCandidates.length}]...`);
            const startTime = Date.now();
            await binanceInstance.loadMarkets(true); // true to force reload
            const duration = Date.now() - startTime;
            console.log(`✅ Markets loaded successfully in ${duration}ms.`);
            console.log(`📊 Loaded ${Object.keys(binanceInstance.markets).length} trading pairs.`);
            // success, break out of both loops by returning instance
            console.log("✅ Binance instance configured and markets loaded.");
            return binanceInstance;
          } catch (loadMarketsError: any) {
            lastErr = loadMarketsError;
            console.error(`⚠️ Loading markets attempt ${attempt} failed:`, loadMarketsError.message);

            // 输出详细的错误信息
            console.error(`🔍 Detailed error information:`);
            console.error(`   - Error message: ${loadMarketsError.message}`);
            console.error(`   - Error name: ${loadMarketsError.name}`);
            console.error(`   - Error code: ${loadMarketsError.code}`);
            console.error(`   - Error type (constructor.name): ${loadMarketsError.constructor?.name}`);

            // 使用 instanceof 检查标准错误类型
            console.error(`   - instanceof Error: ${loadMarketsError instanceof Error}`);
            console.error(`   - instanceof TypeError: ${loadMarketsError instanceof TypeError}`);
            console.error(`   - instanceof ReferenceError: ${loadMarketsError instanceof ReferenceError}`);

            // 使用 instanceof 检查 CCXT 特定错误类型
            console.error(`🔍 CCXT Error Type Checks:`);
            try {
              console.error(`   - instanceof ccxt.NetworkError: ${loadMarketsError instanceof ccxt.NetworkError}`);
              console.error(`   - instanceof ccxt.ExchangeError: ${loadMarketsError instanceof ccxt.ExchangeError}`);
              console.error(`   - instanceof ccxt.RequestTimeout: ${loadMarketsError instanceof ccxt.RequestTimeout}`);
              console.error(`   - instanceof ccxt.ExchangeNotAvailable: ${loadMarketsError instanceof ccxt.ExchangeNotAvailable}`);
              console.error(`   - instanceof ccxt.AuthenticationError: ${loadMarketsError instanceof ccxt.AuthenticationError}`);
              console.error(`   - instanceof ccxt.InvalidNonce: ${loadMarketsError instanceof ccxt.InvalidNonce}`);
            } catch (checkError) {
              console.error(`   - Error checking CCXT types:`, checkError);
            }

            // 检查是否是 NetworkError
            if (loadMarketsError instanceof ccxt.NetworkError || loadMarketsError.constructor?.name === 'NetworkError') {
              console.error(`   - ✓ NetworkError confirmed (via instanceof or constructor)`);

              console.error(`🔍 Network Error Root Cause Analysis:`);

              // 输出 cause 的所有信息
              if (loadMarketsError.cause) {
                console.error(`   📍 Underlying Cause Details:`);
                console.error(`      - cause type: ${typeof loadMarketsError.cause}`);
                console.error(`      - cause constructor: ${loadMarketsError.cause?.constructor?.name}`);
                console.error(`      - cause toString: ${loadMarketsError.cause?.toString?.()}`);

                // 如果 cause 是一个错误对象，输出所有网络相关属性
                if (typeof loadMarketsError.cause === 'object' && loadMarketsError.cause !== null) {
                  const cause = loadMarketsError.cause as any;

                  console.error(`   📍 Network Error Properties:`);
                  console.error(`      - message: ${cause.message}`);
                  console.error(`      - name: ${cause.name}`);
                  console.error(`      - code: ${cause.code} (系统错误代码)`);
                  console.error(`      - errno: ${cause.errno} (错误编号)`);
                  console.error(`      - syscall: ${cause.syscall} (系统调用)`);
                  console.error(`      - address: ${cause.address} (目标地址)`);
                  console.error(`      - port: ${cause.port} (目标端口)`);
                  console.error(`      - hostname: ${cause.hostname} (主机名)`);
                  console.error(`      - host: ${cause.host}`);
                  console.error(`      - path: ${cause.path}`);
                  console.error(`      - url: ${cause.url}`);

                  // 输出 cause 的所有属性名
                  console.error(`      - All cause properties:`, Object.keys(cause));
                  console.error(`      - All cause property names:`, Object.getOwnPropertyNames(cause));

                  // 堆栈跟踪
                  if (cause.stack) {
                    console.error(`   📍 Cause Stack Trace:`);
                    const causeStackLines = cause.stack.split('\n').slice(0, 5);
                    causeStackLines.forEach((line: string) => console.error(`      ${line}`));
                  }

                  // 尝试序列化 cause
                  try {
                    console.error(`   📍 Cause Serialized:`, JSON.stringify(cause, Object.getOwnPropertyNames(cause), 2));
                  } catch {
                    console.error(`   📍 Cause cannot be serialized`);
                  }
                }
              } else {
                console.error(`   ⚠️ No cause property found on NetworkError`);
              }

              // 检查是否有其他相关属性
              console.error(`🔍 Additional NetworkError Properties:`);
              const networkErrorProps = ['statusCode', 'statusText', 'headers', 'body', 'response'];
              for (const prop of networkErrorProps) {
                if ((loadMarketsError as any)[prop] !== undefined) {
                  console.error(`   - ${prop}:`, (loadMarketsError as any)[prop]);
                }
              }
            }

            // 输出所有可枚举属性
            console.error(`   - Enumerable properties:`, Object.keys(loadMarketsError));

            // 输出所有属性名称（包括不可枚举的）
            console.error(`   - All property names:`, Object.getOwnPropertyNames(loadMarketsError));

            // 尝试输出堆栈跟踪
            if (loadMarketsError.stack) {
              console.error(`   - Stack trace (first 8 lines):`);
              const stackLines = loadMarketsError.stack.split('\n').slice(0, 8);
              stackLines.forEach((line: string) => console.error(`     ${line}`));
            }

            // 输出完整的错误对象以便调试
            try {
              const serialized = JSON.stringify(loadMarketsError, Object.getOwnPropertyNames(loadMarketsError), 2);
              console.error(`   - Serialized error:`, serialized);
            } catch (e) {
              console.error(`   - Cannot serialize error, manual extraction:`);

              // 手动提取所有属性
              for (const key of Object.getOwnPropertyNames(loadMarketsError)) {
                try {
                  const value = (loadMarketsError as any)[key];
                  const valueType = typeof value;
                  if (valueType === 'function') {
                    console.error(`     - ${key}: [Function]`);
                  } else if (valueType === 'object' && value !== null) {
                    try {
                      console.error(`     - ${key}:`, JSON.stringify(value, null, 2));
                    } catch {
                      console.error(`     - ${key}: [Complex Object - cannot stringify]`);
                    }
                  } else {
                    console.error(`     - ${key}:`, value);
                  }
                } catch (accessError) {
                  console.error(`     - ${key}: [Unable to access]`);
                }
              }
            }

            if (attempt < 5) {
              const delay = attempt * 5000; // 5s, 10s, 15s, 20s
              console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              console.error("❌ Failed with this host after 5 attempts, will try next host if available...");
            }
          }
        }
      }

      // 全部主机都失败
      console.error("❌ FATAL: Failed to initialize Binance across all base hosts:", baseCandidates.join(", "));
      throw new Error(`Failed to load markets on all hosts. Last error: ${lastErr?.message || lastErr}`);
    })();
  }
  return initializationPromise;
}
