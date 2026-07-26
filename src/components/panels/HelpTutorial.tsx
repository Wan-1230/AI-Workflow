import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, MousePointer2, GripVertical, ArrowRightFromLine, Settings, Play, Terminal } from 'lucide-react'

interface Step { icon: React.ElementType; title: string; content: string; tip: string }

const steps: Step[] = [
  { icon: MousePointer2, title: 'Welcome', content: 'AI Workflow is a visual automation tool. Drag nodes onto the canvas, connect them, and hit run to execute the pipeline.', tip: 'Try building: GitHub API -> extract info -> notify.' },
  { icon: GripVertical, title: 'Add nodes', content: 'The left panel lists all available node types. Drag one onto the canvas to place it. Each node is an independent operation.', tip: 'Use the filter box to search.' },
  { icon: ArrowRightFromLine, title: 'Connect', content: 'Drag from a node\'s bottom handle (output) to another node\'s top handle (input). Condition nodes have T/F outputs for branching.', tip: 'One output can fan out to multiple downstream nodes.' },
  { icon: Settings, title: 'Configure', content: 'Click any node to open its config panel on the right. Edit parameters, write code, set conditions. Changes apply instantly.', tip: 'Use {{nodeId.field}} to reference upstream output. Also supports {{credentials.KEY}} and {{env.VAR}}.' },
  { icon: Play, title: 'Execute', content: 'Hit the amber Run button. Nodes execute in dependency order (parallel when possible). Click Stop to cancel mid-run.', tip: 'Delete key removes selected nodes. Save as .json to reuse.' },
  { icon: Terminal, title: 'Logs & History', content: 'The bottom panel shows real-time execution logs. The History button in the toolbar shows past runs with timing data.', tip: 'Logs auto-scroll. Expand entries to see node output.' },
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
      <div className="fixed inset-0 bg-black/20 z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] animate-fade-up">
        <div className="bg-card border border-border rounded shadow-card-hover overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-sm bg-accent/10 flex items-center justify-center text-accent">
                <Icon size={12} />
              </div>
              <div>
                <h2 className="font-display text-[12px] font-bold text-t-primary">{current.title}</h2>
                <p className="text-[9px] text-t-muted font-mono">{step + 1}/{steps.length}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-t-muted hover:text-t-primary hover:bg-overlay transition-colors">
              <X size={12} />
            </button>
          </div>

          <div className="px-4 py-3">
            <p className="text-[11px] text-t-secondary leading-relaxed">{current.content}</p>
            <div className="mt-3 p-2 bg-base rounded border border-border">
              <p className="text-[10px] text-t-muted leading-relaxed font-mono">{current.tip}</p>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-base">
            <div className="flex items-center gap-1">
              {steps.map((_, i) => (
                <button key={i} onClick={() => setStep(i)}
                  className={`h-1 rounded-full transition-all ${i === step ? 'w-4 bg-accent' : 'w-1 bg-border hover:bg-t-muted'}`} />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {!isFirst && (
                <button onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-t-secondary hover:text-t-primary hover:bg-overlay rounded transition-colors font-mono">
                  <ChevronLeft size={11} /> prev</button>
              )}
              {!isLast ? (
                <button onClick={() => setStep(s => s + 1)}
                  className="press-feedback flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold bg-accent text-white rounded transition-all font-mono">
                  next <ChevronRight size={11} /></button>
              ) : (
                <button onClick={onClose}
                  className="press-feedback flex items-center gap-1 px-3 py-1 text-[10px] font-bold bg-accent text-white rounded transition-all font-mono">
                  done</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
