import os
import time
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
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

class MeshRequest(BaseModel):
    prompt: Optional[str] = "Industrial Device Controller 3D Mesh"
    documentId: Optional[str] = None
    engine: Optional[str] = "hunyuan3d"  # hunyuan3d, trellis, instantmesh
    targetFormat: Optional[str] = "glb"  # glb, obj, fbx

class RefineMeshRequest(BaseModel):
    meshId: str
    refinementFeedback: str
    engine: Optional[str] = "hunyuan3d"

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "service": "3d_generation_backend",
        "condaEnv": "plixy-3d-engine",
        "torchDevice": os.getenv("TORCH_DEVICE", "cuda"),
        "gpuHalfPrecision": os.getenv("GPU_ENABLE_HALF_PRECISION", "true"),
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
        
        # Render synthetic 4-camera snapshots for Vision LLM evaluation loop
        snapshots = renderer.render_snapshots(result["meshId"])
        result["snapshots"] = snapshots
        
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
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5200, reload=True)
