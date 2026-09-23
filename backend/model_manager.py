import os
import threading
import urllib.request
from typing import Dict, Any, Optional

MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))
os.makedirs(MODELS_DIR, exist_ok=True)

MODEL_CATALOG: Dict[str, Dict[str, Any]] = {
    "realesr-anime-v3-x4": {
        "id": "realesr-anime-v3-x4",
        "name": "RealESR-AnimeVideo-v3 (4x Fast)",
        "scale": 4,
        "type": "ai",
        "category": "Anime & Art",
        "description": "Ultra-fast neural network optimized for anime, illustrations, logos, icons, and diagrams.",
        "filename": "RealESR-AnimeVideo-v3_x4.onnx",
        "url": "https://huggingface.co/tidus2102/Real-ESRGAN/resolve/main/RealESR-AnimeVideo-v3_x4.onnx",
        "approx_size_mb": 2.4,
    },
    "realesrgan-x4plus": {
        "id": "realesrgan-x4plus",
        "name": "RealESRGAN_x4plus (4x Photo)",
        "scale": 4,
        "type": "ai",
        "category": "Photographs",
        "description": "Deep generative model for photorealistic images, enhancing fine textures, faces, and nature.",
        "filename": "RealESRGAN_x4.onnx",
        "url": "https://huggingface.co/Meeperomi/RealESRGAN_x4-onnx/resolve/main/RealESRGAN_x4.onnx",
        "approx_size_mb": 66.2,
    },
    "realesrgan-x2plus": {
        "id": "realesrgan-x2plus",
        "name": "RealESRGAN_x2plus (2x Photo)",
        "scale": 2,
        "type": "ai",
        "category": "Photographs",
        "description": "High-fidelity 2x super-resolution for general photographs, preserving original subtle details.",
        "filename": "Real-ESRGAN_x2plus.onnx",
        "url": "https://huggingface.co/tidus2102/Real-ESRGAN/resolve/main/Real-ESRGAN_x2plus.onnx",
        "approx_size_mb": 64.0,
    },
    "lanczos-sharp": {
        "id": "lanczos-sharp",
        "name": "Lanczos-4 Sharp (Instant)",
        "scale": 0,  # dynamic (supports 2x, 4x, any)
        "type": "algorithmic",
        "category": "Zero Download",
        "description": "High-precision mathematical resampling with intelligent unsharp mask edge enhancement.",
        "filename": None,
        "url": None,
        "approx_size_mb": 0.0,
    }
}

# Download progress state tracking
download_progress: Dict[str, Dict[str, Any]] = {}
download_lock = threading.Lock()


def get_model_path(model_id: str) -> Optional[str]:
    info = MODEL_CATALOG.get(model_id)
    if not info or not info.get("filename"):
        return None
    path = os.path.join(MODELS_DIR, info["filename"])
    if os.path.isfile(path) and os.path.getsize(path) > 1000:
        return path
    return None


def is_model_available(model_id: str) -> bool:
    info = MODEL_CATALOG.get(model_id)
    if not info:
        return False
    if info["type"] == "algorithmic":
        return True
    return get_model_path(model_id) is not None


def list_models():
    results = []
    for model_id, info in MODEL_CATALOG.items():
        is_dl = is_model_available(model_id)
        prog = download_progress.get(model_id, {})
        results.append({
            "id": model_id,
            "name": info["name"],
            "scale": info["scale"],
            "type": info["type"],
            "category": info["category"],
            "description": info["description"],
            "approx_size_mb": info["approx_size_mb"],
            "downloaded": is_dl,
            "downloading": prog.get("status") == "downloading",
            "progress_percent": prog.get("percent", 0),
            "error": prog.get("error"),
        })
    return results


def download_model(model_id: str):
    info = MODEL_CATALOG.get(model_id)
    if not info or not info.get("url"):
        return True, "Model is built-in or invalid"

    target_path = os.path.join(MODELS_DIR, info["filename"])
    if os.path.isfile(target_path) and os.path.getsize(target_path) > 1000:
        return True, "Model already downloaded"

    with download_lock:
        if download_progress.get(model_id, {}).get("status") == "downloading":
            return True, "Download already in progress"
        download_progress[model_id] = {"status": "downloading", "percent": 0, "error": None}

    def _worker():
        try:
            temp_path = target_path + ".tmp"
            headers = {'User-Agent': 'Mozilla/5.0'}
            req = urllib.request.Request(info["url"], headers=headers)
            with urllib.request.urlopen(req) as resp, open(temp_path, 'wb') as out_f:
                total_size = int(resp.headers.get('content-length', 0))
                downloaded = 0
                block_size = 65536
                while True:
                    chunk = resp.read(block_size)
                    if not chunk:
                        break
                    out_f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        download_progress[model_id]["percent"] = min(100, int(downloaded * 100 / total_size))

            if os.path.exists(target_path):
                os.remove(target_path)
            os.rename(temp_path, target_path)
            download_progress[model_id] = {"status": "completed", "percent": 100, "error": None}
        except Exception as e:
            download_progress[model_id] = {"status": "error", "percent": 0, "error": str(e)}

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return True, "Download started"
