from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import json
import os
import uuid
import sys

# Import modules with fallback
try:
    from image_processor import process_image
    from nester import optimize_layout
except ImportError:
    sys.path.append(".")
    from image_processor import process_image
    from nester import optimize_layout

app = FastAPI(title="Eco-Nesting API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Shape(BaseModel):
    id: str
    points: List[List[float]]

class OptimizeRequest(BaseModel):
    cloth_width: float
    cloth_height: float
    scale: float
    gap: float
    shapes: List[Shape]
    boundary_points: Optional[List[List[float]]] = None

class LayoutSchema(BaseModel):
    id: str
    name: str
    shapes: List[Shape]
    efficiency: float
    created_at: str

DB_FILE = "saved_layouts.json"

def load_db():
    if not os.path.exists(DB_FILE):
        return []
    with open(DB_FILE, "r") as f:
        try:
            return json.load(f)
        except:
            return []

def save_db(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2)

@app.get("/")
async def root():
    return {"message": "Eco-Nesting API is running"}

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        processed_shapes = await run_in_threadpool(process_image, contents)
        
        response_shapes = []
        for shape in processed_shapes:
            response_shapes.append({
                "id": str(uuid.uuid4()),
                "points": shape["points"],
                "bbox": shape["bbox"],
                "pixel_area": shape["area"],
                "image": shape.get("image")  # Base64 PNG with transparency
            })
            
        return {"shapes": response_shapes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process-fabric")
async def process_fabric(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        import cv2
        import numpy as np
        
        # Standard processing to find polygons
        processed = await run_in_threadpool(process_image, contents)
        
        if not processed:
            raise HTTPException(status_code=400, detail="No fabric boundary detected")
            
        # Use the largest detected shape as the fabric piece
        processed.sort(key=lambda s: s['area'], reverse=True)
        fabric_item = processed[0]
        
        return {
            "id": fabric_item["id"],
            "points": fabric_item["points"],
            "bbox": fabric_item["bbox"],
            "image": fabric_item["image"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/optimize")
async def optimize(request: OptimizeRequest):
    try:
        scale = request.scale
        if scale == 0: scale = 1
        
        # Convert shapes to CM
        shapes_cm = []
        for s in request.shapes:
            points_cm = [[p[0]/scale, p[1]/scale] for p in s.points]
            shapes_cm.append({
                "id": s.id,
                "points": points_cm
            })
            
        result = await run_in_threadpool(
            optimize_layout,
            cloth_width=request.cloth_width, 
            cloth_height=request.cloth_height, 
            shapes=shapes_cm, 
            gap=request.gap,
            boundary_points=request.boundary_points
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return {
            "results": result["results"],
            "best_index": result["best_index"]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/layouts")
async def get_layouts():
    return load_db()

@app.post("/layouts")
async def save_layout(layout: LayoutSchema):
    db = load_db()
    db.append(layout.dict())
    save_db(db)
    return {"message": "Saved"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
