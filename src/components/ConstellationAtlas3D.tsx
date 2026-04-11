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
  const bandsRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const eyeRingRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Core: slow tumble
    if (coreRef.current) {
      coreRef.current.rotation.y = t * 0.08;
      coreRef.current.rotation.x = Math.sin(t * 0.04) * 0.06;
    }
    // Atmospheric bands: counter-rotate for depth
    if (bandsRef.current) {
      bandsRef.current.rotation.y = -t * 0.05;
      bandsRef.current.rotation.z = 0.15;
    }
    // Mid glow shell: breathe
    if (glowRef.current) {
      const pulse = 1.0 + Math.sin(t * 0.7) * 0.05;
      glowRef.current.scale.setScalar(pulse);
    }
    // Corona: slow drift
    if (coronaRef.current) {
      const p2 = 1.0 + Math.sin(t * 0.4 + 1.2) * 0.07;
      coronaRef.current.scale.setScalar(p2);
      coronaRef.current.rotation.y = -t * 0.025;
    }
    // Halo: subtle throb
    if (haloRef.current) {
      haloRef.current.scale.setScalar(1.0 + Math.sin(t * 0.25) * 0.04);
    }
    // Eye ring: gentle wobble
    if (eyeRingRef.current) {
      eyeRingRef.current.rotation.x = Math.PI * 0.5 + Math.sin(t * 0.3) * 0.08;
      eyeRingRef.current.rotation.z = t * 0.06;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Deep core — bright inner surface */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.55, 48, 48]} />
        <meshStandardMaterial
          color="#5a30d0"
          emissive="#9060ff"
          emissiveIntensity={2.0}
          roughness={0.1}
          metalness={0.9}
        />
      </mesh>

      {/* Atmospheric bands — translucent shell with banding effect */}
      <mesh ref={bandsRef}>
        <sphereGeometry args={[0.62, 48, 48]} />
        <meshStandardMaterial
          color="#7c4ff0"
          transparent
          opacity={0.25}
          emissive="#a78bfa"
          emissiveIntensity={0.8}
          roughness={0.3}
          metalness={0.6}
          wireframe={false}
        />
      </mesh>

      {/* AI "eye" ring — a thin torus orbiting the globe */}
      <mesh ref={eyeRingRef}>
        <torusGeometry args={[0.78, 0.015, 16, 100]} />
        <meshStandardMaterial
          color="#c4b5fd"
          emissive="#c4b5fd"
          emissiveIntensity={2.5}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Secondary eye ring — perpendicular */}
      <mesh rotation={[0, Math.PI * 0.5, Math.PI * 0.3]}>
        <torusGeometry args={[0.85, 0.01, 16, 100]} />
        <meshStandardMaterial
          color="#a78bfa"
          emissive="#a78bfa"
          emissiveIntensity={1.8}
          transparent
          opacity={0.4}
        />
      </mesh>

      {/* Mid glow shell */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.82, 32, 32]} />
        <meshStandardMaterial
          color="#7c4ff0"
          transparent
          opacity={0.1}
          emissive="#9060ff"
          emissiveIntensity={1.0}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Corona — slow-rotating atmosphere */}
      <mesh ref={coronaRef}>
        <sphereGeometry args={[1.15, 28, 28]} />
        <meshStandardMaterial
          color="#8b5cf6"
          transparent
          opacity={0.05}
          emissive="#a78bfa"
          emissiveIntensity={0.6}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Outer halo — wide diffuse glow */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[1.7, 20, 20]} />
        <meshStandardMaterial
          color="#7c4ff0"
          transparent
          opacity={0.02}
          emissive="#7c4ff0"
          emissiveIntensity={0.25}
          side={THREE.BackSide}
        />
      </mesh>

      {/* "Luna" label */}
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, 1.1, 0]}
          fontSize={0.22}
          color="#c4b5fd"
          anchorX="center"
          anchorY="bottom"
          font={undefined}
          outlineWidth={0.012}
          outlineColor="#08081a"
        >
          Luna
        </Text>
      </Billboard>

      {/* Core light — strong */}
      <pointLight color="#9060ff" intensity={8} distance={32} decay={2} />
      {/* Warm secondary */}
      <pointLight color="#c084fc" intensity={2.5} distance={20} decay={2} />
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

