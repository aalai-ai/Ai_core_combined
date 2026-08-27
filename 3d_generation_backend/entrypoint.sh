#!/bin/bash
set -e

echo "🚀 Starting Plixy 3D Generation Backend Container..."

# Download model checkpoints inside Docker if not already present
if [ ! -d "/app/checkpoints/hunyuan3d_2" ]; then
    echo "⬇️ Downloading 3D AI Model Checkpoints from Hugging Face inside container..."
    python setup_models.py
fi

echo "✨ Model weights verified. Launching FastAPI PyTorch Engine on port 5200..."
exec uvicorn main:app --host 0.0.0.0 --port 5200
