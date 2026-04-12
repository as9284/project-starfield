/**
 * ConstellationAtlas3D — WebGL solar-system scene for the constellation overlay.
 * Luna sits at the centre as a glowing gas-giant star; each constellation
 * orbits with unique visual personality.  Opening animation zooms in while
 * planets expand outward from the core with staggered timing.
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

// ── Reusable temp vectors (avoids per-frame allocation) ──────────────────────

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

// ── Smooth intro camera — zooms from far out to scene distance ───────────────

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
    progress.current = Math.min(1, progress.current + delta * 0.45);
    // Ease-out cubic
    const t = 1 - Math.pow(1 - progress.current, 3);
    camera.position.lerpVectors(startPos, endPos, t);
  });

  return null;
}

// ── Luna core — gas giant star with atmospheric bands & AI eye ───────────────

function LunaCore() {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const ray1Ref = useRef<THREE.Mesh>(null);
  const ray2Ref = useRef<THREE.Mesh>(null);
  const ray3Ref = useRef<THREE.Mesh>(null);
  const flare1Ref = useRef<THREE.Mesh>(null);
  const flare2Ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    if (coreRef.current) {
      coreRef.current.rotation.y = t * 0.06;
      const pulse = 1.0 + Math.sin(t * 1.8) * 0.03;
      coreRef.current.scale.setScalar(pulse);
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 3.0 + Math.sin(t * 2.2) * 0.8;
    }

    if (innerGlowRef.current) {
      const p = 1.0 + Math.sin(t * 1.2) * 0.06;
      innerGlowRef.current.scale.setScalar(p);
      innerGlowRef.current.rotation.y = -t * 0.03;
      const mat = innerGlowRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.22 + Math.sin(t * 1.5) * 0.06;
    }

    if (coronaRef.current) {
      const p2 = 1.0 + Math.sin(t * 0.5 + 1.0) * 0.08;
      coronaRef.current.scale.setScalar(p2);
      coronaRef.current.rotation.y = -t * 0.02;
    }

    if (haloRef.current) {
      haloRef.current.scale.setScalar(1.0 + Math.sin(t * 0.3) * 0.04);
    }

    if (ray1Ref.current) {
      ray1Ref.current.rotation.z = t * 0.015;
      const s = 1.0 + Math.sin(t * 1.0) * 0.1;
      ray1Ref.current.scale.set(s, 1, 1);
    }
    if (ray2Ref.current) {
      ray2Ref.current.rotation.z = t * 0.015 + Math.PI / 3;
      const s = 1.0 + Math.sin(t * 1.0 + 2) * 0.1;
      ray2Ref.current.scale.set(s, 1, 1);
    }
    if (ray3Ref.current) {
      ray3Ref.current.rotation.z = t * 0.015 - Math.PI / 3;
      const s = 1.0 + Math.sin(t * 1.0 + 4) * 0.1;
      ray3Ref.current.scale.set(s, 1, 1);
    }

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
    <group ref={groupRef}>
      {/* White-hot core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.55, 48, 48]} />
        <meshStandardMaterial
          color="#fff8e7"
          emissive="#ffd088"
          emissiveIntensity={3.0}
          roughness={0.0}
          metalness={1.0}
        />
      </mesh>

      {/* Inner glow — warm yellow orange shell */}
      <mesh ref={innerGlowRef}>
        <sphereGeometry args={[0.62, 48, 48]} />
        <meshStandardMaterial
          color="#ffb347"
          transparent
          opacity={0.22}
          emissive="#ff9f43"
          emissiveIntensity={1.2}
          roughness={0.2}
          metalness={0.3}
          side={THREE.FrontSide}
        />
      </mesh>

      {/* Corona rays — 6 pointed star shape using thin scaled boxes */}
      <group ref={ray1Ref}>
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
      <group ref={ray2Ref}>
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
      <group ref={ray3Ref}>
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

      {/* Solar prominences / flares */}
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
        <sphereGeometry args={[1.15, 28, 28]} />
        <meshStandardMaterial
          color="#ff9f43"
          transparent
          opacity={0.07}
          emissive="#ffd700"
          emissiveIntensity={0.8}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Outer halo — diffuse warm glow */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[1.8, 20, 20]} />
        <meshStandardMaterial
          color="#ffd700"
          transparent
          opacity={0.025}
          emissive="#ff8c00"
          emissiveIntensity={0.3}
          side={THREE.BackSide}
        />
      </mesh>

      {/* "Luna" label */}
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

      {/* Core star light — warm bright */}
      <pointLight color="#ffd088" intensity={10} distance={36} decay={2} />
      {/* Secondary warm fill */}
      <pointLight color="#ffb347" intensity={3} distance={22} decay={2} />
    </group>
  );
}