/** Orbit — Saturn-like tilted ring */
function OrbitDetail() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = clock.getElapsedTime() * 0.04;
  });
  return (
    <mesh ref={ref} rotation={[0.6, 0, 0.2]}>
      <torusGeometry args={[0.48, 0.012, 12, 80]} />
      <meshStandardMaterial
        color="#7c4ff0"
        emissive="#7c4ff0"
        emissiveIntensity={1.5}
        transparent
        opacity={0.55}
      />
    </mesh>
  );
}

/** Solaris — animated solar flare wisps */
function SolarisDetail() {
  const ref1 = useRef<THREE.Mesh>(null);
  const ref2 = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref1.current) {
      const s = 1.0 + Math.sin(t * 1.5) * 0.3;
      ref1.current.scale.set(s, s * 0.6, s);
      ref1.current.rotation.z = t * 0.2;
    }
    if (ref2.current) {
      const s = 1.0 + Math.sin(t * 1.2 + 2) * 0.25;
      ref2.current.scale.set(s * 0.7, s, s * 0.7);
      ref2.current.rotation.z = -t * 0.15;
    }
  });
  return (
    <>
      <mesh ref={ref1} position={[0.2, 0.25, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial
          color="#f472b6"
          emissive="#d946ef"
          emissiveIntensity={2.5}
          transparent
          opacity={0.35}
        />
      </mesh>
      <mesh ref={ref2} position={[-0.15, -0.2, 0.1]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial
          color="#e879f9"
          emissive="#d946ef"
          emissiveIntensity={2.0}
          transparent
          opacity={0.25}
        />
      </mesh>
    </>
  );
}

/** Beacon — scanning sweep ring */
function BeaconDetail() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.getElapsedTime() * 0.8;
    }
  });
  return (
    <mesh ref={ref} rotation={[Math.PI * 0.5, 0, 0]}>
      <torusGeometry args={[0.42, 0.008, 8, 32, Math.PI * 0.7]} />
      <meshStandardMaterial
        color="#818cf8"
        emissive="#6366f1"
        emissiveIntensity={2.0}
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}

/** Hyperlane — warp streaks (two tilted rings) */
function HyperlaneDetail() {
  const ref1 = useRef<THREE.Mesh>(null);
  const ref2 = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref1.current) ref1.current.rotation.y = t * 0.5;
    if (ref2.current) ref2.current.rotation.y = -t * 0.4;
  });
  return (
    <>
      <mesh ref={ref1} rotation={[0.8, 0, 0.4]}>
        <torusGeometry args={[0.44, 0.006, 8, 48]} />
        <meshStandardMaterial
          color="#2dd4bf"
          emissive="#14b8a6"
          emissiveIntensity={2.0}
          transparent
          opacity={0.5}
        />
      </mesh>
      <mesh ref={ref2} rotation={[1.2, 0.5, 0]}>
        <torusGeometry args={[0.4, 0.006, 8, 48]} />
        <meshStandardMaterial
          color="#5eead4"
          emissive="#14b8a6"
          emissiveIntensity={1.5}
          transparent
          opacity={0.35}
        />
      </mesh>
    </>
  );
}

