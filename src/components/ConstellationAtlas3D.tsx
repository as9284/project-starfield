/**
 * ConstellationAtlas3D — Immersive WebGL solar-system scene for the
 * constellation overlay. Luna sits at the centre as a radiant star; each
 * constellation orbits with unique visual personality and interactive
 * particle trails. The scene features nebula-like ambient particles,
 * smooth camera choreography, and game-like hover feedback.
 *
 * Lazy-loaded by ConstellationOverlay.
 */

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text, Billboard, OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  CONSTELLATIONS,
  type ConstellationEntry,
  type ConstellationId,
} from "../lib/constellation-catalog";

// ── Reusable temp vectors ────────────────────────────────────────────────────

const _v3 = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _defaultCamPos = new THREE.Vector3(0, 9, 20);
const _focusOffset = new THREE.Vector3(0, 2.5, 5.5);

// ── Constants ────────────────────────────────────────────────────────────────

const RING_COLOR = new THREE.Color("#5e52b8");
const LINE_COLOR = new THREE.Color("#4a3ea0");
const LABEL_COLOR = "#e2ddf8";
const DESC_COLOR = "#9d90d4";

// ── Ambient nebula particles ─────────────────────────────────────────────────

function NebulaParticles({ count = 300 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [
      new THREE.Color("#7c4ff0"),
      new THREE.Color("#d946ef"),
      new THREE.Color("#6366f1"),
      new THREE.Color("#14b8a6"),
      new THREE.Color("#9b78f8"),
      new THREE.Color("#ffd088"),
    ];
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.8;
      pos[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
      pos[i * 3 + 1] = Math.sin(phi) * r * 0.4;
      pos[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
      const c = palette[Math.floor(Math.random() * palette.length)];
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return [pos, col];
  }, [count]);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.003;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        transparent
        opacity={0.4}
        size={0.12}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ── Smooth intro camera ──────────────────────────────────────────────────────

function IntroCamera() {
  const { camera } = useThree();
  const progress = useRef(0);
  const startPos = useMemo(() => new THREE.Vector3(0, 22, 40), []);
  const endPos = useMemo(() => new THREE.Vector3(0, 9, 20), []);

  useEffect(() => {
    camera.position.copy(startPos);
  }, [camera, startPos]);

  useFrame((_, delta) => {
    if (progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + delta * 0.5);
    const t = 1 - Math.pow(1 - progress.current, 3);
    camera.position.lerpVectors(startPos, endPos, t);
  });

  return null;
}

// ── Luna core — radiant star ─────────────────────────────────────────────────

function LunaCore() {
  const coreRef = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const rayRefs = [
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
  ];
  const flare1Ref = useRef<THREE.Mesh>(null);
  const flare2Ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (coreRef.current) {
      coreRef.current.rotation.y = t * 0.06;
      const pulse = 1.0 + Math.sin(t * 1.8) * 0.03;
      coreRef.current.scale.setScalar(pulse);
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 3.2 + Math.sin(t * 2.2) * 0.8;
    }

    if (innerGlowRef.current) {
      const p = 1.0 + Math.sin(t * 1.2) * 0.06;
      innerGlowRef.current.scale.setScalar(p);
      innerGlowRef.current.rotation.y = -t * 0.03;
      const mat = innerGlowRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.24 + Math.sin(t * 1.5) * 0.06;
    }

    if (coronaRef.current) {
      const p2 = 1.0 + Math.sin(t * 0.5 + 1.0) * 0.08;
      coronaRef.current.scale.setScalar(p2);
      coronaRef.current.rotation.y = -t * 0.02;
    }

    if (haloRef.current) {
      haloRef.current.scale.setScalar(1.0 + Math.sin(t * 0.3) * 0.04);
    }

    rayRefs.forEach((ref, i) => {
      if (ref.current) {
        ref.current.rotation.z = t * 0.015 + (i * Math.PI) / 3;
        const s = 1.0 + Math.sin(t * 1.0 + i * 2) * 0.1;
        ref.current.scale.set(s, 1, 1);
      }
    });

    if (flare1Ref.current) {
      flare1Ref.current.scale.setScalar(1.0 + Math.sin(t * 2.0) * 0.15);
      flare1Ref.current.rotation.z = Math.sin(t * 0.4) * 0.2;
    }
    if (flare2Ref.current) {
      flare2Ref.current.scale.setScalar(1.0 + Math.sin(t * 1.7 + 1.5) * 0.12);
      flare2Ref.current.rotation.z = Math.PI * 0.5 + Math.sin(t * 0.35) * 0.15;
    }
  });

  return (
    <group>
      {/* White-hot core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial
          color="#fff8e7"
          emissive="#ffd088"
          emissiveIntensity={3.2}
          roughness={0.0}
          metalness={1.0}
        />
      </mesh>

      {/* Inner glow */}
      <mesh ref={innerGlowRef}>
        <sphereGeometry args={[0.62, 32, 32]} />
        <meshStandardMaterial
          color="#ffb347"
          transparent
          opacity={0.24}
          emissive="#ff9f43"
          emissiveIntensity={1.2}
          roughness={0.2}
          metalness={0.3}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Corona rays */}
      {rayRefs.map((ref, i) => (
        <group ref={ref} key={i}>
          <mesh>
            <boxGeometry args={[2.4, 0.04, 0.04]} />
            <meshStandardMaterial
              color="#ffe4b5"
              emissive="#ffd700"
              emissiveIntensity={3.0}
              transparent
              opacity={0.45}
            />
          </mesh>
        </group>
      ))}

      {/* Solar prominences */}
      <mesh ref={flare1Ref} rotation={[0, 0, 0.4]}>
        <torusGeometry args={[0.75, 0.03, 8, 32, Math.PI * 0.4]} />
        <meshStandardMaterial
          color="#ff6b35"
          emissive="#ff4500"
          emissiveIntensity={2.5}
          transparent
          opacity={0.5}
        />
      </mesh>
      <mesh ref={flare2Ref} rotation={[0, 0, -0.6]}>
        <torusGeometry args={[0.82, 0.02, 8, 24, Math.PI * 0.3]} />
        <meshStandardMaterial
          color="#ff8c42"
          emissive="#ff6600"
          emissiveIntensity={2.0}
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* Mid glow shell */}
      <mesh ref={coronaRef}>
        <sphereGeometry args={[1.15, 20, 20]} />
        <meshStandardMaterial
          color="#ff9f43"
          transparent
          opacity={0.07}
          emissive="#ffd700"
          emissiveIntensity={0.8}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Outer halo */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[1.8, 14, 14]} />
        <meshStandardMaterial
          color="#ffd700"
          transparent
          opacity={0.025}
          emissive="#ff8c00"
          emissiveIntensity={0.3}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Luna label */}
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, 1.1, 0]}
          fontSize={0.22}
          color="#ffe4b5"
          anchorX="center"
          anchorY="bottom"
          font={undefined}
          outlineWidth={0.012}
          outlineColor="#08081a"
        >
          Luna
        </Text>
      </Billboard>

      {/* Core lights */}
      <pointLight color="#ffd088" intensity={10} distance={36} decay={2} />
      <pointLight color="#ffb347" intensity={3} distance={22} decay={2} />
    </group>
  );
}