// ── Orbit ring ───────────────────────────────────────────────────────────────

interface OrbitRingProps {
  radius: number;
  /** 0→1 intro progress — ring fades/grows from center */
  introT: number;
}

function OrbitRing({ radius, introT }: OrbitRingProps) {
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
      ref.current.scale.setScalar(introT);
    }
  });

  return (
    <group ref={ref}>
      <Line
        points={points}
        color={RING_COLOR}
        transparent
        opacity={0.35 * introT}
        lineWidth={1.2}
      />
    </group>
  );
}

// ── Connector line from origin to node ───────────────────────────────────────

function ConnectorLine({
  groupRef,
}: {
  groupRef: React.RefObject<THREE.Group | null>;
}) {
  const lineRef = useRef<THREE.Line>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: LINE_COLOR,
        transparent: true,
        opacity: 0.3,
      }),
    [],
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

// ── Per-planet unique detail components ──────────────────────────────────────

/** Orbit — Saturn-like multi-ring system, structured and disciplined */
function OrbitDetail() {
  const innerRef = useRef<THREE.Mesh>(null);
  const midRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (innerRef.current) innerRef.current.rotation.z = t * 0.04;
    if (midRef.current) midRef.current.rotation.z = -t * 0.025;
    if (outerRef.current) outerRef.current.rotation.z = t * 0.015;
  });
  return (
    <>
      <mesh ref={innerRef} rotation={[0.55, 0.1, 0]}>
        <torusGeometry args={[0.42, 0.018, 12, 100]} />
        <meshStandardMaterial
          color="#a78bfa"
          emissive="#7c4ff0"
          emissiveIntensity={2.0}
          transparent
          opacity={0.7}
        />
      </mesh>
      <mesh ref={midRef} rotation={[0.55, 0.1, 0]}>
        <torusGeometry args={[0.52, 0.012, 10, 100]} />
        <meshStandardMaterial
          color="#c4b5fd"
          emissive="#a78bfa"
          emissiveIntensity={1.5}
          transparent
          opacity={0.45}
        />
      </mesh>
      <mesh ref={outerRef} rotation={[0.55, 0.1, 0]}>
        <torusGeometry args={[0.60, 0.007, 8, 100]} />
        <meshStandardMaterial
          color="#ddd6fe"
          emissive="#c4b5fd"
          emissiveIntensity={1.0}
          transparent
          opacity={0.3}
        />
      </mesh>
    </>
  );
}

/** Solaris — mini sun with warm corona and prominences */
function SolarisDetail() {
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
      flare1Ref.current.scale.setScalar(1.0 + Math.sin(t * 2.0) * 0.25);
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
          opacity={0.12}
          emissive="#ff6b35"
          emissiveIntensity={1.0}
          side={THREE.BackSide}
        />
      </mesh>
      <mesh ref={flare1Ref} rotation={[0, 0, 0.4]}>
        <torusGeometry args={[0.55, 0.02, 8, 24, Math.PI * 0.5]} />
        <meshStandardMaterial
          color="#ff6348"
          emissive="#ff4500"
          emissiveIntensity={2.5}
          transparent
          opacity={0.55}
        />
      </mesh>
      <mesh ref={flare2Ref} rotation={[0.3, 0, -0.5]}>
        <torusGeometry args={[0.60, 0.015, 8, 20, Math.PI * 0.35]} />
        <meshStandardMaterial
          color="#ffbe76"
          emissive="#ff9f43"
          emissiveIntensity={1.8}
          transparent
          opacity={0.4}
        />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.38, 16, 16]} />
        <meshStandardMaterial
          color="#feca57"
          transparent
          opacity={0.15}
          emissive="#ff9f43"
          emissiveIntensity={1.5}
          side={THREE.FrontSide}
        />
      </mesh>
    </>
  );
}

