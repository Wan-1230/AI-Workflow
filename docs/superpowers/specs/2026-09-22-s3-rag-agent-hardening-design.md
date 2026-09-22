# S3 设计：RAG 与 Agent 工具链做实

- 状态：已完成（212 项测试全绿）
- 日期：2026-09-22
- 前置：S0（主链路）、S1（引擎可靠性）、S2（循环体/子工作流作用域）已完成
- 范围决定：不砍功能，全部纳入修复（用户明确否决"按使用频率削减范围"）

## 1. 问题陈述

按"文档承诺 vs 代码实际"核对，逐条带证据。

### RAG

| # | 缺陷 | 证据 |
| --- | --- | --- |
| R1 | 检索是词频（TF），没有 IDF，也没有真实 embedding | `rag/vector-store.ts:88` `buildVector` 只累加词频；README 已如实写明，但节点描述里"向量检索"仍在暗示语义检索 |
| R2 | 索引只存内存，重启即空 | `nodes/rag/rag-upload.ts:7` `export const vectorStore = new VectorStore()` 模块级单例，无任何持久化 |
| R3 | 重复入库无去重 | `rag-upload.ts:37` `docId = \`doc_${Date.now()}\``，同一段文本每跑一次就多一份，检索结果被重复片段塞满 |
| R4 | 未配置模型时"文档入库"仍可跑，用户以为建好了语义索引 | 节点无任何 embedding 入口，也没有降级提示 |
| R5 | 词表是"字符 bigram"，跨语言与长词效果差，且停用词表混在中英文里 | `vector-store.ts:65-85` |

### Agent / 工具

| # | 缺陷 | 证据 |
| --- | --- | --- |
| A1 | 内置 `http-get` / `http-post` 工具无超时、无取消、无体积上限、无 SSRF 防护 | `nodes/agent/tool-call.ts:10-39` 直接 `fetch(url)`，连 `signal` 都没传 |
| A2 | MCP 连接失败会漏进程 | `mcp/client.ts:147` `connect()` 里 `request('initialize')` **reject** 时不走 `close()`（只有 `res.error` 分支才关），spawn 出来的子进程留在后台 |
| A3 | Windows 上杀不掉孙进程 | `mcp/client.ts:187` `proc.kill()` 只结束 `cmd.exe /c` 壳，`npx` 拉起的 node 子进程继续存活 |
| A4 | `stdin.write` 无错误处理 | `mcp/client.ts:223`，对端已退出时写入触发 EPIPE，错误在事件回调里抛出 |
| A5 | SSE transport 名不副实 | `mcp/client.ts:232` 只是向 `${url}/messages` POST JSON-RPC，没有 event-stream 订阅与会话 id；对外描述却写"SSE" |

### 出网安全（SSRF）

| # | 缺陷 | 证据 |
| --- | --- | --- |
| N1 | 内网判定只看 URL 里的字符串 | `nodes/actions/http-request.ts:44-49`，`http://2130706433/`、`http://127.0.1`、`http://[::ffff:127.0.0.1]/` 全部绕过；公共域名 DNS 解析到 127.0.0.1 也绕过 |
| N2 | 跟随重定向但只在第一跳做校验 | `http-request.ts:77` `redirect: 'follow'`，一跳 302 到 `169.254.169.254` 即取到云元数据 |
| N3 | `allowPrivateNetwork` 与 `timeout` 在 UI 里根本没有开关 | catalog 的 `http-request.fields` 只声明了 url/method/headers/body；节点代码却读 `config.allowPrivateNetwork`、`config.timeout`，属于"字段是摆设"同一类缺陷 |
| N4 | MCP 的 `serverUrl` 完全不过 SSRF | `mcp/client.ts:110` |

## 2. 目标

- G1 **零配置就能变好**：TF-IDF（含 IDF 与文档长度归一化）替换裸词频；同内容去重；索引落盘，重启可用。
- G2 **有模型就用真 embedding**：`rag-upload` / `rag-retrieve` 新增可选「向量模型」配置，走 OpenAI 兼容 `/embeddings`。索引记录自身 scheme（`tfidf` / `embed:<model>`），scheme 不一致时**显式报错并提示重建**，绝不混排打分。
- G3 工具调用不再裸奔：内置 HTTP 工具继承超时/取消/响应体上限，并与 HTTP 节点共用同一份出网校验。
- G4 MCP 生命周期可收敛：连接失败必清进程；Windows 走进程树终止；`stdin` 写入不崩主进程；对外描述与实际能力一致（先只承诺 stdio + "HTTP JSON-RPC"，不再叫 SSE）。
- G5 SSRF 防护按**解析后的 IP**判定，且重定向逐跳复检；同时给出可理解的"如何放行本地地址"提示。
- G6 以上全部有纯函数级测试；不可测的部分（真网络、真子进程）用注入点覆盖。

## 3. 非目标

- 不引入向量数据库依赖（sqlite-vec / hnswlib），维持零原生依赖：本地千级 chunk 用暴力扫描足够，先保证正确性。
- 不做 RAG 的分层召回、rerank 模型、混合检索。
- 不做 Agent 的多轮自主循环（ReAct）、工具白名单审批 UI —— 那是 S5 的事。
- 不改 6 库合一（S4）。RAG 索引因此**先落文件**，不新增 SQLite 库，避免给 S4 添第 7 个合并对象。

