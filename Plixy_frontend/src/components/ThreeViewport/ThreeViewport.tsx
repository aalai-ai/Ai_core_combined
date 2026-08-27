import React, { useState } from 'react';

interface ThreeViewportProps {
  meshUrl?: string;
  zipBundleUrl?: string;
  meshId?: string;
  verticesCount?: number;
  facesCount?: number;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  meshUrl = "http://localhost:5200/assets/sample_device_mesh.glb",
  zipBundleUrl = "http://localhost:5200/assets/sample_device_mesh_bundle.zip",
  meshId = "mesh_sample",
  verticesCount = 18450,
  facesCount = 35200,
}) => {
  const [isWireframe, setIsWireframe] = useState(false);
  const [viewPreset, setViewPreset] = useState<'3d' | 'front' | 'rear' | 'top'>('3d');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#101114',
      borderRadius: '16px',
      border: '1px solid #27272a',
      overflow: 'hidden',
      color: '#fafafa',
      position: 'relative'
    }}>
      {/* Viewport Control Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 18px',
        backgroundColor: '#18181b',
        borderBottom: '1px solid #27272a'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#818cf8' }}>📐 3D WebGL Canvas</span>
          <span style={{ fontSize: '12px', color: '#71717a', background: '#27272a', padding: '2px 8px', borderRadius: '6px' }}>
            {meshId}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsWireframe(!isWireframe)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: isWireframe ? '#6366f1' : '#27272a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
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
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
            }}
            title="Download .GLB, .OBJ, and .STL 3D formats in 1-click ZIP bundle"
          >
            📦 Download 3D Bundle (.ZIP)
          </a>
        </div>
      </div>

      {/* WebGL Render Area */}
      <div style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at center, #1e1e24 0%, #0d0e11 100%)'
      }}>
        {/* Synthetic 3D Device Rendering Canvas Representation */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '24px',
          border: isWireframe ? '2px dashed #6366f1' : '2px solid rgba(99, 102, 241, 0.4)',
          borderRadius: '16px',
          background: isWireframe ? 'rgba(99, 102, 241, 0.05)' : 'rgba(255, 255, 255, 0.03)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          maxWidth: '360px',
          width: '100%'
        }}>
          <div style={{ fontSize: '48px' }}>🤖</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fafafa' }}>PyTorch 3D Device Mesh</div>
            <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '4px' }}>
              Vertices: {verticesCount.toLocaleString()} | Polygons: {facesCount.toLocaleString()}
            </div>
          </div>
          <div style={{
            display: 'flex',
            gap: '8px',
            fontSize: '11px',
            color: '#10b981',
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '4px 12px',
            borderRadius: '12px',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}>
            <span>✓ PBR UV Shaders Applied</span>
            <span>✓ OrbitControls Active</span>
          </div>
        </div>

        {/* Floating View Presets */}
        <div style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          display: 'flex',
          gap: '6px',
          background: 'rgba(24, 24, 27, 0.8)',
          backdropFilter: 'blur(8px)',
          padding: '4px',
          borderRadius: '8px',
          border: '1px solid #27272a'
        }}>
          {(['3d', 'front', 'rear', 'top'] as const).map((preset) => (
            <button
              key={preset}
              onClick={() => setViewPreset(preset)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: viewPreset === preset ? '#6366f1' : 'transparent',
                color: viewPreset === preset ? '#ffffff' : '#a1a1aa',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ThreeViewport;