/** Beacon — scanning lighthouse with rotating sweep beam */
function BeaconDetail() {
  const sweepRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (sweepRef.current) {
      sweepRef.current.rotation.y = t * 0.8;
    }
    if (ringRef.current) {
      ringRef.current.rotation.y = -t * 0.3;
    }
    if (beamRef.current) {
      beamRef.current.rotation.y = t * 1.2;
    }
  });
  return (
    <>
      <mesh ref={sweepRef} rotation={[Math.PI * 0.5, 0, 0]}>
        <torusGeometry args={[0.40, 0.01, 8, 48, Math.PI * 0.7]} />
        <meshStandardMaterial
          color="#818cf8"
          emissive="#6366f1"
          emissiveIntensity={2.5}
          transparent
          opacity={0.7}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI * 0.45, 0.3, 0]}>
        <torusGeometry args={[0.50, 0.006, 8, 64]} />
        <meshStandardMaterial
          color="#a5b4fc"
          emissive="#818cf8"
          emissiveIntensity={1.5}
          transparent
          opacity={0.4}
        />
      </mesh>
      <group ref={beamRef}>
        <mesh position={[0, 0.55, 0.1]}>
          <boxGeometry args={[0.02, 0.5, 0.02]} />
          <meshStandardMaterial
            color="#e0e7ff"
            emissive="#c7d2fe"
            emissiveIntensity={3.0}
            transparent
            opacity={0.6}
          />
        </mesh>
      </group>
    </>
  );
}

/** Hyperlane — warp streaks with speed trails and energy ring */
function HyperlaneDetail() {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const trail1Ref = useRef<THREE.Mesh>(null);
  const trail2Ref = useRef<THREE.Mesh>(null);
  const trail3Ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ring1Ref.current) ring1Ref.current.rotation.y = t * 0.6;
    if (ring2Ref.current) ring2Ref.current.rotation.y = -t * 0.45;
    if (trail1Ref.current) {
      trail1Ref.current.rotation.y = t * 0.2;
      trail1Ref.current.scale.x = 1.0 + Math.sin(t * 3.0) * 0.15;
    }
    if (trail2Ref.current) {
      trail2Ref.current.rotation.y = t * 0.2 + Math.PI * 0.66;
      trail2Ref.current.scale.x = 1.0 + Math.sin(t * 2.7 + 2) * 0.12;
    }
    if (trail3Ref.current) {
      trail3Ref.current.rotation.y = t * 0.2 + Math.PI * 1.33;
      trail3Ref.current.scale.x = 1.0 + Math.sin(t * 2.4 + 4) * 0.1;
    }
  });
  return (
    <>
      <mesh ref={ring1Ref} rotation={[0.8, 0, 0.4]}>
        <torusGeometry args={[0.44, 0.007, 8, 64]} />
        <meshStandardMaterial
          color="#2dd4bf"
          emissive="#14b8a6"
          emissiveIntensity={2.5}
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh ref={ring2Ref} rotation={[1.2, 0.5, 0]}>
        <torusGeometry args={[0.38, 0.005, 8, 64]} />
        <meshStandardMaterial
          color="#5eead4"
          emissive="#14b8a6"
          emissiveIntensity={1.8}
          transparent
          opacity={0.4}
        />
      </mesh>
      <mesh ref={trail1Ref} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.6, 0.008, 0.008]} />
        <meshStandardMaterial
          color="#99f6e4"
          emissive="#2dd4bf"
          emissiveIntensity={3.0}
          transparent
          opacity={0.5}
        />
      </mesh>
      <mesh ref={trail2Ref} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.5, 0.008, 0.008]} />
        <meshStandardMaterial
          color="#99f6e4"
          emissive="#2dd4bf"
          emissiveIntensity={2.5}
          transparent
          opacity={0.35}
        />
      </mesh>
      <mesh ref={trail3Ref} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.45, 0.006, 0.006]} />
        <meshStandardMaterial
          color="#ccfbf1"
          emissive="#5eead4"
          emissiveIntensity={2.0}
          transparent
          opacity={0.25}
        />
      </mesh>
    </>
  );
}