// ── Orbit ring with highlight ────────────────────────────────────────────────

interface OrbitRingProps {
  radius: number;
  introRef: { current: number[] };
  isHighlighted?: boolean;
  glowHex?: string;
}

function OrbitRing({
  radius,
  introRef,
  isHighlighted,
  glowHex,
}: OrbitRingProps) {
  const ref = useRef<THREE.Group>(null);

  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    const segments = 200;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
    }
    return pts;
  }, [radius]);

  useFrame(() => {
    if (ref.current) {
      ref.current.scale.setScalar(Math.max(...introRef.current, 0));
    }
  });

  const color =
    isHighlighted && glowHex ? new THREE.Color(glowHex) : RING_COLOR;
  const opacity = isHighlighted ? 0.6 : 0.3;
  const width = isHighlighted ? 1.8 : 1.0;

  return (
    <group ref={ref}>
      <Line
        points={points}
        color={color}
        transparent
        opacity={opacity}
        lineWidth={width}
      />
    </group>
  );
}

// ── Connector line ───────────────────────────────────────────────────────────

function ConnectorLine({
  groupRef,
  isHighlighted,
  glowHex,
}: {
  groupRef: React.RefObject<THREE.Group | null>;
  isHighlighted?: boolean;
  glowHex?: string;
}) {
  const lineRef = useRef<THREE.Line>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    return g;
  }, []);
  const lineColor =
    isHighlighted && glowHex ? new THREE.Color(glowHex) : LINE_COLOR;
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: isHighlighted ? 0.5 : 0.25,
      }),
    [lineColor, isHighlighted],
  );

  useFrame(() => {
    if (!lineRef.current || !groupRef.current) return;
    const pos = groupRef.current.position;
    const arr = lineRef.current.geometry.attributes.position
      .array as Float32Array;
    arr[3] = pos.x;
    arr[4] = pos.y;
    arr[5] = pos.z;
    lineRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return <primitive ref={lineRef} object={new THREE.Line(geo, mat)} />;
}

// ── Orbital trail particles ──────────────────────────────────────────────────

function OrbitalTrail({
  entry,
  introRef,
  idx,
}: {
  entry: ConstellationEntry;
  introRef: { current: number[] };
  idx: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const trailCount = 20;

  const positions = useMemo(() => new Float32Array(trailCount * 3), []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const r = entry.orbitRadius * (introRef.current[idx] ?? 0);

    for (let i = 0; i < trailCount; i++) {
      const trailT = t - i * 0.08;
      const angle = trailT * entry.orbitSpeed * 0.1 + entry.orbitOffset;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.sin(angle) * r;
    }

    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={entry.glowHex}
        transparent
        opacity={0.5}
        size={0.06}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ── Per-planet unique detail components ──────────────────────────────────────

/** Orbit — Saturn-like multi-ring system */
function OrbitDetail({ highlighted }: { highlighted: boolean }) {
  const innerRef = useRef<THREE.Mesh>(null);
  const midRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const gemRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const speedMul = highlighted ? 1.4 : 1.0;
    if (innerRef.current) innerRef.current.rotation.z = t * 0.04 * speedMul;
    if (midRef.current) midRef.current.rotation.z = -t * 0.025 * speedMul;
    if (outerRef.current) outerRef.current.rotation.z = t * 0.015 * speedMul;
    if (gemRef.current) {
      gemRef.current.rotation.y = t * 0.5;
      gemRef.current.rotation.x = t * 0.3;
      const s = highlighted ? 1.15 : 1.0;
      gemRef.current.scale.setScalar(s + Math.sin(t * 2) * 0.05);
    }
  });

  return (
    <>
      <mesh ref={innerRef} rotation={[0.55, 0.1, 0]}>
        <torusGeometry args={[0.42, 0.02, 8, 48]} />
        <meshStandardMaterial
          color="#a78bfa"
          emissive="#7c4ff0"
          emissiveIntensity={highlighted ? 2.8 : 2.0}
          transparent
          opacity={highlighted ? 0.85 : 0.7}
        />
      </mesh>
      <mesh ref={midRef} rotation={[0.55, 0.1, 0]}>
        <torusGeometry args={[0.52, 0.014, 8, 48]} />
        <meshStandardMaterial
          color="#c4b5fd"
          emissive="#a78bfa"
          emissiveIntensity={highlighted ? 2.0 : 1.5}
          transparent
          opacity={highlighted ? 0.6 : 0.45}
        />
      </mesh>
      <mesh ref={outerRef} rotation={[0.55, 0.1, 0]}>
        <torusGeometry args={[0.62, 0.008, 6, 48]} />
        <meshStandardMaterial
          color="#ddd6fe"
          emissive="#c4b5fd"
          emissiveIntensity={highlighted ? 1.4 : 1.0}
          transparent
          opacity={highlighted ? 0.45 : 0.3}
        />
      </mesh>
      {/* Tiny orbiting gem */}
      <mesh ref={gemRef} position={[0.42, 0.16, 0]}>
        <octahedronGeometry args={[0.04, 0]} />
        <meshStandardMaterial
          color="#e9d5ff"
          emissive="#a78bfa"
          emissiveIntensity={3.0}
        />
      </mesh>
    </>
  );
}

/** Solaris — mini sun with warm corona */
function SolarisDetail({ highlighted }: { highlighted: boolean }) {
  const coronaRef = useRef<THREE.Mesh>(null);
  const flare1Ref = useRef<THREE.Mesh>(null);
  const flare2Ref = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (coronaRef.current) {
      coronaRef.current.rotation.y = t * 0.15;
      coronaRef.current.scale.setScalar(1.0 + Math.sin(t * 1.5) * 0.08);
    }
    if (flare1Ref.current) {
      flare1Ref.current.scale.setScalar(
        1.0 + Math.sin(t * 2.0) * (highlighted ? 0.35 : 0.25),
      );
      flare1Ref.current.rotation.z = Math.sin(t * 0.3) * 0.3;
    }
    if (flare2Ref.current) {
      flare2Ref.current.scale.setScalar(1.0 + Math.sin(t * 1.7 + 1.5) * 0.2);
      flare2Ref.current.rotation.z = Math.PI + Math.sin(t * 0.25 + 1) * 0.25;
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1.0 + Math.sin(t * 1.2) * 0.05);
    }
  });

  return (
    <>
      <mesh ref={coronaRef}>
        <sphereGeometry args={[0.48, 20, 20]} />
        <meshStandardMaterial
          color="#ff9f43"
          transparent
          opacity={highlighted ? 0.18 : 0.12}
          emissive="#ff6b35"
          emissiveIntensity={highlighted ? 1.5 : 1.0}
          side={THREE.BackSide}
        />
      </mesh>
      <mesh ref={flare1Ref} rotation={[0, 0, 0.4]}>
        <torusGeometry args={[0.55, 0.02, 8, 24, Math.PI * 0.5]} />
        <meshStandardMaterial
          color="#ff6348"
          emissive="#ff4500"
          emissiveIntensity={highlighted ? 3.5 : 2.5}
          transparent
          opacity={highlighted ? 0.7 : 0.55}
        />
      </mesh>
      <mesh ref={flare2Ref} rotation={[0.3, 0, -0.5]}>
        <torusGeometry args={[0.6, 0.015, 8, 20, Math.PI * 0.35]} />
        <meshStandardMaterial
          color="#ffbe76"
          emissive="#ff9f43"
          emissiveIntensity={highlighted ? 2.4 : 1.8}
          transparent
          opacity={highlighted ? 0.55 : 0.4}
        />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.38, 16, 16]} />
        <meshStandardMaterial
          color="#feca57"
          transparent
          opacity={highlighted ? 0.22 : 0.15}
          emissive="#ff9f43"
          emissiveIntensity={1.5}
          side={THREE.FrontSide}
        />
      </mesh>
    </>
  );
}

