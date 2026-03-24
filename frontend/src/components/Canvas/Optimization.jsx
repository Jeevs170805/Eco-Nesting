import React, { useState, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { Play, AlertCircle, Maximize2, Layers, Scissors, ArrowRight } from 'lucide-react';
import axios from 'axios';

const Optimization = ({ clothConfig, shapes, onNext, setLayout, nestingMode }) => {
    const [optimizing, setOptimizing] = useState(false);
    const [optimized, setOptimized] = useState(false);
    const [metrics, setMetrics] = useState({
        totalClothArea: 0, usedPieceArea: 0, minRectArea: 0, efficiency: 0,
        wastedArea: 0, usedWidth: 0, usedHeight: 0
    });
    const [error, setError] = useState(null);
    const [originalPositions, setOriginalPositions] = useState([]);
    const [optimizationResults, setOptimizationResults] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isUserModified, setIsUserModified] = useState(false);

    const canvasRef = useRef(null);
    const fabricCanvasRef = useRef(null);

    const CLOTH_W = clothConfig.width || 100;
    const CLOTH_H = clothConfig.height || 100;
    const CLOTH_SCALE = clothConfig.scale || 10;
    const MARGIN_CM = 0; // Removed padding

    useEffect(() => {
        setMetrics(prev => ({
            ...prev,
            totalClothArea: CLOTH_W * CLOTH_H
        }));
    }, [CLOTH_W, CLOTH_H]);

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = new fabric.Canvas(canvasRef.current, {
            width: 800, height: 600, backgroundColor: '#0f172a', selection: false
        });
        fabricCanvasRef.current = canvas;
        drawGrid(canvas);

        const updateMetrics = () => {
            setIsUserModified(true);
            recalcMetrics(canvas);
        };
        canvas.on('object:moving', updateMetrics);
        canvas.on('object:rotating', updateMetrics);
        canvas.on('object:modified', updateMetrics);

        return () => { canvas.dispose(); fabricCanvasRef.current = null; };
    }, []);

    const getGridParams = () => {
        const padding = 60;
        const vScale = Math.min((800 - padding) / CLOTH_W, (600 - padding) / CLOTH_H);
        const offsetX = (800 - CLOTH_W * vScale) / 2;
        const offsetY = (600 - CLOTH_H * vScale) / 2;
        return { vScale, offsetX, offsetY };
    };

    const drawGrid = (canvas) => {
        canvas.clear();
        const { vScale, offsetX, offsetY } = getGridParams();

        // Background
        canvas.add(new fabric.Rect({
            left: offsetX, top: offsetY, width: CLOTH_W * vScale, height: CLOTH_H * vScale,
            fill: '#020617', stroke: '#1d4ed8', strokeWidth: 2, selectable: false, evented: false
        }));

        // If in irregular mode, draw the boundary polygon
        if (clothConfig.boundaryPoints && nestingMode === 'irregular') {
            const boundaryPoints = clothConfig.boundaryPoints.map(pt => ({
                x: offsetX + pt[0] * vScale,
                y: offsetY + pt[1] * vScale
            }));
            const boundary = new fabric.Polygon(boundaryPoints, {
                fill: 'transparent',
                stroke: '#eab308', // Yellow 500
                strokeWidth: 2,
                strokeDashArray: [10, 5],
                selectable: false,
                evented: false,
                opacity: 0.7
            });
            canvas.add(boundary);
        }

        const marginPx = MARGIN_CM * vScale;
        const gOpt = { stroke: '#1e293b', strokeWidth: 1, selectable: false, evented: false, opacity: 0.1 };
        for (let i = 0; i <= CLOTH_W; i += CLOTH_SCALE) canvas.add(new fabric.Line([offsetX + i * vScale, offsetY, offsetX + i * vScale, offsetY + CLOTH_H * vScale], gOpt));
        for (let i = 0; i <= CLOTH_H; i += CLOTH_SCALE) canvas.add(new fabric.Line([offsetX, offsetY + i * vScale, offsetX + CLOTH_W * vScale, offsetY + i * vScale], gOpt));
        canvas.requestRenderAll();
    };

    // Helper: Precision Polygon Intersection
    // Helper: Get Absolute Vertices for Fabric Polygon
    const getAbsPoints = (obj) => {
        const matrix = obj.calcTransformMatrix();
        const points = obj.get('points') || [];
        const offset = obj.pathOffset || { x: 0, y: 0 };
        return points.map(p => fabric.util.transformPoint({
            x: p.x - offset.x,
            y: p.y - offset.y
        }, matrix));
    };

    // Helper: Precision Polygon Intersection
    const isActuallyIntersecting = (polyA, polyB) => {
        const brA = polyA.getBoundingRect();
        const brB = polyB.getBoundingRect();

        // 1. Quick Bounding Box Check
        if (brA.left + brA.width < brB.left || brB.left + brB.width < brA.left ||
            brA.top + brA.height < brB.top || brB.top + brB.height < brA.top) {
            return false;
        }

        // 2. Get Absolute Vertices
        const ptsA = getAbsPoints(polyA);
        const ptsB = getAbsPoints(polyB);

        return ptsA.some(p => isPointInPoly(p, ptsB)) || ptsB.some(p => isPointInPoly(p, ptsA));
    };

    // Helper: Point in polygon check (used for irregular boundary checks)
    const isPointInPoly = (p, poly) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            if (((poly[i].y > p.y) !== (poly[j].y > p.y)) &&
                (p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)) {
                inside = !inside;
            }
        }
        return inside;
    };

    const handleRunOptimization = async () => {
        setOptimizing(true); setError(null); setOptimized(false);
        try {
            const duplicatedShapes = [];
            if (shapes && Array.isArray(shapes)) {
                shapes.forEach(s => {
                    const qty = s.quantity || 1;
                    for (let i = 0; i < qty; i++) {
                        duplicatedShapes.push({ id: `${s.id}_${i}`, points: s.cmPoints.map(p => [p.x, p.y]), originalId: s.id });
                    }
                });
            }
            const res = await axios.post('http://localhost:8000/optimize', {
                cloth_width: CLOTH_W,
                cloth_height: CLOTH_H,
                scale: 1,
                gap: 0.2,
                shapes: duplicatedShapes,
                boundary_points: nestingMode === 'irregular' ? clothConfig.boundaryPoints : null
            });
            const results = res.data.results;
            setOptimizationResults(results);
            setSelectedIndex(0);
            renderLayout(results[0]);
            setOptimized(true);
            setIsUserModified(false);
        } catch (err) {
            const msg = err.response?.data?.detail || err.message || "Unknown error";
            setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
        } finally { setOptimizing(false); }
    };

    const renderLayout = (data) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        drawGrid(canvas);
        const { vScale, offsetX, offsetY } = getGridParams();

        // 1. Draw Min-Cut Polygon/Rectangle
        if (clothConfig.boundaryPoints && data.min_cut_points) {
            const mcPoints = data.min_cut_points.map(pt => ({
                x: offsetX + pt[0] * vScale,
                y: offsetY + pt[1] * vScale
            }));
            const mcPoly = new fabric.Polygon(mcPoints, {
                fill: 'rgba(16, 185, 129, 0.05)',
                stroke: '#10b981', // Emerald 500
                strokeWidth: 2,
                strokeDashArray: [5, 5],
                selectable: false,
                evented: false,
                data: { type: 'min-cut' }
            });
            canvas.add(mcPoly);
        } else {
            // Standard rectangle for regular mode
            const minX = data.min_x * vScale + offsetX;
            const minY = data.min_y * vScale + offsetY;
            const rect = new fabric.Rect({
                left: minX, top: minY,
                width: data.used_width * vScale,
                height: data.used_height * vScale,
                fill: 'rgba(16, 185, 129, 0.02)',
                stroke: '#10b981', // Emerald 500
                strokeWidth: 2,
                strokeDashArray: [5, 5],
                selectable: false,
                data: { type: 'min-cut' }
            });
            canvas.add(rect);
        }

        const savedPos = [];
        data.packed.forEach(p => {
            const pts = p.points;
            const xs = pts.map(pt => pt[0]);
            const ys = pts.map(pt => pt[1]);
            const minXcm = Math.min(...xs);
            const minYcm = Math.min(...ys);

            const relativePoints = p.points.map(pt => ({
                x: (pt[0] - minXcm) * vScale,
                y: (pt[1] - minYcm) * vScale
            }));

            const poly = new fabric.Polygon(relativePoints, {
                left: minXcm * vScale + offsetX,
                top: minYcm * vScale + offsetY,
                originX: 'left', originY: 'top',
                fill: 'rgba(14, 165, 233, 0.6)',
                stroke: '#ffffff', strokeWidth: 1.5,
                selectable: false,
                evented: false,
                padding: 0,
                perPixelTargeting: true,
                data: { type: 'shape', id: p.id, cmArea: p.area || 0 }
            });

            canvas.add(poly);
            savedPos.push({ id: p.id, left: poly.left, top: poly.top, angle: poly.angle });
        });
        setOriginalPositions(savedPos);

        // Sync initial metrics from backend - VERY IMPORTANT for irregular mode
        setMetrics({
            totalClothArea: clothConfig.width * clothConfig.height, // fallback
            usedPieceArea: data.total_piece_area,
            minRectArea: data.min_cut_area,
            efficiency: data.efficiency,
            wastedArea: Math.max(0, data.min_cut_area - data.total_piece_area),
            usedWidth: data.used_width,
            usedHeight: data.used_height
        });

        recalcMetrics(canvas, data); // Force initial recalc with CURRENT data
        setLayout({
            items: data.packed.map(p => ({
                ...p,
                points: p.points.map(pt => ({ x: pt[0], y: pt[1] }))
            })),
            leftoverPolygons: data.leftover_polygons || [],
            metrics: {
                efficiency: data.efficiency,
                usedPieceArea: data.total_piece_area,
                minCutArea: data.min_cut_area,
                minCutPoints: data.min_cut_points
            }
        });
    };

    const recalcMetrics = (canvas, forceResult = null) => {
        if (!canvas) return;
        const { vScale, offsetX, offsetY } = getGridParams();
        const shapes = canvas.getObjects().filter(o => o.data?.type === 'shape');
        if (shapes.length === 0) return;

        let totalArea = 0;
        let cluster = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

        shapes.forEach(o => {
            totalArea += (o.data?.cmArea || 0);
            o.setCoords();
            const br = o.getBoundingRect();
            cluster.minX = Math.min(cluster.minX, br.left);
            cluster.maxX = Math.max(cluster.maxX, br.left + br.width);
            cluster.minY = Math.min(cluster.minY, br.top);
            cluster.maxY = Math.max(cluster.maxY, br.top + br.height);
        });

        const uwcm = (cluster.maxX - cluster.minX) / vScale;
        const uhcm = (cluster.maxY - cluster.minY) / vScale;
        
        let mcArea = uwcm * uhcm;
        let finalEfficiency = 0;

        // Sync with backend if the layout hasn't been modified by the user
        const currentResult = forceResult || optimizationResults[selectedIndex];
        
        // If not modified, prioritize backend values for perfect consistency
        if (currentResult && !isUserModified && !optimizing) {
            mcArea = currentResult.min_cut_area;
            finalEfficiency = currentResult.efficiency;
        } else {
            // Manual calculation for when pieces are moved
            finalEfficiency = mcArea > 0 ? (totalArea / mcArea * 100) : 0;
        }

        // Update Metrics State
        setMetrics(prev => ({
            ...prev,
            usedPieceArea: totalArea,
            minRectArea: mcArea,
            efficiency: finalEfficiency,
            wastedArea: Math.max(0, mcArea - totalArea),
            usedWidth: uwcm,
            usedHeight: uhcm
        }));

        // Update the Green Dashed Box
        const curBox = canvas.getObjects().find(o => o.data?.type === 'min-cut');
        if (curBox) {
            if (curBox instanceof fabric.Rect) {
                curBox.set({
                    left: cluster.minX,
                    top: cluster.minY,
                    width: Math.max(1, cluster.maxX - cluster.minX),
                    height: Math.max(1, cluster.maxY - cluster.minY)
                });
            } else {
                // If it's a polygon (from backend), we don't easily update its points real-time
                // but we can scale it or replace it with a rect during drag for feedback
            }
            curBox.setCoords();
        }

        const marginPx = MARGIN_CM * vScale;
        const limitX = offsetX + marginPx;
        const limitY = offsetY + marginPx;
        const limitR = offsetX + CLOTH_W * vScale - marginPx;
        const limitB = offsetY + CLOTH_H * vScale - marginPx;

        // If in irregular mode, we convert boundary points to canvas pixels for checks
        const boundaryPts = clothConfig.boundaryPoints ? clothConfig.boundaryPoints.map(p => ({
            x: offsetX + p[0] * vScale,
            y: offsetY + p[1] * vScale
        })) : null;

        if (shapes && Array.isArray(shapes)) {
            shapes.forEach(o => {
                o.set({ stroke: '#ffffff', strokeWidth: 1.5 });
                const absPts = getAbsPoints(o);

                let isOutOfBounds = false;
                if (boundaryPts) {
                    // Irregular mode: Check if all points of the piece are inside the boundary
                    isOutOfBounds = absPts.some(pt => !isPointInPoly(pt, boundaryPts));
                } else {
                    // Regular mode: Rectangle check
                    isOutOfBounds = absPts.some(pt =>
                        pt.x < limitX - 0.5 || pt.x > limitR + 0.5 ||
                        pt.y < limitY - 0.5 || pt.y > limitB + 0.5
                    );
                }

                if (isOutOfBounds) o.set({ stroke: '#ef4444', strokeWidth: 2 });
            });
        }

        // PRECISION POLYGON OVERLAP
        for (let i = 0; i < shapes.length; i++) {
            for (let j = i + 1; j < shapes.length; j++) {
                if (isActuallyIntersecting(shapes[i], shapes[j])) {
                    shapes[i].set({ stroke: '#ef4444', strokeWidth: 2 });
                    shapes[j].set({ stroke: '#ef4444', strokeWidth: 2 });
                }
            }
        }
        canvas.requestRenderAll();
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 text-white font-sans overflow-hidden">
            <div className="flex flex-1 overflow-hidden min-h-0">
                <div className="w-96 bg-slate-900 border-r border-slate-800 p-6 flex flex-col gap-4 overflow-y-auto shrink-0 shadow-xl">
                    <h2 className="text-xl font-bold mb-1">Optimization Dashboard</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Zero margin layout active</p>

                    <button onClick={handleRunOptimization} disabled={optimizing} className="w-full py-4 bg-sky-500 hover:bg-sky-400 font-black rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg active:scale-95 disabled:opacity-50">
                        {optimizing ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play className="w-5 h-5 fill-white" />}
                        {optimizing ? 'Calculating...' : 'Run Optimization'}
                    </button>

                    <div className="flex flex-col gap-2.5">
                        {optimizationResults.map((res, idx) => {
                            const isPartial = res.packed_count < res.total_requested;
                            return (
                                <button key={idx} onClick={() => { setSelectedIndex(idx); renderLayout(res); }}
                                    className={`p-4 rounded-2xl border-2 transition-all text-left ${selectedIndex === idx
                                        ? (isPartial ? 'border-rose-500 bg-rose-500/10' : 'border-sky-500 bg-sky-500/10')
                                        : (isPartial ? 'border-rose-500/30 hover:border-rose-500/50 bg-rose-500/5' : 'border-slate-800 hover:border-slate-700')
                                        }`}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none">{res.strategy}</span>
                                            {isPartial && (
                                                <span className="text-[9px] font-bold text-rose-400 uppercase tracking-tight">
                                                    Fits {res.packed_count}/{res.total_requested} pieces
                                                </span>
                                            )}
                                        </div>
                                        <span className={`text-sm font-black leading-none ${isPartial ? 'text-rose-400' : 'text-emerald-400'}`}>{res.efficiency}%</span>
                                    </div>
                                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${isPartial ? 'bg-rose-500' : 'bg-sky-500'}`} style={{ width: `${res.efficiency}%` }} />
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-semibold whitespace-pre-wrap"><AlertCircle className="w-3 h-3 inline mr-2" />{error}</div>}
                    <button onClick={onNext} disabled={!optimized} className="mt-auto py-4 bg-emerald-600 hover:bg-emerald-500 font-bold rounded-xl flex items-center justify-center gap-3 shadow-lg disabled:opacity-50">Continue <ArrowRight className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 flex items-center justify-center bg-slate-950 relative p-10">
                    <div className="bg-slate-900 rounded-[3rem] border border-slate-800 overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.7)] ring-1 ring-white/10" style={{ width: '800px', height: '600px' }}><canvas ref={canvasRef} /></div>
                </div>
            </div>

            <div className="h-28 bg-slate-900 border-t border-slate-800 px-12 flex items-center justify-between shrink-0 shadow-2xl">
                <div className="flex items-center gap-14 text-center">
                    <MetricBox label="Min Cut Area" value={`${metrics.minRectArea.toFixed(1)} cm²`} icon={<Scissors className="w-5 h-5 text-emerald-400" />} />
                    <MetricBox label="Piece Area" value={`${metrics.usedPieceArea.toFixed(1)} cm²`} icon={<Layers className="w-5 h-5 text-sky-400" />} />
                </div>
                <div className="flex flex-col items-center">
                    <div className="text-[11px] text-slate-500 uppercase font-black tracking-[0.3em] mb-1">Total Efficiency</div>
                    <div className="text-4xl font-black text-sky-400 tabular-nums tracking-tighter">{metrics.efficiency.toFixed(1)}<span className="text-2xl ml-1 text-sky-500/60">%</span></div>
                </div>
                <div className="flex items-center gap-14 text-center">
                    <MetricBox label="Wasted Area" value={`${metrics.wastedArea.toFixed(1)} cm²`} icon={<AlertCircle className="w-5 h-5 text-red-400" />} />
                    <MetricBox label="Cloth Size" value={`${metrics.totalClothArea.toLocaleString()} cm²`} icon={<Maximize2 className="w-5 h-5 text-slate-500" />} />
                </div>
            </div>
        </div>
    );
};

const MetricBox = ({ label, value, icon }) => (
    <div className="flex items-center gap-5">
        <div className="p-3.5 bg-slate-800 rounded-2xl border border-white/5 shadow-inner">{icon}</div>
        <div className="flex flex-col text-left">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.15em] mb-1.5">{label}</span>
            <span className="text-2xl font-bold tabular-nums text-white/95 leading-none">{value}</span>
        </div>
    </div>
);

export default Optimization;
