'use client'

import { Suspense, useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import * as THREE from 'three'
import { gsap } from 'gsap'

// GLSL Shaders
const simplexNoise = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}
`

const vertexShader = `
${simplexNoise}
uniform float uTime;
uniform float uWobbleIntensity;
uniform float uMorphProgress;
varying vec3 vPosition;
varying vec3 vNormal;
varying float vNoise;

void main() {
  vNormal = normal;
  float noise = snoise(position * 1.2 + uTime * 0.1) * 0.5;
  noise += snoise(position * 2.5 - uTime * 0.05) * 0.2;
  vNoise = noise;

  // Interpolate between wobble (blob) and smooth (circle)
  // When uMorphProgress = 0: full wobble (blob)
  // When uMorphProgress = 1: no wobble (perfect circle)
  float wobbleAmount = mix(noise * uWobbleIntensity * 0.45, 0.0, uMorphProgress);
  vec3 pos = position + normal * wobbleAmount;
  
  vec4 modelViewPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * modelViewPosition;
  vPosition = pos;
}
`

const fragmentShader = `
uniform float uTime;
uniform vec3 uColorGrey;
uniform vec3 uColorWhite;
uniform float uOpacity;
uniform float uGlowBoost;
uniform float uMorphProgress;
uniform float uCircleGlow;
varying vec3 vPosition;
varying vec3 vNormal;
varying float vNoise;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 viewDirection = normalize(cameraPosition - vPosition);
  float fresnel = pow(1.0 - max(0.0, dot(viewDirection, vNormal)), 2.5);
  
  // Calculate distance from center in XY plane
  float distFromCenter = length(vPosition.xy);
  
  // Blob state rendering (when uMorphProgress < 0.5)
  vec3 blobColor = vec3(0.0);
  float blobOpacity = 0.0;
  
  if (uMorphProgress < 0.5) {
    // Original blob rendering
    vec3 baseColor = mix(uColorGrey, uColorWhite, vNoise * 0.3 + 0.5);
    vec3 irid = vec3(0.5 + 0.3 * cos(uTime * 0.2 + vPosition.xyx + vec3(0,2,4)));
    blobColor = mix(baseColor, mix(uColorGrey, uColorWhite, irid), fresnel * 0.3);
    blobColor = mix(blobColor, uColorWhite, fresnel * 0.6);
    blobColor += uColorWhite * uGlowBoost * fresnel * 0.5;
    
    float grain = hash(vPosition.xy * 100.0 + uTime * 0.01) * 0.02;
    blobColor += grain;
    
    float glow = pow(1.0 - length(vPosition) * 0.42, 3.0);
    blobColor += uColorWhite * glow * 0.15;
    
    blobOpacity = uOpacity;
  }
  
  // Circle state rendering (when uMorphProgress >= 0.5)
  vec3 circleColor = uColorWhite;
  float circleOpacity = 0.0;
  
  if (uMorphProgress >= 0.5) {
    // Single white ring outline with transparent center
    float ringRadius = 0.85;
    float ringThickness = 0.15;
    
    // Create a single ring - distance from the ring center
    float distToRing = abs(distFromCenter - ringRadius);
    
    // Only render the ring outline, center is transparent
    circleOpacity = 1.0 - smoothstep(0.0, ringThickness * 0.5, distToRing);
    
    // Ensure center is completely transparent
    if (distFromCenter < ringRadius - ringThickness * 0.5) {
      circleOpacity = 0.0;
    }
    
    // Add subtle glow to the ring
    circleOpacity += fresnel * uCircleGlow * 0.15;
    circleOpacity = min(circleOpacity, 1.0);
  }
  
  // Blend between blob and circle states
  float morphBlend = smoothstep(0.4, 0.6, uMorphProgress);
  vec3 finalColor = mix(blobColor, circleColor, morphBlend);
  float finalOpacity = mix(blobOpacity, circleOpacity, morphBlend);
  
  gl_FragColor = vec4(finalColor, finalOpacity);
}
`

const BlobMesh: React.FC = () => {
  const blobRef = useRef<THREE.Mesh>(null!)
  
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uWobbleIntensity: { value: 0.8 },
    uOpacity: { value: 0.6 },
    uGlowBoost: { value: 0.0 },
    uMorphProgress: { value: 0.0 },
    uCircleGlow: { value: 0.0 },
    uColorGrey: { value: new THREE.Color("#888888") },
    uColorWhite: { value: new THREE.Color("#FFFFFF") },
  }), [])

  useFrame((state) => {
    uniforms.uTime.value = state.clock.getElapsedTime()
  })

  // GSAP animation for morph cycle
  useEffect(() => {
    const morphProgress = { value: 0 }
    const circleGlow = { value: 0 }
    
    const tl = gsap.timeline({ repeat: -1 })
    
    // Initial state: blob (hold for 2 seconds)
    tl.set(morphProgress, { value: 0 })
      .set(circleGlow, { value: 0 })
      .to({}, { duration: 2 })
      
      // Transition to circle over 3 seconds
      .to(morphProgress, { 
        value: 1.0, 
        duration: 3, 
        ease: "power2.inOut",
        onUpdate: () => {
          uniforms.uMorphProgress.value = morphProgress.value
        }
      })
      .to(circleGlow, { 
        value: 1.0, 
        duration: 3, 
        ease: "power2.inOut",
        onUpdate: () => {
          uniforms.uCircleGlow.value = circleGlow.value
        }
      }, "<")
      
      // Hold circle state for 2 seconds
      .to({}, { duration: 2 })
      
      // Transition back to blob over 3 seconds
      .to(morphProgress, { 
        value: 0.0, 
        duration: 3, 
        ease: "power2.inOut",
        onUpdate: () => {
          uniforms.uMorphProgress.value = morphProgress.value
        }
      })
      .to(circleGlow, { 
        value: 0.0, 
        duration: 3, 
        ease: "power2.inOut",
        onUpdate: () => {
          uniforms.uCircleGlow.value = circleGlow.value
        }
      }, "<")
      
      // Hold blob state for 2 seconds (before repeat)
      .to({}, { duration: 2 })

    return () => {
      tl.kill()
    }
  }, [uniforms])

  return (
    <mesh ref={blobRef} scale={[1.2, 1.2, 1.2]}>
      <sphereGeometry args={[1, 128, 128]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

export default function HeroBlob() {
  return (
    <div className="w-full h-full bg-transparent" style={{ backgroundColor: 'transparent' }}>
      <Canvas 
        camera={{ position: [0, 0, 5], fov: 35 }} 
        dpr={[1, 2]} 
        gl={{ 
          antialias: true, 
          alpha: true,
          preserveDrawingBuffer: false,
          powerPreference: "high-performance"
        }}
        style={{ background: 'transparent' }}
      >
        <color attach="background" args={['#0a0a0a']} />
        <Suspense fallback={null}>
          <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.2}>
            <BlobMesh />
          </Float>
          <ambientLight intensity={0.4} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1.5} color="#ffffff" />
          <pointLight position={[-10, -5, -5]} intensity={0.8} color="#ffffff" />
        </Suspense>
      </Canvas>
    </div>
  )
}