/** Beacon — scanning lighthouse with rotating sweep beam */
function BeaconDetail({ highlighted }: { highlighted: boolean }) {
  const sweepRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const speed = highlighted ? 1.4 : 1.0;
    if (sweepRef.current) sweepRef.current.rotation.y = t * 0.8 * speed;
    if (ringRef.current) ringRef.current.rotation.y = -t * 0.3 * speed;
    if (beamRef.current) beamRef.current.rotation.y = t * 1.2 * speed;
  });

  return (
    <>
      <mesh ref={sweepRef} rotation={[Math.PI * 0.5, 0, 0]}>
        <torusGeometry args={[0.4, 0.012, 8, 48, Math.PI * 0.7]} />
        <meshStandardMaterial
          color="#818cf8"
          emissive="#6366f1"
          emissiveIntensity={highlighted ? 3.5 : 2.5}
          transparent
          opacity={highlighted ? 0.85 : 0.7}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI * 0.45, 0.3, 0]}>
        <torusGeometry args={[0.5, 0.007, 8, 48]} />
        <meshStandardMaterial
          color="#a5b4fc"
          emissive="#818cf8"
          emissiveIntensity={highlighted ? 2.0 : 1.5}
          transparent
          opacity={highlighted ? 0.55 : 0.4}
        />
      </mesh>
      <group ref={beamRef}>
        <mesh position={[0, 0.55, 0.1]}>
          <boxGeometry args={[0.02, 0.5, 0.02]} />
          <meshStandardMaterial
            color="#e0e7ff"
            emissive="#c7d2fe"
            emissiveIntensity={highlighted ? 4.0 : 3.0}
            transparent
            opacity={highlighted ? 0.75 : 0.6}
          />
        </mesh>
      </group>
    </>
  );
}

