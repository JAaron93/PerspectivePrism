import './ThinkingComponent.css'

interface ThinkingComponentProps {
  context?: string
}

export function ThinkingComponent({ context = 'Thinking...' }: ThinkingComponentProps) {
  return (
    <div className="thinking-container" role="status" aria-live="polite" aria-label={context}>
      <div className="thinking-spinner" aria-hidden="true"></div>
      <p className="thinking-text">{context}</p>
    </div>
  )
}
