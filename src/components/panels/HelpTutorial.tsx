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
    content: '节点底部的绿色圆点叫「输出手柄」，顶部的蓝色圆点叫「输入手柄」。从一个节点的输出手柄拖出连线到下一个节点的输入手柄，就建立了数据传递关系——上游节点的输出会自动传给下游节点。',
    tip: '💡 支持一对多连接，一个输出可以同时传给多个下游节点。',
  },
  {
    icon: Settings,
    title: '第三步：配置参数',
    content: '点击任意节点，右侧会显示它的配置面板。在这里你可以修改节点名称、设置请求地址、编写执行代码、选择判断条件等。配置会即时生效，修改后直接运行即可。',
    tip: '💡 配置中可以使用 {{节点名.字段名}} 的语法引用上游节点的输出数据。',
  },
  {
    icon: Play,
    title: '第四步：运行工作流',
    content: '连接好节点、配置完参数后，点击顶部工具栏右侧绿色的「运行」按钮，整个工作流就会按顺序执行。节点会依次亮起，你可以实时看到每个节点的执行状态——黄色表示运行中、绿色表示成功、红色表示出错。',
    tip: '💡 按 Delete 键可以删除选中的节点；可以随时「保存」工作流为 .json 文件以便复用。',
  },
  {
    icon: Terminal,
    title: '第五步：查看执行日志',
    content: '画布底部是「执行日志」面板。每个节点的执行过程、输入输出、耗时信息都会实时显示在这里。如果某个节点执行出错，日志中会显示红色的错误信息，帮助你快速定位问题。',
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
      <div className="fixed inset-0 bg-ink/70 z-50 backdrop-blur-sm" onClick={onClose} />

      {/* 对话框 */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[460px] animate-fade-in">
        <div className="bg-surface-100 border border-border-normal rounded-2xl shadow-2xl overflow-hidden">

          {/* 头部 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-node-trigger/10 flex items-center justify-center text-node-trigger">
                <Icon size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">{current.title}</h2>
                <p className="text-2xs text-text-muted">步骤 {step + 1} / {steps.length}</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-200 transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* 内容 */}
          <div className="px-5 py-4">
            <p className="text-[13px] text-text-secondary leading-relaxed">{current.content}</p>
            <div className="mt-4 p-3 bg-surface-0 rounded-xl border border-border-subtle">
              <p className="text-xs text-text-secondary leading-relaxed">{current.tip}</p>
            </div>
          </div>

          {/* 底部导航 */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border-subtle bg-surface-50">

            {/* 步骤点 */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <button key={i} onClick={() => setStep(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-5 bg-node-trigger' : 'w-1.5 bg-border-strong hover:bg-text-muted'
                  }`} />
              ))}
            </div>

            {/* 按钮 */}
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-200 rounded-lg transition-colors">
                  <ChevronLeft size={14} /> 上一步
                </button>
              )}
              {!isLast ? (
                <button onClick={() => setStep(s => s + 1)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-node-trigger text-white rounded-lg hover:brightness-110 transition-all">
                  下一步 <ChevronRight size={14} />
                </button>
              ) : (
                <button onClick={onClose}
                  className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium bg-node-action text-white rounded-lg hover:brightness-110 transition-all">
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