/** Hyperlane — warp streaks with speed trails */
function HyperlaneDetail({ highlighted }: { highlighted: boolean }) {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const trailRefs = [
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
    useRef<THREE.Mesh>(null),
  ];

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const speed = highlighted ? 1.3 : 1.0;
    if (ring1Ref.current) ring1Ref.current.rotation.y = t * 0.6 * speed;
    if (ring2Ref.current) ring2Ref.current.rotation.y = -t * 0.45 * speed;
    trailRefs.forEach((ref, i) => {
      if (ref.current) {
        ref.current.rotation.y = t * 0.2 + i * Math.PI * 0.66;
        ref.current.scale.x =
          1.0 +
          Math.sin(t * (3.0 - i * 0.3) + i * 2) * (highlighted ? 0.25 : 0.15);
      }
    });
  });

  return (
    <>
      <mesh ref={ring1Ref} rotation={[0.8, 0, 0.4]}>
        <torusGeometry args={[0.44, 0.008, 8, 48]} />
        <meshStandardMaterial
          color="#2dd4bf"
          emissive="#14b8a6"
          emissiveIntensity={highlighted ? 3.5 : 2.5}
          transparent
          opacity={highlighted ? 0.75 : 0.6}
        />
      </mesh>
      <mesh ref={ring2Ref} rotation={[1.2, 0.5, 0]}>
        <torusGeometry args={[0.38, 0.006, 8, 48]} />
        <meshStandardMaterial
          color="#5eead4"
          emissive="#14b8a6"
          emissiveIntensity={highlighted ? 2.4 : 1.8}
          transparent
          opacity={highlighted ? 0.55 : 0.4}
        />
      </mesh>
      {trailRefs.map((ref, i) => (
        <mesh ref={ref} key={i}>
          <boxGeometry args={[0.6 - i * 0.08, 0.008, 0.008]} />
          <meshStandardMaterial
            color="#99f6e4"
            emissive="#2dd4bf"
            emissiveIntensity={3.0 - i * 0.4}
            transparent
            opacity={(highlighted ? 0.65 : 0.5) - i * 0.12}
          />
        </mesh>
      ))}
    </>
  );
}