/** Pulsar — pulsing energy arcs with periodic bright flash */
function PulsarDetail() {
  const arc1Ref = useRef<THREE.Mesh>(null);
  const arc2Ref = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const coreGlowRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = Math.abs(Math.sin(t * 2.5));
    if (arc1Ref.current) {
      const s = 0.7 + pulse * 0.5;
      arc1Ref.current.scale.setScalar(s);
      arc1Ref.current.rotation.z = t * 0.3;
    }
    if (arc2Ref.current) {
      const s2 = 0.7 + Math.abs(Math.sin(t * 2.5 + 1.5)) * 0.4;
      arc2Ref.current.scale.setScalar(s2);
      arc2Ref.current.rotation.z = -t * 0.25 + Math.PI * 0.5;
    }
    if (pulseRef.current) {
      const flash = pulse;
      pulseRef.current.scale.setScalar(0.3 + flash * 0.35);
      const mat = pulseRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.0 + flash * 4.0;
      mat.opacity = 0.15 + flash * 0.25;
    }
    if (coreGlowRef.current) {
      const glow = 0.6 + pulse * 0.4;
      coreGlowRef.current.scale.setScalar(glow);
    }
  });
  return (
    <>
      <mesh ref={arc1Ref} rotation={[Math.PI * 0.5, 0, 0]}>
        <torusGeometry args={[0.38, 0.015, 8, 32, Math.PI * 1.2]} />
        <meshStandardMaterial
          color="#c4b5fd"
          emissive="#9b78f8"
          emissiveIntensity={2.5}
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh ref={arc2Ref} rotation={[Math.PI * 0.4, 0.2, 0]}>
        <torusGeometry args={[0.32, 0.01, 8, 28, Math.PI * 0.8]} />
        <meshStandardMaterial
          color="#ddd6fe"
          emissive="#c4b5fd"
          emissiveIntensity={2.0}
          transparent
          opacity={0.45}
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
          emissiveIntensity={1.5}
          transparent
          opacity={0.4}
          wireframe
        />
      </mesh>
    </>
  );
}

const DETAIL_MAP: Record<ConstellationId, React.FC> = {
  orbit: OrbitDetail,
  solaris: SolarisDetail,
  beacon: BeaconDetail,
  hyperlane: HyperlaneDetail,
  pulsar: PulsarDetail,
};

// ── Camera focus — sticky + gentle ────────────────────────────────────────────

interface CameraFocusProps {
  focusedId: ConstellationId | null;
  introValues: number[];
}

