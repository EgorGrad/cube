import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Цвета граней кубика Рубика
const FACE_COLORS = {
  right: 0xff0000,   // красный
  left: 0xff8c00,    // оранжевый
  top: 0xffffff,     // белый
  bottom: 0xffff00,  // жёлтый
  front: 0x00ff00,   // зелёный
  back: 0x0000ff,    // синий
  inner: 0x1a1a1a,   // тёмный (внутренние стороны)
};

interface Cubie {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
}

function createRoundedBoxGeometry(width: number, height: number, depth: number, radius: number, segments: number) {
  const shape = new THREE.Shape();
  const eps = 0.00001;
  const r = radius - eps;
  const halfW = width / 2 - radius;
  const halfH = height / 2 - radius;

  shape.absarc(halfW, halfH, r, 0, Math.PI / 2, false);
  shape.absarc(-halfW, halfH, r, Math.PI / 2, Math.PI, false);
  shape.absarc(-halfW, -halfH, r, Math.PI, Math.PI * 1.5, false);
  shape.absarc(halfW, -halfH, r, Math.PI * 1.5, Math.PI * 2, false);

  const extrudeSettings = {
    depth: depth - radius * 2,
    bevelEnabled: true,
    bevelSegments: segments,
    steps: 1,
    bevelSize: radius - eps,
    bevelThickness: radius,
    curveSegments: segments,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  return geo;
}

function createCubieMaterials(x: number, y: number, z: number): THREE.MeshStandardMaterial[] {
  const gap = 0.02;
  const size = 0.95;

  const getColor = (face: keyof typeof FACE_COLORS) => {
    return new THREE.MeshStandardMaterial({
      color: FACE_COLORS[face],
      roughness: 0.3,
      metalness: 0.1,
    });
  };

  const inner = new THREE.MeshStandardMaterial({
    color: FACE_COLORS.inner,
    roughness: 0.8,
    metalness: 0.1,
  });

  // Порядок граней в Three.js BoxGeometry: +x, -x, +y, -y, +z, -z
  const rightFace = x >= 0.5 ? getColor('right') : inner;
  const leftFace = x <= -0.5 ? getColor('left') : inner;
  const topFace = y >= 0.5 ? getColor('top') : inner;
  const bottomFace = y <= -0.5 ? getColor('bottom') : inner;
  const frontFace = z >= 0.5 ? getColor('front') : inner;
  const backFace = z <= -0.5 ? getColor('back') : inner;

  return [rightFace, leftFace, topFace, bottomFace, frontFace, backFace];
}

export default function RubiksCube() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cubiesRef = useRef<Cubie[]>([]);
  const animatingRef = useRef(false);
  const frameIdRef = useRef<number>(0);

  const createCube = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Удаляем старые кубики
    cubiesRef.current.forEach(c => {
      scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      if (Array.isArray(c.mesh.material)) {
        c.mesh.material.forEach(m => m.dispose());
      }
    });
    cubiesRef.current = [];

    // Создаём 8 кубиков (2x2x2)
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const posX = x - 0.5;
          const posY = y - 0.5;
          const posZ = z - 0.5;

          const materials = createCubieMaterials(posX, posY, posZ);
          const geometry = createRoundedBoxGeometry(0.95, 0.95, 0.95, 0.08, 3);
          const mesh = new THREE.Mesh(geometry, materials);
          mesh.position.set(posX, posY, posZ);
          mesh.castShadow = true;
          mesh.receiveShadow = true;

          scene.add(mesh);
          cubiesRef.current.push({
            mesh,
            position: new THREE.Vector3(posX, posY, posZ),
          });
        }
      }
    }
  }, []);

  const rotateFace = useCallback((axis: 'x' | 'y' | 'z', layer: number, angle: number) => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    const scene = sceneRef.current;
    if (!scene) return;

    // Находим кубики в нужном слое
    const layerCubies: Cubie[] = [];
    const tolerance = 0.1;

    cubiesRef.current.forEach(cubie => {
      const pos = new THREE.Vector3();
      cubie.mesh.getWorldPosition(pos);
      const val = axis === 'x' ? pos.x : axis === 'y' ? pos.y : pos.z;
      if (Math.abs(val - layer) < tolerance) {
        layerCubies.push(cubie);
      }
    });

    // Создаём pivot для вращения
    const pivot = new THREE.Group();
    scene.add(pivot);

    layerCubies.forEach(cubie => {
      pivot.attach(cubie.mesh);
    });

    // Анимация вращения
    const duration = 300;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Easing
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const currentAngle = angle * eased;
      if (axis === 'x') pivot.rotation.x = currentAngle;
      else if (axis === 'y') pivot.rotation.y = currentAngle;
      else pivot.rotation.z = currentAngle;

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // Завершение - detach обратно в сцену
        layerCubies.forEach(cubie => {
          scene.attach(cubie.mesh);
        });
        scene.remove(pivot);
        animatingRef.current = false;
      }
    };

    requestAnimationFrame(animate);
  }, []);

  const scramble = useCallback(() => {
    if (animatingRef.current) return;

    const moves = [
      { axis: 'x' as const, layer: 0.5, angle: Math.PI / 2 },
      { axis: 'x' as const, layer: 0.5, angle: -Math.PI / 2 },
      { axis: 'y' as const, layer: 0.5, angle: Math.PI / 2 },
      { axis: 'y' as const, layer: 0.5, angle: -Math.PI / 2 },
      { axis: 'z' as const, layer: 0.5, angle: Math.PI / 2 },
      { axis: 'z' as const, layer: 0.5, angle: -Math.PI / 2 },
      { axis: 'x' as const, layer: -0.5, angle: Math.PI / 2 },
      { axis: 'x' as const, layer: -0.5, angle: -Math.PI / 2 },
      { axis: 'y' as const, layer: -0.5, angle: Math.PI / 2 },
      { axis: 'y' as const, layer: -0.5, angle: -Math.PI / 2 },
      { axis: 'z' as const, layer: -0.5, angle: Math.PI / 2 },
      { axis: 'z' as const, layer: -0.5, angle: -Math.PI / 2 },
    ];

    let moveIndex = 0;
    const numMoves = 10 + Math.floor(Math.random() * 10);

    const doNextMove = () => {
      if (moveIndex >= numMoves) return;

      const move = moves[Math.floor(Math.random() * moves.length)];
      const originalCallback = animatingRef.current;

      // Ждём завершения анимации
      const checkDone = () => {
        if (!animatingRef.current) {
          moveIndex++;
          doNextMove();
        } else {
          requestAnimationFrame(checkDone);
        }
      };

      rotateFace(move.axis, move.layer, move.angle);
      requestAnimationFrame(checkDone);
    };

    doNextMove();
  }, [rotateFace]);

  const reset = useCallback(() => {
    if (animatingRef.current) return;
    createCube();
  }, [createCube]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Setup scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      100
    );
    camera.position.set(3, 3, 3);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 10;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-5, -5, -5);
    scene.add(directionalLight2);

    // Create cube
    createCube();

    // Animation loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [createCube]);

  return (
    <div className="flex flex-col items-center w-full h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Header */}
      <div className="text-center pt-6 pb-4">
        <h1 className="text-4xl font-bold text-white mb-2">
          🎲 Кубик Рубика 2×2
        </h1>
        <p className="text-gray-300 text-sm">
          Перетаскивайте мышью для вращения камеры • Используйте кнопки для вращения граней
        </p>
      </div>

      {/* 3D Canvas */}
      <div
        ref={containerRef}
        className="flex-1 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl border border-white/10"
        style={{ minHeight: '400px' }}
      />

      {/* Controls */}
      <div className="pb-6 pt-4 flex flex-col items-center gap-4">
        {/* Face rotation buttons */}
        <div className="flex flex-wrap justify-center gap-2 max-w-lg">
          <span className="text-white text-sm w-full text-center mb-1 font-medium">Вращение граней:</span>

          <button
            onClick={() => rotateFace('x', 0.5, Math.PI / 2)}
            className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            R (правая ↻)
          </button>
          <button
            onClick={() => rotateFace('x', 0.5, -Math.PI / 2)}
            className="px-3 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            R' (правая ↺)
          </button>
          <button
            onClick={() => rotateFace('x', -0.5, Math.PI / 2)}
            className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            L (левая ↻)
          </button>
          <button
            onClick={() => rotateFace('x', -0.5, -Math.PI / 2)}
            className="px-3 py-2 bg-orange-800 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            L' (левая ↺)
          </button>
          <button
            onClick={() => rotateFace('y', 0.5, Math.PI / 2)}
            className="px-3 py-2 bg-gray-200 hover:bg-gray-100 text-gray-800 rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            U (верх ↻)
          </button>
          <button
            onClick={() => rotateFace('y', 0.5, -Math.PI / 2)}
            className="px-3 py-2 bg-gray-400 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            U' (верх ↺)
          </button>
          <button
            onClick={() => rotateFace('y', -0.5, Math.PI / 2)}
            className="px-3 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-800 rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            D (низ ↻)
          </button>
          <button
            onClick={() => rotateFace('y', -0.5, -Math.PI / 2)}
            className="px-3 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            D' (низ ↺)
          </button>
          <button
            onClick={() => rotateFace('z', 0.5, Math.PI / 2)}
            className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            F (перед ↻)
          </button>
          <button
            onClick={() => rotateFace('z', 0.5, -Math.PI / 2)}
            className="px-3 py-2 bg-green-800 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            F' (перед ↺)
          </button>
          <button
            onClick={() => rotateFace('z', -0.5, Math.PI / 2)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            B (зад ↻)
          </button>
          <button
            onClick={() => rotateFace('z', -0.5, -Math.PI / 2)}
            className="px-3 py-2 bg-blue-800 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-lg"
          >
            B' (зад ↺)
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={scramble}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl text-base font-bold transition-all hover:scale-105 shadow-lg"
          >
            🔀 Перемешать
          </button>
          <button
            onClick={reset}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-base font-bold transition-all hover:scale-105 shadow-lg"
          >
            🔄 Сбросить
          </button>
        </div>
      </div>
    </div>
  );
}