/** Pulsar — pulsing energy arcs */
function PulsarDetail({ highlighted }: { highlighted: boolean }) {
  const arc1Ref = useRef<THREE.Mesh>(null);
  const arc2Ref = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const coreGlowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const speed = highlighted ? 1.3 : 1.0;
    const pulse = Math.abs(Math.sin(t * 2.5 * speed));
    if (arc1Ref.current) {
      const s = 0.7 + pulse * 0.5;
      arc1Ref.current.scale.setScalar(s);
      arc1Ref.current.rotation.z = t * 0.3;
    }
    if (arc2Ref.current) {
      const s2 = 0.7 + Math.abs(Math.sin(t * 2.5 * speed + 1.5)) * 0.4;
      arc2Ref.current.scale.setScalar(s2);
      arc2Ref.current.rotation.z = -t * 0.25 + Math.PI * 0.5;
    }
    if (pulseRef.current) {
      pulseRef.current.scale.setScalar(
        0.3 + pulse * (highlighted ? 0.5 : 0.35),
      );
      const mat = pulseRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.0 + pulse * (highlighted ? 5.0 : 4.0);
      mat.opacity = 0.15 + pulse * (highlighted ? 0.35 : 0.25);
    }
    if (coreGlowRef.current) {
      const glow = 0.6 + pulse * 0.4;
      coreGlowRef.current.scale.setScalar(glow);
    }
  });

  return (
    <>
      <mesh ref={arc1Ref} rotation={[Math.PI * 0.5, 0, 0]}>
        <torusGeometry args={[0.38, 0.018, 8, 32, Math.PI * 1.2]} />
        <meshStandardMaterial
          color="#c4b5fd"
          emissive="#9b78f8"
          emissiveIntensity={highlighted ? 3.5 : 2.5}
          transparent
          opacity={highlighted ? 0.75 : 0.6}
        />
      </mesh>
      <mesh ref={arc2Ref} rotation={[Math.PI * 0.4, 0.2, 0]}>
        <torusGeometry args={[0.32, 0.012, 8, 28, Math.PI * 0.8]} />
        <meshStandardMaterial
          color="#ddd6fe"
          emissive="#c4b5fd"
          emissiveIntensity={highlighted ? 2.6 : 2.0}
          transparent
          opacity={highlighted ? 0.6 : 0.45}
        />
      </mesh>
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial
          color="#e9d5ff"
          emissive="#9b78f8"
          emissiveIntensity={1.0}
          transparent
          opacity={0.15}
          side={THREE.BackSide}
        />
      </mesh>
      <mesh ref={coreGlowRef}>
        <dodecahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial
          color="#9b78f8"
          emissive="#7c3aed"
          emissiveIntensity={highlighted ? 2.2 : 1.5}
          transparent
          opacity={highlighted ? 0.55 : 0.4}
          wireframe
        />
      </mesh>
    </>
  );
}

