import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

function AnimatedSphere({ position, color, speed = 1, scale = 1 }: {
  position: [number, number, number];
  color: string;
  speed?: number;
  scale?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.05 * speed;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.08 * speed;
    }
  });

  return (
    <Float speed={speed * 0.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <mesh ref={meshRef} position={position} scale={scale}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial
          color={color}
          roughness={0.6}
          metalness={0.3}
          transparent
          opacity={0.15}
        />
      </mesh>
    </Float>
  );
}

function AnimatedTorus({ position, color, speed = 1, scale = 1 }: {
  position: [number, number, number];
  color: string;
  speed?: number;
  scale?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.08 * speed;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.1 * speed;
    }
  });

  return (
    <Float speed={speed * 0.4} rotationIntensity={0.15} floatIntensity={0.4}>
      <mesh ref={meshRef} position={position} scale={scale}>
        <torusGeometry args={[1, 0.3, 12, 24]} />
        <meshStandardMaterial
          color={color}
          roughness={0.7}
          metalness={0.2}
          transparent
          opacity={0.12}
        />
      </mesh>
    </Float>
  );
}

function Particles({ count = 30 }) {
  const points = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
    }
    return positions;
  }, [count]);

  const pointsRef = useRef<THREE.Points>(null);

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.01;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={points}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#94a3b8"
        transparent
        opacity={0.3}
        sizeAttenuation
      />
    </points>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 5]} intensity={0.4} />
      
      {/* Subtle floating shapes - smaller and more transparent */}
      <AnimatedSphere position={[-4, 2.5, -8]} color="#94a3b8" speed={0.5} scale={0.6} />
      <AnimatedSphere position={[4, -1.5, -10]} color="#a1a1aa" speed={0.7} scale={0.5} />
      <AnimatedSphere position={[0, 3, -12]} color="#9ca3af" speed={0.4} scale={0.4} />
      <AnimatedTorus position={[3, 2.5, -9]} color="#a1a1aa" speed={0.4} scale={0.35} />
      <AnimatedTorus position={[-3, -2, -11]} color="#94a3b8" speed={0.6} scale={0.3} />
      
      {/* Subtle particles */}
      <Particles count={40} />
    </>
  );
}

export function FloatingShapes3D() {
  return (
    <div className="absolute inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 40 }}
        style={{ background: 'transparent' }}
        dpr={[1, 1.5]}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
