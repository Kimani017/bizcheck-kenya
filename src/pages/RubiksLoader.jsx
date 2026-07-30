import { useEffect, useRef } from 'react'

const GREEN = '#1D9E75'
const DARK = '#12362c'
const CHECK_SVG = '<svg width="6" height="6" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// Real 3D Rubik's cube (27 pieces, true layer-twisting, no libraries).
// Every visible face shows a static BizCheck badge (green + checkmark) —
// colors never change, only the twisting motion. Drop in anywhere the app
// currently shows "Loading..." text.
// Usage: <RubiksLoader /> or <RubiksLoader label="Loading your catalog…" />
export default function RubiksLoader({ label = 'Loading…' }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const rubik = containerRef.current
    if (!rubik) return

    let cancelled = false
    const cubies = []

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const el = document.createElement('div')
          el.className = 'rl-cubie'
          const faces = [
            { show: z === 1, t: 'translateZ(5px)' },
            { show: z === -1, t: 'rotateY(180deg) translateZ(5px)' },
            { show: x === 1, t: 'rotateY(90deg) translateZ(5px)' },
            { show: x === -1, t: 'rotateY(-90deg) translateZ(5px)' },
            { show: y === -1, t: 'rotateX(90deg) translateZ(5px)' },
            { show: y === 1, t: 'rotateX(-90deg) translateZ(5px)' },
          ]
          faces.forEach((f) => {
            const face = document.createElement('div')
            face.className = 'rl-face'
            face.style.transform = f.t
            face.style.background = f.show ? GREEN : DARK
            if (f.show) face.innerHTML = CHECK_SVG
            el.appendChild(face)
          })
          el.style.transform = `rotateY(var(--u,0deg)) rotateX(var(--r,0deg)) rotateZ(var(--f,0deg)) translate3d(${x * 11}px, ${y * 11}px, ${z * 11}px)`
          rubik.appendChild(el)
          cubies.push({ el, x, y, z })
        }
      }
    }

    function twist(varName, filterFn, angle, duration) {
      return new Promise((resolve) => {
        const group = cubies.filter(filterFn).map((c) => c.el)
        group.forEach((el) => { el.style.transition = 'none' })
        requestAnimationFrame(() => {
          group.forEach((el) => {
            el.style.transition = `transform ${duration}ms ease-in-out`
            el.style.setProperty(`--${varName}`, `${angle}deg`)
          })
          setTimeout(resolve, duration)
        })
      })
    }

    function resetInstant(varName, filterFn) {
      cubies.filter(filterFn).forEach((c) => {
        c.el.style.transition = 'none'
        c.el.style.setProperty(`--${varName}`, '0deg')
      })
    }

    function wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    async function loop() {
      while (!cancelled) {
        await twist('u', (c) => c.y === -1, 90, 550)
        resetInstant('u', (c) => c.y === -1)
        await wait(120)
        if (cancelled) break

        await twist('r', (c) => c.x === 1, 90, 550)
        resetInstant('r', (c) => c.x === 1)
        await wait(120)
        if (cancelled) break

        await twist('f', (c) => c.z === 1, 90, 550)
        resetInstant('f', (c) => c.z === 1)
        await wait(300)
        if (cancelled) break

        await twist('f', (c) => c.z === 1, -90, 550)
        resetInstant('f', (c) => c.z === 1)
        await wait(120)
        if (cancelled) break

        await twist('r', (c) => c.x === 1, -90, 550)
        resetInstant('r', (c) => c.x === 1)
        await wait(120)
        if (cancelled) break

        await twist('u', (c) => c.y === -1, -90, 550)
        resetInstant('u', (c) => c.y === -1)
        await wait(400)
      }
    }

    loop()

    return () => {
      cancelled = true
      rubik.innerHTML = ''
    }
  }, [])

  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div className="rl-scene">
        <div className="rl-rubik" ref={containerRef} />
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>{label}</p>

      <style>{`
        @property --u { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
        @property --r { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
        @property --f { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
        .rl-scene { perspective: 400px; width: 44px; height: 44px; margin: 0 auto; }
        .rl-rubik {
          width: 44px; height: 44px; position: relative;
          transform-style: preserve-3d;
          transform: rotateX(-24deg) rotateY(28deg);
        }
        .rl-cubie {
          width: 10px; height: 10px; position: absolute; top: 17px; left: 17px;
          transform-style: preserve-3d;
        }
        .rl-face {
          position: absolute; width: 10px; height: 10px;
          display: flex; align-items: center; justify-content: center;
          border: 0.5px solid #0b241d;
        }
      `}</style>
    </div>
  )
}
