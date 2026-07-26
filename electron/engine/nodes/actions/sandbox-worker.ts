/**
 * 沙箱 Worker 线程
 * 在独立线程中执行用户代码，限制可用 API
 * 通过 parentPort 与主线程通信
 */
import { parentPort, workerData } from 'worker_threads'

const { code, input } = workerData as { code: string; input: Record<string, unknown> }

const logs: string[] = []

// 受限的 console 实现
const sandboxConsole = {
  log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
  warn: (...args: unknown[]) => logs.push('[warn] ' + args.map(String).join(' ')),
  error: (...args: unknown[]) => logs.push('[error] ' + args.map(String).join(' ')),
}

try {
  // 构建受限的执行环境
  // 不暴露 require, process, global, __dirname, __filename 等
  const restrictedGlobals = {
    input,
    console: sandboxConsole,
    JSON,
    Math,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Symbol,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    undefined,
    NaN,
    Infinity,
  }

  // 使用 Function 构造器创建受限作用域
  const paramNames = Object.keys(restrictedGlobals)
  const paramValues = Object.values(restrictedGlobals)

  const wrappedCode = `
    "use strict";
    return (function() {
      ${code}
    })();
  `

  const fn = new Function(...paramNames, wrappedCode)
  const result = fn(...paramValues)

  // 处理 Promise 结果
  if (result && typeof result.then === 'function') {
    result.then(
      (resolved: unknown) => {
        parentPort?.postMessage({ success: true, result: resolved, logs })
      },
      (err: unknown) => {
        parentPort?.postMessage({ success: false, error: String(err), logs })
      }
    )
  } else {
    parentPort?.postMessage({ success: true, result, logs })
  }
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  parentPort?.postMessage({ success: false, error: message, logs })
}