type DetailProps = { highlighted: boolean };
const DETAIL_MAP: Record<ConstellationId, React.FC<DetailProps>> = {
  orbit: OrbitDetail,
  solaris: SolarisDetail,
  beacon: BeaconDetail,
  hyperlane: HyperlaneDetail,
  pulsar: PulsarDetail,
};

// ── Camera focus ─────────────────────────────────────────────────────────────

interface CameraFocusProps {
  focusedId: ConstellationId | null;
  introRef: { current: number[] };
}

function CameraFocus({ focusedId, introRef }: CameraFocusProps) {
  const { controls, camera } = useThree();
  const canControl = useRef(false);

  useFrame((state, delta) => {
    if (!controls) return;
    const ctrl = controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    };

    const introDone = introRef.current.every((v) => v >= 0.95);
    if (!canControl.current && introDone) canControl.current = true;

    if (focusedId !== null) {
      const idx = CONSTELLATIONS.findIndex((c) => c.id === focusedId);
      const entry = CONSTELLATIONS[idx];
      if (!entry) return;
      const introT = introRef.current[idx] ?? 1;
      const t = state.clock.getElapsedTime();
      const angle = t * entry.orbitSpeed * 0.1 + entry.orbitOffset;
      const r = entry.orbitRadius * introT;
      const px = Math.cos(angle) * r;
      const pz = Math.sin(angle) * r;

      _v3.set(px, 0, pz);
      ctrl.target.lerp(_v3, 1 - Math.pow(0.1, delta));

      if (canControl.current) {
        _v3.set(px + _focusOffset.x, _focusOffset.y, pz + _focusOffset.z);
        camera.position.lerp(_v3, 1 - Math.pow(0.1, delta));
      }
    } else {
      ctrl.target.lerp(_origin, 1 - Math.pow(0.12, delta));
      if (
        canControl.current &&
        camera.position.distanceTo(_defaultCamPos) > 0.5
      ) {
        camera.position.lerp(_defaultCamPos, 1 - Math.pow(0.08, delta));
      }
    }
    ctrl.update();
  });

  return null;
}

// ── Constellation node ───────────────────────────────────────────────────────

interface NodeProps {
  entry: ConstellationEntry;
  hovered: ConstellationId | null;
  active: ConstellationId | null;
  onHover: (id: ConstellationId | null) => void;
  onClick: (id: ConstellationId) => void;
  introRef: { current: number[] };
  idx: number;
}

