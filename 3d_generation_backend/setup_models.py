import os
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("setup_models")

try:
    from huggingface_hub import snapshot_download
except ImportError:
    print("Installing huggingface_hub...")
    os.system(f"{sys.executable} -m pip install huggingface_hub")
    from huggingface_hub import snapshot_download

CHECKPOINT_DIR = os.path.abspath("./checkpoints")
os.makedirs(CHECKPOINT_DIR, exist_ok=True)

MODELS = {
    "hunyuan3d": {
        "repo": "Tencent/Hunyuan3D-2",
        "target_dir": os.path.join(CHECKPOINT_DIR, "hunyuan3d_2")
    },
    "trellis": {
        "repo": "microsoft/TRELLIS-image-large",
        "target_dir": os.path.join(CHECKPOINT_DIR, "trellis")
    },
    "instantmesh": {
        "repo": "TencentARC/InstantMesh",
        "target_dir": os.path.join(CHECKPOINT_DIR, "instantmesh")
    }
}

def download_all_models():
    logger.info(f"Downloading 3D AI Model Checkpoints into '{CHECKPOINT_DIR}'...")
    
    for key, info in MODELS.items():
        logger.info(f"⬇️ Downloading '{key.upper()}' from Hugging Face repo: {info['repo']}...")
        try:
            snapshot_download(
                repo_id=info["repo"],
                local_dir=info["target_dir"],
                local_dir_use_symlinks=False
            )
            logger.info(f"✅ Finished downloading {key.upper()} into {info['target_dir']}")
        except Exception as e:
            logger.error(f"⚠️ Failed to download {key}: {e}")

if __name__ == "__main__":
    download_all_models()
    print("\n🎉 All 3D model weights downloaded successfully! Ready to launch docker-compose.3d.yml.")
