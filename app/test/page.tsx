'use client'

export default function TestPage() {
  return (
    <div style={{ padding: '50px', background: 'black', color: 'white', minHeight: '100vh', margin: 0 }}>
      <h1 style={{ fontSize: '72px', color: 'lime', fontWeight: 'bold', textAlign: 'center' }}>✅✅✅ TEST PAGE WORKS! ✅✅✅</h1>
      <p style={{ fontSize: '32px', textAlign: 'center' }}>If you can see this, routing is working!</p>
      <p style={{ fontSize: '24px', color: 'yellow', textAlign: 'center' }}>URL: {typeof window !== 'undefined' ? window.location.href : 'Loading...'}</p>
      <div style={{ textAlign: 'center', marginTop: '50px' }}>
        <a href="/" style={{ color: 'orange', fontSize: '24px', display: 'inline-block', margin: '10px' }}>← Back to Login</a>
        <a href="/home" style={{ color: 'cyan', fontSize: '24px', display: 'inline-block', margin: '10px' }}>→ Go to Home</a>
      </div>
    </div>
  )
}
