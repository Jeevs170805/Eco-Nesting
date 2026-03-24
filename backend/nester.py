import time
import numpy as np
import cv2
from shapely.geometry import Polygon, MultiPolygon
from shapely.affinity import rotate, translate
from shapely.ops import unary_union
import random

class PolygonNester:
    def __init__(self, fabric_width, fabric_height, gap=0.5, boundary_poly=None):
        self.width = fabric_width
        self.height = fabric_height
        self.gap = gap
        self.margin = 0.5 # Default margin for rectangular mode
        
        if boundary_poly:
            # Irregular mode: use provided boundary with a safety margin (2mm)
            # This accounts for small scaling/precision differences between frontend and backend.
            self.fabric_poly = boundary_poly.buffer(-0.2)
            minx, miny, maxx, maxy = boundary_poly.bounds
            self.width = maxx
            self.height = maxy
        else:
            # Rectangular fabric polygon to respect 0.5cm padding
            self.fabric_poly = Polygon([
                (self.margin, self.margin), 
                (fabric_width - self.margin, self.margin), 
                (fabric_width - self.margin, fabric_height - self.margin), 
                (self.margin, fabric_height - self.margin)
            ])

    def _get_polygon(self, shape_points):
        return Polygon(shape_points)

    def _add_gap(self, poly):
        if self.gap <= 0:
            return poly
        return poly.buffer(self.gap / 2)

    def _place_polygon(self, poly_orig, poly_buffered, occupied_poly, step=3):
        # We search based on the bounds of the buffered polygon to ensure inter-piece gaps
        minx_b, miny_b, maxx_b, maxy_b = poly_buffered.bounds
        poly_w_b = maxx_b - minx_b
        poly_h_b = maxy_b - miny_b
        
        # Shift both to (0,0) relative to the buffered box
        poly_b_shifted = translate(poly_buffered, -minx_b, -miny_b)
        poly_o_shifted = translate(poly_orig, -minx_b, -miny_b)
        
        # Performance optimization: if occupied_poly is empty, just stick it at the origin
        if occupied_poly.is_empty:
            candidate_o = translate(poly_o_shifted, 0, 0)
            candidate_b = translate(poly_b_shifted, 0, 0)
            if self.fabric_poly.contains(candidate_o):
                return candidate_o, candidate_b

        # Search from bottom-left
        # Use a larger step (3cm) for reasonable performance in Python
        # Adjust search range based on fabric_poly bounds
        minxf, minyf, maxxf, maxyf = self.fabric_poly.bounds
        
        for y in range(int(minyf), int(maxyf - poly_h_b) + 1, step):
            for x in range(int(minxf), int(maxxf - poly_w_b) + 1, step):
                candidate_b = translate(poly_b_shifted, x, y)
                candidate_o = translate(poly_o_shifted, x, y)
                
                # Bounding box check before expensive intersection
                if not candidate_b.intersects(occupied_poly) and self.fabric_poly.contains(candidate_o):
                    return candidate_o, candidate_b
        return None, None

    def pack_bl(self, shapes, rotate_steps=None):
        start_time = time.time()
        packed = []
        occupied_with_gap = Polygon()
        
        for shape in shapes:
            poly = self._get_polygon(shape['points'])
            poly_with_gap = self._add_gap(poly)
            
            best_placement = None
            if rotate_steps:
                 rot_options = []
                 for angle in range(0, 360, rotate_steps):
                     rotated_orig = rotate(poly, angle, origin='center')
                     rotated_with_gap = rotate(poly_with_gap, angle, origin='center')
                     
                     p_orig, p_gap = self._place_polygon(rotated_orig, rotated_with_gap, occupied_with_gap)
                     if p_orig:
                         # Rank by "bottom-ness" then "left-ness"
                         rank = p_orig.bounds[1] * 1000 + p_orig.bounds[0]
                         rot_options.append((rank, p_orig, p_gap, angle))
                 
                 if rot_options:
                     rot_options.sort(key=lambda x: x[0])
                     _, p_orig, p_gap, ang = rot_options[0]
                     best_placement = (p_orig, p_gap, ang)
            else:
                p_orig, p_gap = self._place_polygon(poly, poly_with_gap, occupied_with_gap)
                if p_orig:
                    best_placement = (p_orig, p_gap, 0)
            
            if best_placement:
                placed_orig, placed_gap, angle = best_placement
                packed.append({
                    "id": shape['id'],
                    "poly": placed_orig,
                    "angle": angle,
                    "area": poly.area
                })
                occupied_with_gap = unary_union([occupied_with_gap, placed_gap])
        
        duration = time.time() - start_time
        return self._format_result(packed, duration, "Bottom-Left" + (" (Rotation)" if rotate_steps else ""), len(shapes))

    def pack_bl_fill(self, shapes):
        start_time = time.time()
        packed = []
        occupied_with_gap = Polygon()
        sorted_shapes = sorted(shapes, key=lambda s: Polygon(s['points']).area, reverse=True)

        for shape in sorted_shapes:
            poly = self._get_polygon(shape['points'])
            poly_with_gap = self._add_gap(poly)
            p_orig, p_gap = self._place_polygon(poly, poly_with_gap, occupied_with_gap, step=1)
            
            if p_orig:
                packed.append({
                    "id": shape['id'],
                    "poly": p_orig,
                    "angle": 0,
                    "area": poly.area
                })
                occupied_with_gap = unary_union([occupied_with_gap, p_gap])
        
        duration = time.time() - start_time
        return self._format_result(packed, duration, "Bottom-Left Fill", len(shapes))

    def pack_width_sorted(self, shapes):
        sorted_shapes = sorted(shapes, key=lambda s: Polygon(s['points']).bounds[2] - Polygon(s['points']).bounds[0], reverse=True)
        res = self.pack_bl(sorted_shapes)
        res["strategy"] = "Width Sorted BL"
        return res

    def pack_height_sorted(self, shapes):
        sorted_shapes = sorted(shapes, key=lambda s: Polygon(s['points']).bounds[3] - Polygon(s['points']).bounds[1], reverse=True)
        res = self.pack_bl(sorted_shapes)
        res["strategy"] = "Height Sorted BL"
        return res

    def pack_area_sorted(self, shapes):
        sorted_shapes = sorted(shapes, key=lambda s: Polygon(s['points']).area, reverse=True)
        res = self.pack_bl(sorted_shapes)
        res["strategy"] = "Area Sorted BL"
        return res

    def _evaluate_params(self, shapes, sequence, rotations):
        packed = []
        occupied_with_gap = Polygon()
        total_area = 0
        
        for idx, angle in zip(sequence, rotations):
            shape = shapes[idx]
            poly = self._get_polygon(shape['points'])
            rotated_orig = rotate(poly, angle, origin='center')
            rotated_with_gap = self._add_gap(rotated_orig)
            
            p_orig, p_gap = self._place_polygon(rotated_orig, rotated_with_gap, occupied_with_gap)
            if p_orig:
                packed.append({
                    "id": shape['id'],
                    "poly": p_orig,
                    "angle": angle,
                    "area": poly.area
                })
                occupied_with_gap = unary_union([occupied_with_gap, p_gap])
                total_area += poly.area
        
        return packed, total_area

    def pack_simulated_annealing(self, shapes, iterations=30):
        start_time = time.time()
        num_shapes = len(shapes)
        current_seq = list(range(num_shapes))
        current_rots = [0] * num_shapes
        
        best_seq = list(current_seq)
        best_rots = list(current_rots)
        best_packed, best_area = self._evaluate_params(shapes, best_seq, best_rots)
        
        temp = 100.0
        cooling_rate = 0.9
        
        for _ in range(iterations):
            new_seq = list(current_seq)
            new_rots = list(current_rots)
            
            if random.random() < 0.5:
                i, j = random.sample(range(num_shapes), 2)
                new_seq[i], new_seq[j] = new_seq[j], new_seq[i]
            else:
                i = random.randrange(num_shapes)
                new_rots[i] = random.choice([0, 90, 180, 270])
            
            new_packed, new_area = self._evaluate_params(shapes, new_seq, new_rots)
            
            if new_area > best_area or (best_area > 0 and random.random() < np.exp((new_area - best_area) / temp)):
                current_seq = new_seq
                current_rots = new_rots
                if new_area > best_area:
                    best_area = new_area
                    best_packed = new_packed
                    best_seq = list(new_seq)
                    best_rots = list(new_rots)
            
            temp *= cooling_rate
            
        duration = time.time() - start_time
        return self._format_result(best_packed, duration, "Simulated Annealing", num_shapes)

    def pack_genetic_algorithm(self, shapes, population_size=8, generations=4):
        start_time = time.time()
        num_shapes = len(shapes)
        
        population = []
        for _ in range(population_size):
            seq = list(range(num_shapes))
            random.shuffle(seq)
            rots = [random.choice([0, 90, 180, 270]) for _ in range(num_shapes)]
            population.append((seq, rots))
            
        best_area = -1
        best_packed = []
        
        for _ in range(generations):
            scored_pop = []
            for ind in population:
                packed, area = self._evaluate_params(shapes, ind[0], ind[1])
                scored_pop.append((area, ind, packed))
                if area > best_area:
                    best_area = area
                    best_packed = packed
            
            scored_pop.sort(key=lambda x: x[0], reverse=True)
            elites = [x[1] for x in scored_pop[:population_size // 2]]
            
            new_pop = list(elites)
            while len(new_pop) < population_size:
                p1, p2 = random.sample(elites, 2)
                split = random.randrange(num_shapes)
                child_seq = p1[0][:split] + [x for x in p2[0] if x not in p1[0][:split]]
                child_rots = p1[1][:split] + p2[1][split:]
                if random.random() < 0.2:
                    i = random.randrange(num_shapes)
                    child_rots[i] = random.choice([0, 90, 180, 270])
                new_pop.append((child_seq, child_rots))
            population = new_pop
            
        duration = time.time() - start_time
        return self._format_result(best_packed, duration, "Genetic Algorithm", num_shapes)

    def _format_result(self, packed, duration, strategy, total_requested):
        if not packed:
            return {
                "strategy": strategy, "efficiency": 0, "time": duration, 
                "packed": [], "used_width": 0, "used_height": 0,
                "total_piece_area": 0, "min_rect_area": 0,
                "packed_count": 0, "total_requested": total_requested
            }
            
        total_piece_area = sum(p['area'] for p in packed)
        
        # Calculate the absolute 2D bounding box of all packed pieces
        min_x = min(p['poly'].bounds[0] for p in packed)
        min_y = min(p['poly'].bounds[1] for p in packed)
        max_x = max(p['poly'].bounds[2] for p in packed)
        max_y = max(p['poly'].bounds[3] for p in packed)
        
        used_w = max_x - min_x
        used_h = max_y - min_y

        # Redefine the min-cut as the full fabric area up to the rightmost piece
        minx_f, miny_f, maxx_f, maxy_f = self.fabric_poly.bounds
        nest_bbox = Polygon([(minx_f, miny_f), (max_x, miny_f), (max_x, maxy_f), (minx_f, maxy_f)])
        
        # Intersection with fabric polygon gives the true "Used" part
        used_poly = self.fabric_poly.intersection(nest_bbox)
        min_cut_area = used_poly.area
        
        efficiency = (total_piece_area / min_cut_area * 100) if min_cut_area > 0 else 0
        
        # Convert used_poly to points for the frontend
        min_cut_points = []
        if isinstance(used_poly, Polygon):
            min_cut_points = [[round(pt[0], 3), round(pt[1], 3)] for pt in list(used_poly.exterior.coords)]
        elif isinstance(used_poly, MultiPolygon):
            # For simplicity, we'll take the exterior of all parts, though MultiPolygons are rare here
            for p in used_poly.geoms:
                min_cut_points.append([[round(pt[0], 3), round(pt[1], 3)] for pt in list(p.exterior.coords)])

        return {
            "strategy": strategy,
            "efficiency": round(efficiency, 2),
            "total_piece_area": round(total_piece_area, 2),
            "min_cut_area": round(min_cut_area, 2),
            "min_cut_points": min_cut_points,
            "used_width": round(used_w, 2),
            "used_height": round(used_h, 2),
            "min_x": round(min_x, 2),
            "min_y": round(min_y, 2),
            "packed_count": len(packed),
            "total_requested": total_requested,
            "time": round(duration, 3),
            "leftover_polygons": self._get_leftover_polygons(packed),
            "packed": [
                {
                    "id": p['id'],
                    "points": [[round(pt[0], 3), round(pt[1], 3)] for pt in list(p['poly'].exterior.coords)],
                    "angle": p['angle'],
                    "area": round(p['area'], 2)
                } for p in packed
            ]
        }

    def _get_leftover_polygons(self, packed):
        if not packed:
            return []
        
        try:
            occupied = unary_union([p['poly'] for p in packed])
            leftover = self.fabric_poly.difference(occupied)
            
            polys = []
            if isinstance(leftover, Polygon):
                polys.append(leftover)
            elif isinstance(leftover, MultiPolygon):
                polys.extend(list(leftover.geoms))
                
            return [
                [[round(pt[0], 3), round(pt[1], 3)] for pt in list(p.exterior.coords)]
                for p in polys if not p.is_empty
            ]
        except Exception as e:
            print(f"Error calculating leftover: {e}")
            return []

def optimize_layout(cloth_width, cloth_height, shapes, gap=0.5, boundary_points=None):
    if not shapes:
        return {"results": [], "best_index": -1}
        
    boundary_poly = None
    if boundary_points:
        boundary_poly = Polygon(boundary_points)
        
    nester = PolygonNester(cloth_width, cloth_height, gap, boundary_poly)
    results = []
    
    # 1. BL Standard
    results.append(nester.pack_bl(shapes))
    # 2. BL Rotated
    results.append(nester.pack_bl(shapes, rotate_steps=90))
    # 3. Area Sorted BL
    results.append(nester.pack_area_sorted(shapes))
    # 4. Width Sorted BL
    results.append(nester.pack_width_sorted(shapes))
    # 5. Height Sorted BL
    results.append(nester.pack_height_sorted(shapes))
    # 6. Simulated Annealing (Balanced iterations for performance)
    results.append(nester.pack_simulated_annealing(shapes, iterations=30))
    # 7. Genetic Algorithm (Smaller population for speed)
    results.append(nester.pack_genetic_algorithm(shapes, population_size=8, generations=4))
    
    # Sort by completion (all pieces fit) first, then by efficiency
    # (1, efficiency) > (0, efficiency) -> complete layouts always win
    results.sort(key=lambda x: (1 if x['packed_count'] == x['total_requested'] else 0, x['efficiency']), reverse=True)
    
    # Debug log to verify sort order in backend console
    for r in results:
        print(f"ALGO: {r['strategy']} | Fit: {r['packed_count']}/{r['total_requested']} | Efficiency: {r['efficiency']}%")
        
    # Label the best
    if results:
        results[0]['strategy'] = f"🏆 Best: {results[0]['strategy']}"
            
    return {"results": results, "best_index": 0}