## 4. 设计

### 4.1 检索：scheme 化的向量存储

`VectorStore` 改为按 scheme 存向量：

```ts
type Scheme = { kind: 'tfidf' } | { kind: 'embed'; model: string; dim: number }
interface StoredChunk {
  id: string          // `${hash}#${i}`，hash = 内容 sha256 前 12 位
  hash: string        // 整篇文档内容哈希，用于去重与重建
  text: string
  metadata: Record<string, unknown>
  vector: number[]    // tfidf 时为稀疏词的稠密化下标向量？否 —— 见下
}
```

- **不做稠密化**：tfidf 仍用 `Map<string, number>` 稀疏表示（词 → tf·idf），embed 用 `number[]`。两者点积实现分开，避免为统一接口付出 O(词汇表) 的内存。
- IDF 在**写入时**基于当前语料统计，因此新增/删除文档会使旧向量的 idf 过期。取"存原始词频 + 检索时现算 idf"：
  `vector = 原始 TF（含长度归一）`，`score = Σ tf_q(t)·tf_d(t)·idf(t)² / (|d|·|q|)`。
  这样语料增长不需要重算任何历史向量，纯函数可测。
- scheme 冲突：库里已有 `embed` 向量而本次检索是 `tfidf`（或反之）→ 抛错，消息给出重建方法（清空索引节点/按钮），而不是静默返回低分。
- 去重：`hash` 命中已有文档 → 直接返回既有 `docId` 与 `chunkCount`，并 `ctx.logger('内容未变，跳过入库')`；输出加 `deduped: true`，让下游可判断。

### 4.2 持久化

`rag/index-store.ts`：文件存储，路径 `userData/rag-index.json`。

```json
{ "version": 1, "scheme": { "kind": "tfidf" }, "docs": [ { "id", "hash", "text", "meta", "tf": [["词", 频次]] } ] }
```

- 读：启动后首次访问懒加载；文件缺失/版本不符 → 视为空索引并在日志里说明（不静默采用半截数据）。
- 写：tmp + rename 原子替换；仅在 add/remove/clear 后写。
- embed 向量存 `number[]`，同时写 `dim`；加载时维度不符的条目丢弃并计数上报。
- 注入点：`IndexStore` 接收 `{ read, write }` 或直接在测试里用内存实现，避免测试碰文件系统。

### 4.3 embedding 客户端

`llm/embeddings.ts`：`createEmbeddings({ baseUrl, apiKey, model, input: string[] })` → `number[][]`。

- 复用 `resolveModel` 的凭证/ baseUrl 解析；新增 catalog 字段 `embedModelId`（`dataSource: 'models'`）。
- 批量：一次请求最多 64 条，超出分批；单批失败即整体失败（不静默退回 TF，否则用户以为在用 embedding）。
- 维度一致性：不同批次维度不同 → 报错（说明模型换了，需重建索引）。

### 4.4 出网安全：一份校验两处用

新增 `net/ssrf.ts`：

```ts
export function parseIpLiteral(host: string): string | null      // 含十进制/十六进制/IPv6-mapped 归一
export function isBlockedAddress(ip: string): boolean            // 私有/回环/链路本地/组播/未指定 + IPv6 对应段
export async function assertUrlAllowed(url: string, opts, lookup): Promise<void>
```

- 判定顺序：协议白名单 → host 字面 IP 归一后判定 → 域名则 `dns.lookup(all:true)` 取**全部** A/AAAA 结果，任一命中即拒绝。
- `redirect: 'manual'`，自己跟跳（上限 5），每一跳重跑 `assertUrlAllowed`。
- `allowPrivateNetwork` 提到 catalog 里成为真正的开关，help 写清楚后果；同时仍拦 metadata IP（169.254.0.0/16）除非显式放开？→ 采用**两档**：默认拦全部内网；开关打开后放行内网但仍拦链路本地 metadata 段，另给 `allowLinkLocal` 不现实 —— 结论：开关打开时放行内网并在日志里点名 metadata 段风险。
- 同一函数用于 http-request 节点、内置 http-get/http-post 工具、MCP `serverUrl`。

### 4.5 MCP 生命周期

- `connect()` 用 try/catch 包住：握手后任何一步抛错 → `this.close()`，保证 spawn 的进程一定被回收。
- `close()`：先 `stdin.end()`，再 `kill()`；Windows 用 `taskkill /pid <pid> /T /F`（参数数组、`shell:false`）做进程树终止，失败回落到 `kill`。
- `proc.stdin.on('error')`/`stdout.on('error')` 挂上，把 EPIPE 转成 `dead` + `rejectAll`，不再在回调里抛。
- 未 `close` 的客户端注册在模块级 `Set`，应用退出时 `closeAllMcpClients()` 统一回收（主进程 `before-quit`）。
- 注释与 README 明确：远程 transport 是"HTTP JSON-RPC POST"，不是 SSE。

### 4.6 内置 HTTP 工具

`http-get` / `http-post` 改走与 http-request 同一套请求实现（提取为 `net/http-fetch.ts`）：超时（`config.timeoutMs`，默认 30s）、`ctx.signal` 联动、10MB 响应上限、SSRF 校验、`redirect` 逐跳复检。

## 5. 测试策略

沿用 S0 约束（原生模块 ABI 使真库测试不可行；风险逻辑下沉为纯函数）：

1. **TF-IDF 打分**：同一词在 1 篇 vs 10 篇里出现的文档，其 idf 权重差异体现在排序上；长度归一避免长文霸榜。
2. **去重**：同文本入库两次 → `size` 不变、第二次 `deduped === true`。
3. **scheme 冲突**：embed 索引 + tfidf 查询 → 明确报错，消息含"重建"。
4. **持久化**：内存实现写入→重载→检索结果一致；版本不符当空索引处理且不抛。
5. **SSRF 纯函数**：`2130706433` / `0x7f.0.0.1` / `127.0.1` / `[::ffff:127.0.0.1]` / 域名解析到 127.0.0.1 全部拒绝；`allowPrivateNetwork` 时放行内网仍拦 metadata；重定向第二跳命中内网时报错（mock fetch 返回 302）。
6. **MCP 失败回收**：注入 fake `spawn`，让 initialize 超时，断言返回的 child 被 kill（含 taskkill 分支）。
7. **内置 HTTP 工具**：mock fetch 断言传了 signal 与超时，且 SSRF 违规地址在发出请求前就被拒。

## 6. 验收判据

1. 上述测试通过，S0-S2 的 124 项零回归。
2. 不配任何模型时，"入库 → 检索"结果比现在明显更准（同一夹具下 idf 让专有名词命中），重启后索引仍在。
3. 配了 embedding 模型时，走 `/embeddings`（mock 证明被调用、向量维度校验生效）。
4. HTTP 节点与内置 HTTP 工具无法再被数字形式 IP 或重定向绕过打到内网。
5. 跑 20 次失败的 MCP 连接后，任务管理器里没有残留 node/cmd 进程（人工验证项，代码侧由测试保证 close 必达）。
6. typecheck / lint(--max-warnings=0) / build / CI 全绿。

## 7. 风险

- **文件索引并发写**：多个工作流同时入库会互相覆盖。缓解：写前重读合并（last-writer-wins on doc granularity）。多窗口写同库仍可能丢，记为已知限制。
- **DNS 校验与实际连接之间的 rebinding 窗口**：Node 的 `fetch` 无法注入自定义 resolver，因此"校验后重绑"这一类攻击面无法在本层彻底关掉。文档如实说明，并建议对不可信工作流 JSON 不开 `allowPrivateNetwork`。
- **embedding 维度漂移**：换模型即需重建索引；scheme 报错是刻意设计，代价是老索引在换模型后不可用。
- **taskkill 属外部命令**：Windows 内置，路径固定 `C:\Windows\System32\taskkill.exe`，以数组传参不经 shell。
## 8. 实现期发现

1. **chunkText 的重叠方向是反的**。为了"修"重叠，我先把它改成取下一段的开头，
   结果同一段文字被重复塞进新块，块间重复达到 30 字（设定 10）。正确做法只有一个：
   重叠来自上一块的结尾。测试必须用互不相同的字符写夹具 —— 全同字符会让
   "后缀==前缀"的测量恒等于巧合命中，这条测试本身就是从失败里长出来的。
2. **chunk id 换成了内容哈希**，所以 `search` 返回的 `id` 不再是 `docId#i`。
   归属信息在 `metadata.docId`，测试断言因此要改；这也是去重能跨重启生效的前提。
