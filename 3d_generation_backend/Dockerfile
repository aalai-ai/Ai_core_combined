FROM python:3.10-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install System Dependencies for OpenGL & Rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    wget \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu118
RUN pip install --no-cache-dir fastapi uvicorn trimesh huggingface_hub pyopengl scipy networkx

COPY . /app/
RUN chmod +x /app/entrypoint.sh

EXPOSE 5200

ENTRYPOINT ["/app/entrypoint.sh"]
