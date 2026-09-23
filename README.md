<div align="center">

# ⚡ TensorRender
### Next-Generation Neural Rendering & Deep Super-Resolution Studio

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.18%2B-005CED.svg?logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![Hardware Support](https://img.shields.io/badge/Hardware-CUDA%20%7C%20DirectML%20%7C%20CPU-76B900.svg?logo=nvidia&logoColor=white)](#hardware-acceleration)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
  <b>TensorRender</b> is a high-performance local AI super-resolution and neural texture synthesis studio.<br/>
  Powered by <b>ONNX Runtime</b> and state-of-the-art <b>Real-ESRGAN</b> architectures, featuring an interactive real-time split-comparison viewer, seamless memory-bounded tiled processing, and hardware-accelerated inference.
</p>

</div>

---

## 🌟 Key Highlights

- **🧠 Deep Neural Texture Synthesis**: Reconstructs realistic high-frequency micro-details, textures, and edges rather than merely interpolating pixels.
- **⚡ Hardware Agnostic Acceleration**:
  - **NVIDIA CUDA**: Ultra-low latency Tensor Core acceleration via `CUDAExecutionProvider`.
  - **Microsoft DirectML**: Native DirectX 12 GPU acceleration for Windows with zero driver configuration.
  - **Tiled CPU Fallback**: Automatically segments large images into padded tiles with cosine edge feathering, preventing RAM exhaustion on any hardware.
- **🎛️ Interactive Comparison Studio**:
  - **Live Split-Slider**: Smoothly drag the vertical divider to evaluate before vs. after resolution in real time.
  - **Side-by-Side Mode**: Dual viewport display for global composition review.
  - **Synchronized Zoom & Pan**: Deep inspection from 100% up to 600% magnification.
- **🛡️ Full Transparency (Alpha Channel) Support**: Correctly isolates and processes alpha channels for clean, border-artifact-free PNG/WebP assets and icons.
- **📦 On-Demand Model Management**: Pre-configured catalog that dynamically streams and caches verified ONNX model weights directly from HuggingFace.

---

## 🔬 Model Lineup

| Model | Target Domain | Native Scale | Model Size | Speed (RTX 2050 / CPU) |
| :--- | :--- | :---: | :---: | :---: |
| **RealESR-AnimeVideo-v3** | Anime, Illustrations, Logos, Screenshots, UI | **4×** | `2.4 MB` | **~0.15s** / ~0.8s |
| **RealESRGAN_x4plus** | Photorealistic portraits, natural scenes, textures | **4×** | `66.2 MB` | **~0.25s** / ~3.2s |
| **RealESRGAN_x2plus** | Subtle 2× photo detail synthesis | **2×** | `64.0 MB` | **~0.20s** / ~2.5s |
| **Lanczos-4 Sharp** | Mathematical resampling with unsharp mask | **Any** | Built-in | **Instant (<10ms)** |

---

## 🚀 Quickstart

### 1. Clone the Repository
```bash
git clone https://github.com/singh-shubham3847/TensorRender.git
cd TensorRender
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Launch the Studio
- **Windows (One-Click)**: Double-click [`run.bat`](run.bat)
- **Terminal**:
  ```bash
  python -m backend.app
  ```

Open your browser at **`http://localhost:8000`**.

---

## ⚡ Hardware Acceleration

TensorRender automatically detects the best available execution provider in priority order:
$$\text{CUDA} \longrightarrow \text{DirectML (DirectX 12)} \longrightarrow \text{CPU}$$

### Enable GPU Acceleration

#### Option A: DirectML (Fastest setup for Windows)
DirectML runs directly on your GPU (NVIDIA RTX / GTX, AMD Radeon, or Intel Arc) via DirectX 12 without needing CUDA SDK or cuDNN configuration:
```bash
pip uninstall onnxruntime -y
pip install onnxruntime-directml
```

#### Option B: Native NVIDIA CUDA
For maximum throughput on NVIDIA GPUs:
```bash
pip uninstall onnxruntime -y
pip install onnxruntime-gpu
```

---

## 📂 Project Architecture

```
TensorRender/
├── backend/
│   ├── app.py              # FastAPI server, REST API & static mount
│   ├── upscaler.py         # Neural engine, tiled inference & edge feathering
│   ├── model_manager.py    # Dynamic model registry & streaming downloader
│   └── utils.py            # Image transformation and color grading helpers
├── static/
│   ├── index.html          # Studio interface with Tailwind CSS & Lucide Icons
│   ├── style.css           # Glassmorphism styling & split slider components
│   └── app.js              # Client state, pan-zoom math, and upload handlers
├── models/                 # Local cache directory for ONNX models (.gitignore protected)
│   └── .gitkeep
├── requirements.txt        # Python dependency manifest
├── run.bat                 # One-click Windows launcher
└── README.md               # Documentation
```

---

## 🔌 API Reference

### `POST /api/upscale`
Submit an image for neural super-resolution.

- **Parameters** (`multipart/form-data`):
  - `file`: Image file (`PNG`, `JPEG`, `WEBP`)
  - `model_id`: Model identifier (e.g., `realesr-anime-v3-x4`)
  - `scale`: Target upscale multiplier (`2` or `4`)
  - `sharpness`: Post-process sharpness factor (`0.5` – `2.0`, default `1.0`)
  - `contrast`: Post-process contrast factor (`0.8` – `1.4`, default `1.0`)
  - `output_format`: Target file extension (`png`, `webp`, `jpeg`)

- **Response** (`application/json`):
  ```json
  {
    "success": true,
    "image": "data:image/png;base64,...",
    "metadata": {
      "original_width": 256,
      "original_height": 256,
      "upscaled_width": 1024,
      "upscaled_height": 1024,
      "scale_factor": 4,
      "model_used": "realesr-anime-v3-x4",
      "model_name": "RealESR-AnimeVideo-v3 (4x Fast)",
      "provider": "CPUExecutionProvider",
      "latency_ms": 780,
      "output_size_bytes": 142800,
      "format": "png"
    }
  }
  ```

### `GET /api/models`
Retrieve the list of supported models, download status, and disk usage.

### `POST /api/models/download`
Pre-cache any neural model in the background before processing.

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

## 🙏 Acknowledgments
- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) by Xintao Wang et al.
- [ONNX Runtime](https://github.com/microsoft/onnxruntime) by Microsoft.
- [FastAPI](https://fastapi.tiangolo.com/) by Sebastián Ramírez.