function ConstellationNode({
  entry,
  hovered,
  active,
  onHover,
  onClick,
  introRef,
  idx,
}: NodeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const textGroupRef = useRef<THREE.Group>(null);
  const color = useMemo(() => new THREE.Color(entry.glowHex), [entry.glowHex]);

  const isHovered = hovered === entry.id;
  const isActive = active === entry.id;
  const highlighted = isHovered || isActive;

  const ps = entry.planetSize;
  const targetSphereScale = (highlighted ? 1.3 : 1.0) * ps;
  const targetGlowScale = (highlighted ? 1.5 : 1.0) * ps;
  const targetEmissive = highlighted ? 2.0 : 0.7;

  const DetailComponent = DETAIL_MAP[entry.id];

  useFrame(({ clock }, delta) => {
    const introT = introRef.current[idx] ?? 0;
    const t = clock.getElapsedTime();
    const currentRadius = entry.orbitRadius * introT;
    const angle = t * entry.orbitSpeed * 0.1 + entry.orbitOffset;
    const x = Math.cos(angle) * currentRadius;
    const z = Math.sin(angle) * currentRadius;

    if (groupRef.current) {
      _v3.set(x, 0, z);
      groupRef.current.position.lerp(_v3, 1.0 - Math.pow(0.001, delta));
    }

    if (sphereRef.current) {
      _scale.setScalar(targetSphereScale * introT);
      sphereRef.current.scale.lerp(_scale, 0.1);
      const mat = sphereRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.1;
      sphereRef.current.rotation.y += delta * 0.15;
    }

    if (glowRef.current) {
      _scale.setScalar(targetGlowScale * introT);
      glowRef.current.scale.lerp(_scale, 0.08);
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity +=
        ((highlighted ? 0.22 : 0.07) * introT - mat.opacity) * 0.08;
    }

    if (atmosphereRef.current) {
      const atmoScale = (highlighted ? 1.65 : 1.3) * introT * ps;
      _scale.setScalar(atmoScale);
      atmosphereRef.current.scale.lerp(_scale, 0.06);
      const mat = atmosphereRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity += ((highlighted ? 0.1 : 0.03) * introT - mat.opacity) * 0.06;
    }

    if (textGroupRef.current) {
      const textScale = (highlighted ? 1.35 : 1.0) * Math.max(ps, 0.9) * introT;
      _scale.setScalar(textScale);
      textGroupRef.current.scale.lerp(_scale, 0.1);
    }
  });

  return (
    <>
      <ConnectorLine
        groupRef={groupRef}
        isHighlighted={highlighted}
        glowHex={entry.glowHex}
      />
      <group ref={groupRef}>
        {/* Node sphere */}
        <mesh
          ref={sphereRef}
          onPointerOver={() => onHover(entry.id)}
          onPointerOut={() => onHover(null)}
          onClick={() => onClick(entry.id)}
        >
          <sphereGeometry args={[0.3, 24, 24]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.7}
            roughness={0.12}
            metalness={0.88}
          />
        </mesh>
        {/* Inner glow shell */}
        <mesh ref={glowRef}>
          <sphereGeometry args={[0.44, 16, 16]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.07}
            emissive={color}
            emissiveIntensity={0.5}
            side={THREE.BackSide}
          />
        </mesh>
        {/* Outer atmosphere */}
        <mesh ref={atmosphereRef}>
          <sphereGeometry args={[0.58, 14, 14]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.03}
            emissive={color}
            emissiveIntensity={0.25}
            side={THREE.BackSide}
          />
        </mesh>
        {/* Unique detail per planet */}
        {DetailComponent && <DetailComponent highlighted={highlighted} />}
        {/* Per-node light — brighter on hover */}
        <pointLight
          color={entry.glowHex}
          intensity={highlighted ? 1.8 : 1.0}
          distance={highlighted ? 8 : 6}
          decay={2}
        />
        {/* Label */}
        <group ref={textGroupRef}>
          <Billboard follow lockX={false} lockY={false} lockZ={false}>
            <Text
              position={[0, 0.65, 0]}
              fontSize={0.24}
              color={LABEL_COLOR}
              anchorX="center"
              anchorY="bottom"
              font={undefined}
              outlineWidth={0.015}
              outlineColor="#08081a"
            >
              {entry.name}
            </Text>
            {highlighted && (
              <Text
                position={[0, -0.55, 0]}
                fontSize={0.13}
                color={DESC_COLOR}
                anchorX="center"
                anchorY="top"
                maxWidth={2.2}
                textAlign="center"
                font={undefined}
                outlineWidth={0.008}
                outlineColor="#08081a"
              >
                {entry.description}
              </Text>
            )}
          </Billboard>
        </group>
      </group>
    </>
  );
}

// ── Main scene ───────────────────────────────────────────────────────────────

interface SceneProps {
  activeView: ConstellationId | null;
  onFocus: (id: ConstellationId | null) => void;
  onHoverChange?: (id: ConstellationId | null) => void;
  focusedId: ConstellationId | null;
}

