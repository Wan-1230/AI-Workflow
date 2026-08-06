import { useState } from 'react'
import { X, Keyboard, ChevronRight, ChevronLeft } from 'lucide-react'
import { IconButton, Button } from '../ui'

/** 快捷键说明表 */
const shortcuts: { keys: string[]; desc: string }[] = [
  { keys: ['Ctrl/⌘ + Z'], desc: '撤销' },
  { keys: ['Ctrl/⌘ + Y'], desc: '重做' },
  { keys: ['Ctrl/⌘ + C', 'Ctrl/⌘ + V'], desc: '复制 / 粘贴节点' },
  { keys: ['Ctrl/⌘ + D'], desc: '复制选中节点' },
  { keys: ['Delete / Backspace'], desc: '删除选中节点' },
  { keys: ['Ctrl/⌘ + S'], desc: '保存到项目库' },
  { keys: ['Ctrl/⌘ + L'], desc: '自动布局' },
  { keys: ['Ctrl + 滚轮'], desc: '缩放画布' },
  { keys: ['空格拖拽 / 中键'], desc: '平移画布' },
  { keys: ['双击节点'], desc: '打开配置面板' },
  { keys: ['Esc'], desc: '取消选中' },
]

/** 使用引导步骤 */
const steps: { title: string; content: string }[] = [
  { title: '创建项目', content: '在首页点击「新建项目」，可选择空白画布或示例模板（LLM 对话 / RAG 问答 / 文本流水线）。' },
  { title: '编排节点', content: '从左侧面板拖拽节点到画布，从节点底部输出口拖线连接到下一个节点。条件节点有 True/False 两个分支出口。' },
  { title: '配置参数', content: '点击或双击节点，在右侧面板配置参数。支持 {{nodeId.field}} 引用上游输出、{{global.KEY}} 引用全局变量、{{env.VAR}} 引用环境变量。' },
  { title: '运行与调试', content: '点击右上角「运行」按钮执行工作流。底部运行面板实时显示日志与 LLM 流式输出，节点会高亮显示执行状态，失败节点显示错误原因。' },
]

/**
 * 帮助与快捷键引导弹窗
 */
export function HelpTutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'guide' | 'keys'>('guide')
  const [step, setStep] = useState(0)
  if (!open) return null

  const current = steps[step]
  const isFirst = step === 0
  const isLast = step === steps.length - 1

  return (
    <>
      <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px] z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[520px] max-w-[92vw] animate-scale-in">
        <div className="bg-surface border border-line rounded-xl shadow-modal overflow-hidden">
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 h-12 border-b border-line">
            <div className="flex items-center gap-2">
              <Keyboard size={15} className="text-accent" />
              <h2 className="text-sm font-semibold text-fg">帮助与快捷键</h2>
            </div>
            <IconButton size="sm" tooltip="关闭 (Esc)" onClick={onClose}>
              <X />
            </IconButton>
          </div>

          {/* Tab 切换 */}
          <div className="flex gap-1 px-5 pt-3">
            {([['guide', '使用引导'], ['keys', '快捷键']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={`px-3 h-7 rounded-md text-xs font-medium transition-colors ${
                  tab === v ? 'bg-accent-soft text-accent' : 'text-fg-secondary hover:bg-overlay hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 内容 */}
          <div className="p-5 min-h-52">
            {tab === 'guide' ? (
              <div>
                <div className="mb-1 text-2xs text-fg-muted">第 {step + 1} / {steps.length} 步</div>
                <h3 className="text-sm font-semibold text-fg mb-2">{current.title}</h3>
                <p className="text-xs text-fg-secondary leading-relaxed">{current.content}</p>
                <div className="flex justify-between mt-5">
                  <Button variant="ghost" size="sm" disabled={isFirst} icon={<ChevronLeft size={13} />}
                    onClick={() => setStep(s => s - 1)}>上一步</Button>
                  {isLast ? (
                    <Button variant="primary" size="sm" onClick={onClose}>开始使用</Button>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => setStep(s => s + 1)}>
                      下一步<ChevronRight size={13} />
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {shortcuts.map(s => (
                  <div key={s.desc} className="flex items-center justify-between py-1.5 border-b border-line/50 last:border-0">
                    <span className="text-xs text-fg-secondary">{s.desc}</span>
                    <span className="flex gap-1">
                      {s.keys.map(k => (
                        <kbd key={k}
                          className="px-1.5 py-0.5 rounded bg-raised border border-line text-2xs font-mono text-fg-secondary">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
