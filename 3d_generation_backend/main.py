import os
import time
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from services.hunyuan3d_engine import Hunyuan3DEngine
from services.snapshot_renderer import SnapshotRenderer

app = FastAPI(
    title="Application 3 - 3D Generative Mesh Microservice Engine",
    description="Self-hosted PyTorch 3D mesh generator microservice for CAD Studio App",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure static directories exist
os.makedirs("./static/assets", exist_ok=True)
os.makedirs("./static/snapshots", exist_ok=True)

# Mount static asset & snapshot hosting
app.mount("/assets", StaticFiles(directory="./static/assets"), name="assets")
app.mount("/snapshots", StaticFiles(directory="./static/snapshots"), name="snapshots")

# Initialize 3D Engine & Renderer instances
engine = Hunyuan3DEngine()
renderer = SnapshotRenderer()

def get_gpu_info() -> Dict[str, Any]:
    """Inspects PyTorch CUDA GPU connection status and VRAM metrics."""
    cuda_available = torch.cuda.is_available()
    if cuda_available:
        device_name = torch.cuda.get_device_name(0)
        total_vram = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 2)
        allocated_vram = round(torch.cuda.memory_allocated(0) / (1024**3), 2)
        free_vram = round(total_vram - allocated_vram, 2)
        return {
            "gpuConnected": True,
            "deviceCount": torch.cuda.device_count(),
            "gpuName": device_name,
            "totalVramGB": total_vram,
            "allocatedVramGB": allocated_vram,
            "freeVramGB": free_vram,
            "cudaVersion": torch.version.cuda or "11.8",
            "status": "🟢 ONLINE (NVIDIA GPU Connected)"
        }
    return {
        "gpuConnected": False,
        "deviceCount": 0,
        "gpuName": "CPU Fallback Mode",
        "totalVramGB": 0,
        "allocatedVramGB": 0,
        "freeVramGB": 0,
        "cudaVersion": "N/A",
        "status": "🟡 ONLINE (CPU Mode - CUDA Not Detected)"
    }

class MeshRequest(BaseModel):
    prompt: Optional[str] = "Industrial Device Controller 3D Mesh"
    documentId: Optional[str] = None
    engine: Optional[str] = "hunyuan3d"  # hunyuan3d, trellis, instantmesh
    targetFormat: Optional[str] = "glb"  # glb, obj, fbx

class RefineMeshRequest(BaseModel):
    meshId: str
    refinementFeedback: str
    engine: Optional[str] = "hunyuan3d"

@app.get("/", response_class=HTMLResponse)
def home_dashboard():
    gpu = get_gpu_info()
    status_color = "#10b981" if gpu["gpuConnected"] else "#f59e0b"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Plixy 3D AI Engine - Status Dashboard</title>
        <style>
            body {{ font-family: 'Inter', system-ui, sans-serif; background-color: #09090b; color: #fafafa; margin: 0; padding: 40px; }}
            .card {{ background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 32px; max-width: 720px; margin: 0 auto; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }}
            h1 {{ font-size: 24px; margin-top: 0; color: #6366f1; display: flex; align-items: center; gap: 10px; }}
            .status-badge {{ background: {status_color}22; color: {status_color}; border: 1px solid {status_color}44; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; display: inline-block; margin-bottom: 20px; }}
            .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }}
            .metric {{ background: #27272a; padding: 16px; border-radius: 10px; }}
            .label {{ font-size: 11px; color: #a1a1aa; text-transform: uppercase; font-weight: 700; }}
            .val {{ font-size: 18px; font-weight: 700; margin-top: 4px; color: #ffffff; }}
            .endpoint-list {{ background: #121215; padding: 16px; border-radius: 10px; border: 1px solid #27272a; margin-top: 24px; font-family: monospace; font-size: 13px; color: #a1a1aa; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>📐 Plixy Application 3 - 3D AI Engine</h1>
            <div class="status-badge">{gpu["status"]}</div>

            <div class="grid">
                <div class="metric">
                    <div class="label">GPU Connection Status</div>
                    <div class="val" style="color: {status_color}">{"✅ Connected" if gpu["gpuConnected"] else "⚠️ Disconnected (CPU Mode)"}</div>
                </div>
                <div class="metric">
                    <div class="label">GPU Hardware Model</div>
                    <div class="val">{gpu["gpuName"]}</div>
                </div>
                <div class="metric">
                    <div class="label">Total GPU VRAM</div>
                    <div class="val">{gpu["totalVramGB"]} GB</div>
                </div>
                <div class="metric">
                    <div class="label">Free GPU VRAM</div>
                    <div class="val">{gpu["freeVramGB"]} GB</div>
                </div>
                <div class="metric">
                    <div class="label">CUDA Version</div>
                    <div class="val">{gpu["cudaVersion"]}</div>
                </div>
                <div class="metric">
                    <div class="label">Active Engines</div>
                    <div class="val">Hunyuan3D, TRELLIS, InstantMesh</div>
                </div>
            </div>

            <div class="endpoint-list">
                <strong>Available Endpoints:</strong><br>
                - GET /health (JSON Diagnostics)<br>
                - POST /generate-mesh (Synthesizes .GLB / .OBJ / .STL & Zip Bundle)<br>
                - POST /modify-mesh (Re-synthesizes Mesh from Refinement Prompt)<br>
                - GET /assets/&lt;meshId&gt;.glb (Static 3D Asset Server)
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.get("/health")
def health_check():
    gpu = get_gpu_info()
    return {
        "status": "online",
        "service": "3d_generation_backend",
        "gpu": gpu,
        "condaEnv": "plixy-3d-engine",
        "defaultEngine": os.getenv("DEFAULT_3D_MODEL_ENGINE", "hunyuan3d"),
        "maxRetries": int(os.getenv("MAX_REFINEMENT_ATTEMPTS", "2")),
        "targetAccuracy": int(os.getenv("TARGET_ACCURACY_PERCENT", "85")),
    }

@app.post("/generate-mesh")
async def generate_mesh(req: MeshRequest):
    try:
        engine_choice = req.engine or os.getenv("DEFAULT_3D_MODEL_ENGINE", "hunyuan3d")
        result = await engine.generate_mesh(
            prompt=req.prompt or "Industrial Hardware Component",
            engine_type=engine_choice,
        )
        
        snapshots = renderer.render_snapshots(result["meshId"])
        result["snapshots"] = snapshots
        result["gpuInfo"] = get_gpu_info()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/modify-mesh")
async def modify_mesh(req: RefineMeshRequest):
    try:
        engine_choice = req.engine or os.getenv("DEFAULT_3D_MODEL_ENGINE", "hunyuan3d")
        refined_id = f"{req.meshId}_refined"
        result = await engine.generate_mesh(
            prompt=f"Refined 3D model with feedback: {req.refinementFeedback}",
            engine_type=engine_choice,
            output_name=refined_id,
        )
        
        snapshots = renderer.render_snapshots(result["meshId"])
        result["snapshots"] = snapshots
        result["refinementFeedbackApplied"] = req.refinementFeedback
        result["gpuInfo"] = get_gpu_info()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5200, reload=True)
