import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, MousePointer2, GripVertical, ArrowRightFromLine, Settings, Play, Terminal } from 'lucide-react'

interface Step { icon: React.ElementType; title: string; content: string; tip: string }

const steps: Step[] = [
  { icon: MousePointer2, title: 'Welcome', content: 'AI Workflow is a visual automation tool. Drag nodes onto the canvas, connect them, and hit Run to execute the pipeline.', tip: 'Try building: GitHub API \u2192 extract info \u2192 notify.' },
  { icon: GripVertical, title: 'Add Nodes', content: 'The left panel lists all available node types. Drag one onto the canvas to place it. Each node represents an independent operation.', tip: 'Use the search box to filter nodes by name or description.' },
  { icon: ArrowRightFromLine, title: 'Connect Nodes', content: 'Drag from a node\'s bottom handle (output) to another node\'s top handle (input). Condition nodes have T/F outputs for branching logic.', tip: 'One output can fan out to multiple downstream nodes.' },
  { icon: Settings, title: 'Configure', content: 'Click any node to open its configuration panel on the right. Edit parameters, write code, or set conditions. Changes apply instantly.', tip: 'Use {{nodeId.field}} to reference upstream output. Also supports {{credentials.KEY}} and {{env.VAR}}.' },
  { icon: Play, title: 'Execute', content: 'Click the indigo Run button in the toolbar. Nodes execute in dependency order (parallel when possible). Click Stop to cancel mid-run.', tip: 'Delete/Backspace removes selected nodes. Save as .json to reuse workflows.' },
  { icon: Terminal, title: 'Logs & History', content: 'The bottom panel shows real-time execution logs with timestamps. The History button shows past runs with timing and output data.', tip: 'Click log entries with output to expand and inspect node results.' },
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
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] animate-fade-up">
        <div className="bg-card border border-border rounded-xl shadow-modal overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent-light flex items-center justify-center">
                <Icon size={16} className="text-accent" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-t-primary">{current.title}</h2>
                <p className="text-[11px] text-t-muted">Step {step + 1} of {steps.length}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-t-muted hover:text-t-primary hover:bg-overlay transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 py-4">
            <p className="text-[13px] text-t-secondary leading-relaxed">{current.content}</p>
            <div className="mt-4 p-3 bg-base rounded-lg border border-border">
              <p className="text-[12px] text-t-muted leading-relaxed">{current.tip}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-base/50">
            {/* Progress dots */}
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <button key={i} onClick={() => setStep(i)}
                  className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-accent' : 'w-1.5 bg-border hover:bg-t-muted'}`} />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-t-secondary hover:text-t-primary hover:bg-overlay rounded-lg transition-colors">
                  <ChevronLeft size={14} /> Previous
                </button>
              )}
              {!isLast ? (
                <button onClick={() => setStep(s => s + 1)}
                  className="press-feedback flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold bg-accent text-white rounded-lg hover:bg-accent-muted transition-all shadow-sm">
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button onClick={onClose}
                  className="press-feedback flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold bg-accent text-white rounded-lg hover:bg-accent-muted transition-all shadow-sm">
                  Get Started
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
