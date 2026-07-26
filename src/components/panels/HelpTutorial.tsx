import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, MousePointer2, GripVertical, ArrowRightFromLine, Settings, Play, Terminal } from 'lucide-react'

interface Step {
  icon: React.ElementType
  title: string
  content: string
  tip: string
}

const steps: Step[] = [
  {
    icon: MousePointer2,
    title: '欢迎使用 AI Workflow',
    content: 'AI Workflow 是一个可视化的 AI 工作流自动化工具。你可以将不同的功能节点拖拽到画布上，用连线把它们串起来，点击运行就能自动执行整个流程——就像一个积木搭建的自动化流水线。',
    tip: '💡 试试看：先用 5 分钟搭建一个「获取 GitHub API → 提取关键信息 → 输出通知」的工作流。',
  },
  {
    icon: GripVertical,
    title: '第一步：添加节点',
    content: '左侧「节点面板」列出了所有可用的功能节点。找到你需要的节点，按住鼠标拖拽到中央画布上松开即可。每个节点代表一个独立的操作，比如发起 HTTP 请求、执行一段代码、判断条件分支等。',
    tip: '💡 你也可以在搜索框里输入关键词快速定位节点。',
  },
  {
    icon: ArrowRightFromLine,
    title: '第二步：连线节点',
    content: '节点底部的圆点叫「输出手柄」，顶部的圆点叫「输入手柄」。从一个节点的输出手柄拖出连线到下一个节点的输入手柄，就建立了数据传递关系——上游节点的输出会自动传给下游节点。条件节点有两个输出（T / F），分别对应判断为真或为假的分支。',
    tip: '💡 支持一对多连接，一个输出可以同时传给多个下游节点。',
  },
  {
    icon: Settings,
    title: '第三步：配置参数',
    content: '点击任意节点，右侧会显示它的配置面板。在这里你可以修改节点名称、设置请求地址、编写执行代码、选择判断条件等。配置会即时生效，修改后直接运行即可。',
    tip: '💡 配置中可以使用 {{节点ID.字段名}} 的语法引用上游输出，也支持 {{credentials.KEY}} 与 {{env.VAR}}。',
  },
  {
    icon: Play,
    title: '第四步：运行工作流',
    content: '连接好节点、配置完参数后，点击顶部工具栏右侧靛蓝色的「运行」按钮，整个工作流就会按依赖顺序执行（无依赖的节点会并行）。节点会依次亮起，运行中可随时点击「停止」取消。',
    tip: '💡 按 Delete 键可以删除选中的节点；可以随时「保存」工作流为 .json 文件以便复用。',
  },
  {
    icon: Terminal,
    title: '第五步：查看执行日志与历史',
    content: '画布底部是「执行日志」面板，实时显示每个节点的执行过程与输出。工具栏的「历史」按钮可查看历次执行记录与统计。如果某个节点出错，日志中会显示红色错误信息，帮助你快速定位问题。',
    tip: '💡 日志支持自动滚动，新消息会始终保持在可见区域。',
  },
]

export function HelpTutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)

  if (!open) return null

  const current = steps[step]
  const Icon = current.icon
  const isFirst = step === 0
  const isLast = step === steps.length - 1

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-black/30 z-50 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* 对话框 */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[460px] animate-fade-up">
        <div className="bg-card border border-border rounded-2xl shadow-glass overflow-hidden">

          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <Icon size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-t-primary tracking-tight">{current.title}</h2>
                <p className="text-2xs text-t-muted mt-0.5">步骤 {step + 1} / {steps.length}</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-t-muted hover:text-t-primary hover:bg-overlay transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* 内容 */}
          <div className="px-5 py-4">
            <p className="text-[13px] text-t-secondary leading-relaxed">{current.content}</p>
            <div className="mt-4 p-3 bg-base rounded-xl border border-border">
              <p className="text-xs text-t-secondary leading-relaxed">{current.tip}</p>
            </div>
          </div>

          {/* 底部导航 */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border bg-base">

            {/* 步骤点 */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <button key={i} onClick={() => setStep(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-5 bg-accent' : 'w-1.5 bg-border hover:bg-t-muted'
                  }`} />
              ))}
            </div>

            {/* 按钮 */}
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-t-secondary hover:text-t-primary hover:bg-overlay rounded-lg transition-colors">
                  <ChevronLeft size={14} /> 上一步
                </button>
              )}
              {!isLast ? (
                <button onClick={() => setStep(s => s + 1)}
                  className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-muted transition-all">
                  下一步 <ChevronRight size={14} />
                </button>
              ) : (
                <button onClick={onClose}
                  className="flex items-center gap-1 px-4 py-1.5 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-muted transition-all">
                  开始使用
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
