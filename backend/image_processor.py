import cv2
import numpy as np
import base64

def process_image(image_bytes: bytes):
    """
    Process the uploaded image to extract garment piece shapes ONLY.
    Aggressively filters out text, labels, and small noise.
    Returns shapes with contour data AND base64-encoded PNG images.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Could not decode image")

    img_h, img_w = img.shape[:2]
    img_area = img_h * img_w
    print(f"DEBUG: Image size {img_w}x{img_h}, area={img_area}")

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
 
    # PERFORMANCE OPTIMIZATION: Resize for detection if image is massive
    # Bilateral filtering on 6000x4000 is extremely slow (causes 500/Timeout)
    MAX_DETECTION_DIM = 1500
    h, w = gray.shape
    scale_down = 1.0
    if max(h, w) > MAX_DETECTION_DIM:
        scale_down = MAX_DETECTION_DIM / max(h, w)
        gray_small = cv2.resize(gray, (int(w * scale_down), int(h * scale_down)))
        img_small = cv2.resize(img, (int(w * scale_down), int(h * scale_down)))
    else:
        gray_small = gray
        img_small = img
 
    small_h, small_w = gray_small.shape
    small_area = small_h * small_w
 
    # Use Bilateral Filter on the resized image (FAST and CLEAN)
    filtered = cv2.bilateralFilter(gray_small, 9, 75, 75)
    edged = cv2.Canny(filtered, 30, 150)
    kernel = np.ones((3, 3), np.uint8)
    edged = cv2.dilate(edged, kernel, iterations=1)
 
    # Find contours
    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    print(f"DEBUG: Found {len(contours)} raw contours on {small_w}x{small_h} detection buffer")
 
    shapes = []
    # Balanced filters on the detection scale
    min_area = small_area * 0.001 
    max_area = small_area * 0.98
 
    for cnt in contours:
        if len(shapes) > 100: break
 
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area: continue
 
        x, y, cw, ch = cv2.boundingRect(cnt)
        bbox_area = cw * ch
 
        aspect = float(cw) / ch if ch > 0 else 0
        if aspect > 20 or aspect < 0.05: continue
 
        extent = area / bbox_area if bbox_area > 0 else 0
        if extent < 0.15: continue # Highly curved
 
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0
        if solidity < 0.3: continue
 
        perimeter = cv2.arcLength(cnt, True)
        circularity = (4 * np.pi * area) / (perimeter * perimeter) if perimeter > 0 else 0
        if circularity < 0.005: continue
 
        # Min dimensions relative to detection size
        if cw < small_w * 0.01 or ch < small_h * 0.01: continue
 
        print(f"DEBUG: ACCEPTED PIECE {len(shapes)+1} - area={area:.0f}")
 
        # SCALE POINTS BACK TO ORIGINAL RESOLUTION (Preserve 1:1 data)
        points_orig = (cnt.reshape(-1, 2) / scale_down).tolist()
 
        # Extract small image for UI preview (efficient for transfer)
        piece_image_b64 = extract_piece_image(img_small, cnt, x, y, cw, ch)
 
        shapes.append({
            "id": f"piece_{len(shapes)+1}",
            "points": points_orig,
            "area": area / (scale_down ** 2), # Correct area
            "bbox": {
                "x": x / scale_down, "y": y / scale_down, 
                "w": cw / scale_down, "h": ch / scale_down
            },
            "image": piece_image_b64
        })
 
    print(f"DEBUG: Final result: {len(shapes)} garment pieces")
    return shapes


def extract_piece_image(img, contour, x, y, w, h):
    """
    Extract a single piece from the image with background removed.
    Returns base64-encoded PNG with transparency.
    """
    mask = np.zeros(img.shape[:2], dtype=np.uint8)
    cv2.drawContours(mask, [contour], -1, 255, -1)

    cropped_img = img[y:y+h, x:x+w].copy()
    cropped_mask = mask[y:y+h, x:x+w]

    b, g, r = cv2.split(cropped_img)
    rgba = cv2.merge([r, g, b, cropped_mask])

    success, buffer = cv2.imencode('.png', rgba)
    if not success:
        return None

    img_b64 = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/png;base64,{img_b64}"
