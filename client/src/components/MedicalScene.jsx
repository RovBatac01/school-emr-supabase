import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';

function Cross() {
  const group = useRef();
  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * .22;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * .45) * .12;
    group.current.position.y = Math.sin(state.clock.elapsedTime * .7) * .18;
  });
  return <group ref={group} scale={1.1}>
    <mesh><boxGeometry args={[.7, 2.1, .5]} /><meshStandardMaterial color="#38bdf8" metalness={.25} roughness={.3} /></mesh>
    <mesh><boxGeometry args={[2.1, .7, .5]} /><meshStandardMaterial color="#22c55e" metalness={.25} roughness={.3} /></mesh>
    <mesh scale={1.22}><sphereGeometry args={[1.15, 36, 36]} /><meshPhysicalMaterial color="#60a5fa" transparent opacity={.12} roughness={.1} transmission={.65} thickness={1} /></mesh>
  </group>;
}

export default function MedicalScene({ className = '' }) {
  return <div className={className} aria-hidden="true"><Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
    <ambientLight intensity={1.1} /><directionalLight position={[4, 5, 5]} intensity={2} /><pointLight position={[-4, -2, 3]} color="#22d3ee" intensity={5} />
    <Cross />
  </Canvas></div>;
}
