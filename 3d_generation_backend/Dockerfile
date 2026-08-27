FROM nvidia/cuda:11.8.0-runtime-ubuntu22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install System Dependencies & Python 3.10 inside Docker container
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3.10-dev \
    git \
    wget \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.10 as default python
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1 \
    && update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1

WORKDIR /app

# Copy requirement files & install PyTorch with CUDA 11.8 support
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu118
RUN pip install --no-cache-dir fastapi uvicorn trimesh huggingface_hub pyopengl

# Copy application source code & scripts
COPY . /app/

# Grant execution permissions to entrypoint script
RUN chmod +x /app/entrypoint.sh

EXPOSE 5200

ENTRYPOINT ["/app/entrypoint.sh"]
