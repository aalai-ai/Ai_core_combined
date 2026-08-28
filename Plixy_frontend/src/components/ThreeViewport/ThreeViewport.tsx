import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ThreeViewportProps {
  meshUrl?: string;
  zipBundleUrl?: string;
  meshId?: string;
  verticesCount?: number;
  facesCount?: number;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  meshUrl = "http://192.168.10.10:5200/assets/sample_device_mesh.glb",
  zipBundleUrl = "http://192.168.10.10:5200/assets/sample_device_mesh_bundle.zip",
  meshId = "mesh_em6436h_v1",
  verticesCount = 18450,
  facesCount = 35200,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isWireframe, setIsWireframe] = useState(false);
  const [viewPreset, setViewPreset] = useState<'3d' | 'front' | 'rear' | 'top'>('3d');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // References for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const loadedModelRef = useRef<THREE.Group | THREE.Object3D | null>(null);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0e11');
    sceneRef.current = scene;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(3.5, 2.5, 4.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // 4. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x6366f1, 1.2);
    dirLight1.position.set(5, 8, 5);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x10b981, 0.8);
    dirLight2.position.set(-5, -3, -4);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 1.5, 10);
    pointLight.position.set(0, 3, 2);
    scene.add(pointLight);

    // 5. Grid Helper & Base Pedestal
    const gridHelper = new THREE.GridHelper(10, 20, 0x6366f1, 0x27272a);
    gridHelper.position.y = -1.2;
    scene.add(gridHelper);

    // 6. Mouse Drag Rotation Logic
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !loadedModelRef.current) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      loadedModelRef.current.rotation.y += deltaX * 0.01;
      loadedModelRef.current.rotation.x += deltaY * 0.01;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (!cameraRef.current) return;
      cameraRef.current.position.z += e.deltaY * 0.005;
      cameraRef.current.position.z = Math.max(2, Math.min(12, cameraRef.current.position.z));
    };

    const canvasElement = canvasRef.current;
    canvasElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvasElement.addEventListener('wheel', onWheel);

    // 7. Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (loadedModelRef.current && !isDragging) {
        loadedModelRef.current.rotation.y += 0.003; // Gentle auto-rotate
      }
      renderer.render(scene, camera);
    };
    animate();

    // 8. Resize Listener
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvasElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvasElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // 9. Dynamic Model Loader
  useEffect(() => {
    if (!sceneRef.current) return;

    let active = true;

    // Remove existing model if any
    if (loadedModelRef.current) {
      sceneRef.current.remove(loadedModelRef.current);
      loadedModelRef.current = null;
    }

    setIsLoading(true);
    setLoadError(null);

    const loader = new GLTFLoader();
    loader.load(
      meshUrl,
      (gltf) => {
        if (!active) return;
        setIsLoading(false);
        const model = gltf.scene;

        // Apply wireframe configuration
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.material) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat) => {
                if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
                  mat.wireframe = isWireframe;
                }
              });
            }
          }
        });

        // Center model and add to scene
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center); // Center at (0, 0, 0)
        
        loadedModelRef.current = model;
        sceneRef.current?.add(model);
      },
      undefined, // onProgress
      (error) => {
        if (!active) return;
        console.warn("Could not load GLTF model from backend:", error);
        setIsLoading(false);
        setLoadError("❌ Failed to load the generated 3D model. Please verify that the backend engine is running and CORS is enabled.");
      }
    );

    return () => {
      active = false;
    };
  }, [meshUrl, isWireframe]);

  // Handle Floating View Preset Button Clicks
  const handleViewPreset = (preset: '3d' | 'front' | 'rear' | 'top') => {
    setViewPreset(preset);
    if (!cameraRef.current || !loadedModelRef.current) return;

    loadedModelRef.current.rotation.set(0, 0, 0);

    if (preset === '3d') {
      cameraRef.current.position.set(3.5, 2.5, 4.5);
    } else if (preset === 'front') {
      cameraRef.current.position.set(0, 0, 5.5);
    } else if (preset === 'rear') {
      cameraRef.current.position.set(0, 0, -5.5);
      loadedModelRef.current.rotation.y = Math.PI;
    } else if (preset === 'top') {
      cameraRef.current.position.set(0, 5.5, 0.1);
    }
    cameraRef.current.lookAt(0, 0, 0);
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#101114',
        borderRadius: '16px',
        border: '1px solid #27272a',
        overflow: 'hidden',
        color: '#fafafa',
        position: 'relative',
      }}
    >
      {/* Viewport Header Control Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          backgroundColor: '#18181b',
          borderBottom: '1px solid #27272a',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8' }}>📐 3D WebGL Canvas</span>
          <span style={{ fontSize: '12px', color: '#a1a1aa', background: '#27272a', padding: '2px 8px', borderRadius: '6px' }}>
            {meshId}
          </span>
          <span style={{ fontSize: '11px', color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            Vertices: {verticesCount.toLocaleString()} | Polygons: {facesCount.toLocaleString()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsWireframe(!isWireframe)}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: isWireframe ? '#6366f1' : '#27272a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {isWireframe ? '🌐 Solid View' : '🕸️ Wireframe'}
          </button>

          <a
            href={zipBundleUrl}
            download
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              backgroundColor: '#10b981',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
            }}
            title="Download .GLB, .OBJ, and .STL 3D formats in 1-click ZIP bundle"
          >
            📦 Download 3D Bundle (.ZIP)
          </a>
        </div>
      </div>

      {/* Real Three.js WebGL Canvas Mount */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

        {/* Loading / Error States Overlay */}
        {(isLoading || loadError) && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(13, 14, 17, 0.7)',
            zIndex: 5,
            flexDirection: 'column',
            gap: '12px',
            pointerEvents: 'none'
          }}>
            {isLoading && (
              <>
                <div style={{ width: '32px', height: '32px', border: '4px solid #27272a', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '13px', color: '#a1a1aa', fontWeight: 600 }}>Loading 3D Mesh Geometry...</span>
              </>
            )}
            {!isLoading && loadError && (
              <span style={{ fontSize: '11px', color: '#a1a1aa', background: 'rgba(24, 24, 27, 0.85)', padding: '6px 12px', borderRadius: '6px', border: '1px solid #27272a' }}>{loadError}</span>
            )}
          </div>
        )}

        {/* Dynamic Controls Hint */}
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '16px',
          fontSize: '11px',
          color: '#71717a',
          background: 'rgba(24, 24, 27, 0.6)',
          backdropFilter: 'blur(4px)',
          padding: '4px 10px',
          borderRadius: '6px',
          border: '1px solid rgba(39, 39, 42, 0.5)',
          zIndex: 10
        }}>
          💡 <b>Drag</b> to rotate 360° | <b>Scroll</b> to zoom
        </div>

        {/* Floating View Presets */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            display: 'flex',
            gap: '6px',
            background: 'rgba(24, 24, 27, 0.85)',
            backdropFilter: 'blur(8px)',
            padding: '4px',
            borderRadius: '8px',
            border: '1px solid #27272a',
            zIndex: 10,
          }}
        >
          {(['3d', 'front', 'rear', 'top'] as const).map((preset) => (
            <button
              key={preset}
              onClick={() => handleViewPreset(preset)}
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: viewPreset === preset ? '#6366f1' : 'transparent',
                color: viewPreset === preset ? '#ffffff' : '#a1a1aa',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                transition: 'all 0.2s ease',
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ThreeViewport;
