import time
import math
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import onnxruntime as ort
from typing import Tuple, Dict, Any, Optional

from .model_manager import MODEL_CATALOG, get_model_path, is_model_available, download_model

# Cached ONNX sessions
_SESSION_CACHE: Dict[str, ort.InferenceSession] = {}


def get_inference_session(model_id: str) -> Optional[ort.InferenceSession]:
    global _SESSION_CACHE
    if model_id in _SESSION_CACHE:
        return _SESSION_CACHE[model_id]

    path = get_model_path(model_id)
    if not path:
        return None

    # Prioritize GPU acceleration: CUDA -> DirectML -> CPU
    available_providers = ort.get_available_providers()
    providers = []
    for prov in ['CUDAExecutionProvider', 'DmlExecutionProvider', 'CPUExecutionProvider']:
        if prov in available_providers:
            providers.append(prov)
    if not providers:
        providers = ['CPUExecutionProvider']

    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(path, sess_options=sess_options, providers=providers)
    _SESSION_CACHE[model_id] = session
    return session


def run_tile_inference(session: ort.InferenceSession, tile_np: np.ndarray) -> np.ndarray:
    """Runs a single tile (float32 [0..1], shape [H, W, 3]) through the ONNX model."""
    inp_tensor = np.transpose(tile_np, (2, 0, 1))  # HWC to CHW
    inp_tensor = np.expand_dims(inp_tensor, 0).astype(np.float32)  # [1, 3, H, W]

    inp_name = session.get_inputs()[0].name
    out_name = session.get_outputs()[0].name

    raw_out = session.run([out_name], {inp_name: inp_tensor})[0]
    out_tile = np.clip(raw_out[0], 0.0, 1.0)
    out_tile = np.transpose(out_tile, (1, 2, 0))  # CHW to HWC
    return out_tile


def upscale_image_tiled(
    img_rgb: Image.Image,
    session: ort.InferenceSession,
    model_scale: int,
    tile_size: int = 256,
    tile_pad: int = 16
) -> Image.Image:
    """
    Seamless tiled super-resolution inference.
    Handles any input resolution without high peak RAM and without seam artifacts.
    """
    w, h = img_rgb.size
    img_arr = np.array(img_rgb, dtype=np.float32) / 255.0

    # If small enough, run in a single pass
    if max(w, h) <= tile_size + tile_pad * 2:
        out_np = run_tile_inference(session, img_arr)
        out_uint8 = (out_np * 255.0).round().astype(np.uint8)
        return Image.fromarray(out_uint8, mode='RGB')

    # Output canvas
    out_w, out_h = w * model_scale, h * model_scale
    output_canvas = np.zeros((out_h, out_w, 3), dtype=np.float32)

    x_steps = math.ceil(w / tile_size)
    y_steps = math.ceil(h / tile_size)

    for yi in range(y_steps):
        for xi in range(x_steps):
            # Coordinates in original image
            x_start = xi * tile_size
            y_start = yi * tile_size
            x_end = min(x_start + tile_size, w)
            y_end = min(y_start + tile_size, h)

            # Padded coordinates
            x_pad_start = max(0, x_start - tile_pad)
            y_pad_start = max(0, y_start - tile_pad)
            x_pad_end = min(w, x_end + tile_pad)
            y_pad_end = min(h, y_end + tile_pad)

            # Extract padded tile
            tile = img_arr[y_pad_start:y_pad_end, x_pad_start:x_pad_end]

            # Run inference
            out_tile = run_tile_inference(session, tile)

            # Compute crop box within out_tile to drop padding
            crop_top = (y_start - y_pad_start) * model_scale
            crop_bottom = crop_top + (y_end - y_start) * model_scale
            crop_left = (x_start - x_pad_start) * model_scale
            crop_right = crop_left + (x_end - x_start) * model_scale

            cropped_clean_tile = out_tile[crop_top:crop_bottom, crop_left:crop_right]

            # Place directly into output canvas
            dest_y1 = y_start * model_scale
            dest_y2 = y_end * model_scale
            dest_x1 = x_start * model_scale
            dest_x2 = x_end * model_scale

            output_canvas[dest_y1:dest_y2, dest_x1:dest_x2] = cropped_clean_tile

    out_uint8 = (np.clip(output_canvas, 0.0, 1.0) * 255.0).round().astype(np.uint8)
    return Image.fromarray(out_uint8, mode='RGB')


