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

    # Use Adaptive Thresholding
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 11, 2
    )

    # Light morphological cleaning - DON'T over-dilate (merges text into blobs)
    kernel = np.ones((3, 3), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=1)

    # Find contours - Use CHAIN_APPROX_NONE to keep ALL points on the curve
    contours, hierarchy = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    print(f"DEBUG: Found {len(contours)} raw contours")

    shapes = []

    # Relaxed filters for smaller pieces and narrow collars
    min_area = img_area * 0.005  # 0.5% of image area
    max_area = img_area * 0.95
 
    for cnt in contours:
        area = cv2.contourArea(cnt)
 
        # 1) Area filter - relaxed
        if area < min_area or area > max_area:
            continue
 
        # 2) Bounding box
        x, y, w, h = cv2.boundingRect(cnt)
        bbox_area = w * h
 
        # 3) Aspect ratio - relaxed for collars
        aspect = float(w) / h if h > 0 else 0
        if aspect > 15 or aspect < 0.06:
            continue
 
        # 4) Extent: ratio of contour area to bounding box area
        extent = area / bbox_area if bbox_area > 0 else 0
        if extent < 0.25: # Relaxed for curved collars
            continue
 
        # 5) Solidity: ratio of contour area to convex hull area
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0
        if solidity < 0.4: # Relaxed for concave shapes
            continue
 
        # 6) Circularity / Compactness
        perimeter = cv2.arcLength(cnt, True)
        circularity = (4 * np.pi * area) / (perimeter * perimeter) if perimeter > 0 else 0
        if circularity < 0.01:
            continue
 
        # 7) Minimum dimensions - relaxed for small pockets/collars
        if w < img_w * 0.02 or h < img_h * 0.02:
            continue

        print(f"DEBUG: ACCEPTED - area={area:.0f} ({area/img_area*100:.1f}%), "
              f"extent={extent:.2f}, solidity={solidity:.2f}, "
              f"circularity={circularity:.3f}, size={w}x{h}, aspect={aspect:.2f}")

        # Return ALL points of the contour for maximum precision (no simplification)
        points = cnt.reshape(-1, 2).tolist()

        # Extract individual piece image with transparent background
        piece_image_b64 = extract_piece_image(img, cnt, x, y, w, h)

        shapes.append({
            "id": f"piece_{len(shapes)+1}",
            "points": points,
            "area": area,
            "bbox": {"x": x, "y": y, "w": w, "h": h},
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
