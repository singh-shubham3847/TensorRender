import os
import io
import base64
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

from .model_manager import list_models, download_model, is_model_available
from .upscaler import upscale_image

app = FastAPI(title="AI Image Upscaler Studio", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def get_index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index_file):
        return FileResponse(index_file)
    return {"message": "AI Image Upscaler API is running."}


@app.get("/api/models")
def get_models():
    """Returns available models with download status."""
    return {"models": list_models()}


@app.post("/api/models/download")
def trigger_download(model_id: str = Form(...)):
    """Triggers download for an AI model in background."""
    success, msg = download_model(model_id)
    return {"success": success, "message": msg}


@app.post("/api/upscale")
async def process_upscale(
    file: UploadFile = File(...),
    model_id: str = Form("realesr-anime-v3-x4"),
    scale: int = Form(4),
    sharpness: float = Form(1.0),
    contrast: float = Form(1.0),
    output_format: str = Form("png"),
):
    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        input_image = Image.open(io.BytesIO(contents))

        # Check resolution limits to prevent accidental 8K CPU freezes
        orig_w, orig_h = input_image.size
        if orig_w * orig_h > 4096 * 4096:
            raise HTTPException(
                status_code=400,
                detail=f"Image resolution {orig_w}x{orig_h} is too large. Max supported is 16 megapixels."
            )

        upscaled_image, meta = upscale_image(
            image=input_image,
            model_id=model_id,
            target_scale=scale,
            sharpness=sharpness,
            contrast=contrast,
        )

        # Encode output image
        fmt = output_format.upper()
        if fmt == "JPG":
            fmt = "JPEG"
        if fmt not in ("PNG", "JPEG", "WEBP"):
            fmt = "PNG"

        # If saving as JPEG, convert RGBA to RGB with white background
        save_img = upscaled_image
        if fmt == "JPEG" and save_img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", save_img.size, (255, 255, 255))
            if save_img.mode == "RGBA":
                bg.paste(save_img, mask=save_img.split()[3])
            else:
                bg.paste(save_img.convert("RGB"))
            save_img = bg

        out_buffer = io.BytesIO()
        save_kwargs = {}
        if fmt in ("JPEG", "WEBP"):
            save_kwargs["quality"] = 95
        save_img.save(out_buffer, format=fmt, **save_kwargs)
        out_bytes = out_buffer.getvalue()

        mime = f"image/{fmt.lower()}"
        b64_str = base64.b64encode(out_bytes).decode("utf-8")
        data_url = f"data:{mime};base64,{b64_str}"

        meta["output_size_bytes"] = len(out_bytes)
        meta["input_size_bytes"] = len(contents)
        meta["format"] = fmt.lower()

        return JSONResponse(content={
            "success": True,
            "image": data_url,
            "metadata": meta,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*50)
    print("  🚀 AI Image Upscaler Studio starting at http://localhost:8000")
    print("="*50 + "\n")
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=False)