/** Pulsar — pulsing energy arcs */
function PulsarDetail() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) {
      const s = 0.8 + Math.sin(t * 2.5) * 0.4;
      ref.current.scale.setScalar(s);
      ref.current.rotation.z = t * 0.3;
    }
  });
  return (
    <mesh ref={ref} rotation={[Math.PI * 0.5, 0, 0]}>
      <torusGeometry args={[0.38, 0.015, 8, 32, Math.PI * 1.2]} />
      <meshStandardMaterial
        color="#c4b5fd"
        emissive="#9b78f8"
        emissiveIntensity={2.5}
        transparent
        opacity={0.5}
      />
    </mesh>
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
  const { controls } = useThree();

  useFrame((state, delta) => {
    if (!controls) return;
    const ctrl = controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    };

    if (focusedId !== null) {
      const idx = CONSTELLATIONS.findIndex((c) => c.id === focusedId);
      const entry = CONSTELLATIONS[idx];
      if (!entry) return;
      const introT = introValues[idx] ?? 1;
      const t = state.clock.getElapsedTime();
      const angle = t * entry.orbitSpeed * 0.1 + entry.orbitOffset;
      const r = entry.orbitRadius * introT;
      const tilt = entry.orbitTilt;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y =
        Math.sin(angle) * r * Math.sin(tilt) +
        Math.sin(t * 0.25 + entry.orbitOffset) * 0.35 * introT;
      _v3.set(x, y, z);
      // Gentle follow — low lerp factor so the camera glides
      ctrl.target.lerp(_v3, 1 - Math.pow(0.12, delta));
    } else {
      // Drift back to centre slowly
      ctrl.target.lerp(_origin, 1 - Math.pow(0.35, delta));
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
    const tilt = entry.orbitTilt;
    const x = Math.cos(angle) * currentRadius;
    const z = Math.sin(angle) * currentRadius;
    const y =
      Math.sin(angle) * currentRadius * Math.sin(tilt) +
      Math.sin(t * 0.25 + entry.orbitOffset) * 0.35 * introT;

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
}

function Scene({ activeView, onSelect }: SceneProps) {
  const [hovered, setHovered] = useState<ConstellationId | null>(null);
  const [focusedId, setFocusedId] = useState<ConstellationId | null>(null);

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

  // Hovering a planet makes it sticky-focused; clicking empty space unfocuses
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

  // Click on empty space (missed all planets) → clear focus
  const handleMiss = useCallback(() => {
    setFocusedId(null);
  }, []);

  // Left-drag on empty space also clears focus (pointerDown tracks intent)
  const dragging = useRef(false);
  const handlePointerDown = useCallback(
    (e: THREE.Event<PointerEvent>) => {
      if ((e as unknown as PointerEvent).button === 0 && focusedId !== null) {
        dragging.current = true;
      }
    },
    [focusedId],
  );
  const handlePointerMove = useCallback(() => {
    if (dragging.current) {
      dragging.current = false;
      setFocusedId(null);
    }
  }, []);

  const radii = useMemo(
    () => [...new Set(CONSTELLATIONS.map((c) => c.orbitRadius))],
    [],
  );

  return (
    <>
      {/* Intro camera zoom */}
      <IntroCamera />

      {/* Ambient fill */}
      <ambientLight intensity={0.18} color="#bba9fb" />
      {/* Key lights */}
      <pointLight position={[14, 12, 10]} intensity={0.55} color="#d946ef" />
      <pointLight position={[-12, -8, -14]} intensity={0.35} color="#6366f1" />
      <pointLight position={[0, -10, 0]} intensity={0.18} color="#4f46e5" />

      {/* Fog — pushed far enough so the outer ring (r=7.8) is fully visible */}
      <fog attach="fog" args={["#06060e", 18, 42]} />

      {/* Central star: Luna */}
      <LunaCore />

      {/* Orbit rings */}
      {radii.map((r) => (
        <OrbitRing key={r} radius={r} introT={ringIntro} />
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

      {/* Click-miss clears focus; left-drag on empty space also re-centers */}
      <mesh
        visible={false}
        onPointerMissed={handleMiss}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <planeGeometry args={[200, 200]} />
      </mesh>

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
  return (
    <Canvas
      camera={{ position: [0, 22, 40], fov: 44 }}
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
      <Scene activeView={activeView} onSelect={onSelect} />
    </Canvas>
  );
}