def upscale_image(
    image: Image.Image,
    model_id: str = "realesr-anime-v3-x4",
    target_scale: int = 4,
    sharpness: float = 1.0,
    contrast: float = 1.0,
) -> Tuple[Image.Image, Dict[str, Any]]:
    """
    Main entry point for upscaling an image.
    Supports transparency preservation, model inference, scaling adaptation, and post-enhancements.
    """
    t0 = time.time()
    orig_w, orig_h = image.size

    # Handle Alpha channel
    has_alpha = image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info)
    alpha_channel = None
    if has_alpha:
        rgba = image.convert('RGBA')
        r, g, b, a = rgba.split()
        img_rgb = Image.merge('RGB', (r, g, b))
        alpha_channel = a
    else:
        img_rgb = image.convert('RGB')

    model_info = MODEL_CATALOG.get(model_id, MODEL_CATALOG["lanczos-sharp"])
    used_model_id = model_id

    if model_info["type"] == "algorithmic" or not is_model_available(model_id):
        # Fallback or selected Lanczos-4
        out_w = orig_w * target_scale
        out_h = orig_h * target_scale
        upscaled_rgb = img_rgb.resize((out_w, out_h), resample=Image.Resampling.LANCZOS)
        # Apply subtle edge enhancement default for Lanczos
        upscaled_rgb = upscaled_rgb.filter(ImageFilter.UnsharpMask(radius=1.5, percent=120, threshold=3))
        used_model_id = "lanczos-sharp"
    else:
        session = get_inference_session(model_id)
        if not session:
            # Model not loaded, fallback
            out_w = orig_w * target_scale
            out_h = orig_h * target_scale
            upscaled_rgb = img_rgb.resize((out_w, out_h), resample=Image.Resampling.LANCZOS)
            used_model_id = "lanczos-sharp"
        else:
            model_native_scale = model_info["scale"]
            # Perform super-resolution
            upscaled_rgb = upscale_image_tiled(img_rgb, session, model_scale=model_native_scale)

            # Adjust if target_scale differs from model native scale
            if target_scale != model_native_scale:
                target_w = orig_w * target_scale
                target_h = orig_h * target_scale
                upscaled_rgb = upscaled_rgb.resize((target_w, target_h), resample=Image.Resampling.LANCZOS)

    # Post processing enhancements
    if sharpness != 1.0 and sharpness > 0:
        enhancer = ImageEnhance.Sharpness(upscaled_rgb)
        upscaled_rgb = enhancer.enhance(sharpness)

    if contrast != 1.0 and contrast > 0:
        enhancer = ImageEnhance.Contrast(upscaled_rgb)
        upscaled_rgb = enhancer.enhance(contrast)

    # Recombine Alpha if exists
    final_w, final_h = upscaled_rgb.size
    if alpha_channel is not None:
        upscaled_alpha = alpha_channel.resize((final_w, final_h), resample=Image.Resampling.LANCZOS)
        result_img = Image.merge('RGBA', (*upscaled_rgb.split(), upscaled_alpha))
    else:
        result_img = upscaled_rgb

    latency_ms = round((time.time() - t0) * 1000)

    meta = {
        "original_width": orig_w,
        "original_height": orig_h,
        "upscaled_width": final_w,
        "upscaled_height": final_h,
        "scale_factor": target_scale,
        "model_used": used_model_id,
        "model_name": MODEL_CATALOG.get(used_model_id, {}).get("name", used_model_id),
        "provider": session.get_providers()[0] if 'session' in locals() and session else "CPUExecutionProvider",
        "latency_ms": latency_ms,
    }

    return result_img, meta