function CameraFocus({ focusedId, introValues }: CameraFocusProps) {
  const { controls, camera } = useThree();
  const canControl = useRef(false);

  useFrame((state, delta) => {
    if (!controls) return;
    const ctrl = controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    };

    const introDone = introValues.every((v) => v >= 0.95);
    if (!canControl.current && introDone) canControl.current = true;

    if (focusedId !== null) {
      const idx = CONSTELLATIONS.findIndex((c) => c.id === focusedId);
      const entry = CONSTELLATIONS[idx];
      if (!entry) return;
      const introT = introValues[idx] ?? 1;
      const t = state.clock.getElapsedTime();
      const angle = t * entry.orbitSpeed * 0.1 + entry.orbitOffset;
      const r = entry.orbitRadius * introT;
      const px = Math.cos(angle) * r;
      const pz = Math.sin(angle) * r;

      _v3.set(px, 0, pz);
      ctrl.target.lerp(_v3, 1 - Math.pow(0.1, delta));

      if (canControl.current) {
        _v3.set(
          px + _focusOffset.x,
          _focusOffset.y,
          pz + _focusOffset.z,
        );
        camera.position.lerp(_v3, 1 - Math.pow(0.1, delta));
      }
    } else {
      ctrl.target.lerp(_origin, 1 - Math.pow(0.12, delta));

      if (canControl.current && camera.position.distanceTo(_defaultCamPos) > 0.5) {
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
  /** 0→1 intro animation progress for this node (staggered) */
  introT: number;
}

function ConstellationNode({
  entry,
  hovered,
  active,
  onHover,
  onClick,
  introT,
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
  const targetSphereScale = (highlighted ? 1.25 : 1.0) * ps;
  const targetGlowScale = (highlighted ? 1.4 : 1.0) * ps;
  const targetEmissive = highlighted ? 1.8 : 0.7;

  const DetailComponent = DETAIL_MAP[entry.id];

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();

    // Smooth orbit motion — introT scales the orbit radius from 0→full
    const currentRadius = entry.orbitRadius * introT;
    const angle = t * entry.orbitSpeed * 0.1 + entry.orbitOffset;
    const x = Math.cos(angle) * currentRadius;
    const z = Math.sin(angle) * currentRadius;
    const y = 0;

    if (groupRef.current) {
      _v3.set(x, y, z);
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
        ((highlighted ? 0.18 : 0.07) * introT - mat.opacity) * 0.08;
    }

    if (atmosphereRef.current) {
      const atmoScale = (highlighted ? 1.55 : 1.3) * introT * ps;
      _scale.setScalar(atmoScale);
      atmosphereRef.current.scale.lerp(_scale, 0.06);
      const mat = atmosphereRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity +=
        ((highlighted ? 0.08 : 0.03) * introT - mat.opacity) * 0.06;
    }

    if (textGroupRef.current) {
      const textScale = (highlighted ? 1.3 : 1.0) * Math.max(ps, 0.9) * introT;
      _scale.setScalar(textScale);
      textGroupRef.current.scale.lerp(_scale, 0.1);
    }
  });

  return (
    <>
      <ConnectorLine groupRef={groupRef} />
      <group ref={groupRef}>
        {/* Node sphere */}
        <mesh
          ref={sphereRef}
          onPointerOver={() => onHover(entry.id)}
          onPointerOut={() => onHover(null)}
          onClick={() => onClick(entry.id)}
        >
          <sphereGeometry args={[0.3, 36, 36]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.7}
            roughness={0.15}
            metalness={0.85}
          />
        </mesh>
        {/* Inner glow shell */}
        <mesh ref={glowRef}>
          <sphereGeometry args={[0.44, 24, 24]} />
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
          <sphereGeometry args={[0.58, 20, 20]} />
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
        {DetailComponent && <DetailComponent />}
        {/* Per-node light */}
        <pointLight
          color={entry.glowHex}
          intensity={1.0}
          distance={6}
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
  onSelect: (id: ConstellationId) => void;
  focusedId: ConstellationId | null;
  setFocusedId: React.Dispatch<React.SetStateAction<ConstellationId | null>>;
}

function Scene({ activeView, onSelect, focusedId, setFocusedId }: SceneProps) {
  const [hovered, setHovered] = useState<ConstellationId | null>(null);

  // Intro animation progress — one value per node, staggered
  const introStartTime = useRef(performance.now());
  const [introValues, setIntroValues] = useState<number[]>(() =>
    CONSTELLATIONS.map(() => 0),
  );

  useFrame(() => {
    const elapsed = (performance.now() - introStartTime.current) / 1000;
    let anyChanged = false;
    const next = CONSTELLATIONS.map((_, i) => {
      // Stagger: each planet starts 0.15s after the previous
      const delay = 0.3 + i * 0.15;
      const raw = Math.min(1, Math.max(0, (elapsed - delay) / 1.0));
      // Ease-out quart
      const t = 1 - Math.pow(1 - raw, 4);
      if (t !== introValues[i]) anyChanged = true;
      return t;
    });
    if (anyChanged) setIntroValues(next);
  });

  // Global intro progress for orbit rings (fastest node)
  const ringIntro = Math.max(...introValues, 0);

  // Hovering a planet makes it focused (zoom in); clicking empty space unfocuses (zoom out)
  const handleHover = useCallback((id: ConstellationId | null) => {
    setHovered(id);
    if (id !== null) setFocusedId(id);
    document.body.style.cursor = id ? "pointer" : "auto";
  }, []);

  const handleClick = useCallback(
    (id: ConstellationId) => {
      onSelect(id);
    },
    [onSelect],
  );

  return (
    <>
      {/* Intro camera zoom */}
      <IntroCamera />

      {/* Ambient fill */}
      <ambientLight intensity={0.15} color="#e8d5f5" />
      {/* Key lights */}
      <pointLight position={[14, 12, 10]} intensity={0.45} color="#d946ef" />
      <pointLight position={[-12, -8, -14]} intensity={0.3} color="#6366f1" />
      <pointLight position={[0, -10, 0]} intensity={0.15} color="#4f46e5" />

      {/* Fog — pushed far enough so the outer ring (r=7.8) is fully visible */}
      <fog attach="fog" args={["#06060e", 18, 42]} />

      {/* Central star: Luna */}
      <LunaCore />

      {/* Orbit rings */}
      {CONSTELLATIONS.map((entry) => (
        <OrbitRing
          key={entry.id}
          radius={entry.orbitRadius}
          introT={ringIntro}
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
          introT={introValues[i] ?? 0}
        />
      ))}

      {/* Camera focus — lerps OrbitControls target toward the focused planet */}
      <CameraFocus focusedId={focusedId} introValues={introValues} />

      {/* Camera controls — rotate with right-click, left-click reserved for focus */}
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
          LEFT: undefined as unknown as THREE.MOUSE,
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
  onSelect: (id: ConstellationId) => void;
}

export default function ConstellationAtlas3D({
  activeView,
  onSelect,
}: ConstellationAtlas3DProps) {
  const [focusedId, setFocusedId] = useState<ConstellationId | null>(null);

  const handleMiss = useCallback(() => {
    setFocusedId(null);
  }, []);

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
      dpr={[1, 1.5]}
      frameloop="always"
    >
      <Scene
        activeView={activeView}
        onSelect={onSelect}
        focusedId={focusedId}
        setFocusedId={setFocusedId}
      />
    </Canvas>
  );
}
