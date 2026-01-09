import React from 'react'
import './ThinkingComponent.css'

interface ThinkingComponentProps {
  context?: string
}

export function ThinkingComponent({ context = 'Thinking...' }: ThinkingComponentProps) {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '2rem',
      color: '#666',
      backgroundColor: 'rgba(0, 0, 0, 0.03)',
      borderRadius: '8px',
      height: '100%',
      minHeight: '200px',
    },
    spinner: {
      width: '40px',
      height: '40px',
      border: '3px solid rgba(0, 0, 0, 0.1)',
      borderTopColor: '#3498db',
      borderRadius: '50%',
      marginBottom: '1rem',
    },
    text: {
      margin: 0,
      fontSize: '0.9rem',
      fontWeight: 500,
    }
  }

  return (
    <div className="thinking-container" style={styles.container}>
      <div className="thinking-spinner" style={styles.spinner}></div>
      <p className="thinking-text" style={styles.text}>{context}</p>
    </div>
  )
}
