import os
import uuid

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.config import settings
from app.config import limiter

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024


@router.post("")
@limiter.limit("10/minute")
async def upload_image(request: Request, file: UploadFile = File(...)) -> dict:
    ext = os.path.splitext(file.filename or "image.jpg")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件类型: {ext}")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "文件大小超过 5MB 限制")

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    return {"url": f"/api/uploads/{filename}"}