3. **IDF 必须在检索时算**。存加权向量的话，每加一篇文档所有历史向量都过期；
   存原始词频 + 检索时套 idf，索引就永远不需要重建，代价只是一次哈希表遍历。
4. **scheme 不一致时报错而不是退回**：退回会让用户以为付费的 embedding 生效了，
   实际在拿词频分数排序。报错文案给出补救路径（清空重建 / 两边选同一模型）。
5. **`resolveModel` 提取到 `llm/resolve-model.ts`**：embedding 与聊天调用必须走同一套
   凭证解析，两份实现会漂移成"聊天能用、向量化拿不到 Key"。
6. **模型库的 `model` 字段是聊天模型名**，直接拿去 `/embeddings` 通常 404。
   因此 embedding 模型名单独填（`embeddingModel`），`embeddingProviderId` 只负责提供
   Base URL 与 Key —— 而不是偷偷复用聊天模型名。
7. **`allowPrivateNetwork` 与 `timeout` 在 catalog 里没有声明**，于是节点代码读得到、
   界面上没有开关：本地工具默认不能调本机服务，且只能在 JSON 里手改。
   这是 S0 那条"字段是摆设"的同一类问题，第三次出现。
8. **`safeFetch` 的超时判定要让位于取消**：外部 signal 先 abort 时报「执行已取消」，
   只有自己的定时器命中才报超时，否则取消会被显示成一次失败。