function Scene({ activeView, onFocus, onHoverChange, focusedId }: SceneProps) {
  const [hovered, setHovered] = useState<ConstellationId | null>(null);

  // Intro animation progress — written to a ref to avoid per-frame React re-renders
  const introStartTime = useRef(performance.now());
  const introValuesRef = useRef<number[]>(CONSTELLATIONS.map(() => 0));
  const introCompleteRef = useRef(false);

  useFrame(() => {
    if (introCompleteRef.current) return;
    const elapsed = (performance.now() - introStartTime.current) / 1000;
    let allDone = true;
    for (let i = 0; i < CONSTELLATIONS.length; i++) {
      const delay = 0.3 + i * 0.12;
      const raw = Math.min(1, Math.max(0, (elapsed - delay) / 1.0));
      introValuesRef.current[i] = 1 - Math.pow(1 - raw, 4);
      if (introValuesRef.current[i] < 0.999) allDone = false;
    }
    if (allDone) introCompleteRef.current = true;
  });

  const handleHover = useCallback(
    (id: ConstellationId | null) => {
      setHovered(id);
      onHoverChange?.(id);
      document.body.style.cursor = id ? "pointer" : "auto";
    },
    [onHoverChange],
  );

  const handleClick = useCallback(
    (id: ConstellationId) => {
      onFocus(id);
    },
    [onFocus],
  );

  return (
    <>
      <IntroCamera />

      {/* Ambient */}
      <ambientLight intensity={0.12} color="#e8d5f5" />
      <pointLight position={[14, 12, 10]} intensity={0.5} color="#d946ef" />
      <pointLight position={[-12, -8, -14]} intensity={0.35} color="#6366f1" />
      <pointLight position={[0, -10, 0]} intensity={0.15} color="#4f46e5" />

      <fog attach="fog" args={["#06060e", 20, 45]} />

      {/* Nebula background particles */}
      <NebulaParticles />

      {/* Central star */}
      <LunaCore />

      {/* Orbit rings — highlight the hovered one */}
      {CONSTELLATIONS.map((entry) => (
        <OrbitRing
          key={entry.id}
          radius={entry.orbitRadius}
          introRef={introValuesRef}
          isHighlighted={hovered === entry.id || activeView === entry.id}
          glowHex={entry.glowHex}
        />
      ))}

      {/* Orbital trail particles */}
      {CONSTELLATIONS.map((entry, i) => (
        <OrbitalTrail
          key={entry.id}
          entry={entry}
          introRef={introValuesRef}
          idx={i}
        />
      ))}

      {/* Constellation nodes */}
      {CONSTELLATIONS.map((entry, i) => (
        <ConstellationNode
          key={entry.id}
          entry={entry}
          hovered={hovered}
          active={activeView}
          onHover={handleHover}
          onClick={handleClick}
          introRef={introValuesRef}
          idx={i}
        />
      ))}

      <CameraFocus focusedId={focusedId} introRef={introValuesRef} />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={true}
        minDistance={4}
        maxDistance={28}
        maxPolarAngle={Math.PI * 0.65}
        minPolarAngle={Math.PI * 0.25}
        autoRotate={focusedId === null}
        autoRotateSpeed={0.2}
        dampingFactor={0.05}
        enableDamping
        rotateSpeed={0.5}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />
    </>
  );
}

// ── Exported canvas wrapper ──────────────────────────────────────────────────

interface ConstellationAtlas3DProps {
  activeView: ConstellationId | null;
  onFocus?: (id: ConstellationId | null) => void;
  onHover?: (id: ConstellationId | null) => void;
}

export default function ConstellationAtlas3D({
  activeView,
  onFocus,
  onHover,
}: ConstellationAtlas3DProps) {
  const [focusedId, setFocusedId] = useState<ConstellationId | null>(null);

  const handleFocus = useCallback(
    (id: ConstellationId | null) => {
      setFocusedId(id);
      onFocus?.(id);
    },
    [onFocus],
  );

  const handleMiss = useCallback(() => {
    setFocusedId(null);
    onFocus?.(null);
    onHover?.(null);
  }, [onFocus, onHover]);

  return (
    <Canvas
      camera={{ position: [0, 22, 40], fov: 44 }}
      onPointerMissed={handleMiss}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        background: "transparent",
      }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      }}
      dpr={1}
      frameloop="always"
    >
      <Scene
        activeView={activeView}
        onFocus={handleFocus}
        onHoverChange={onHover}
        focusedId={focusedId}
      />
    </Canvas>
  );
}
