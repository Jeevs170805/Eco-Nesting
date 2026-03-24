import React, { useState, useRef, useEffect } from 'react';
import { Upload, Ruler, ChevronRight, RotateCcw, Layers, X, Plus, Trash2 } from 'lucide-react';
import * as fabric from 'fabric';
import axios from 'axios';

const UploadCalibrate = ({ clothConfig, onNext, setShapes: setGlobalShapes }) => {
    const [loading, setLoading] = useState(false);
    const [workflow, setWorkflow] = useState('upload'); // 'upload', 'calibrate', 'library'
    const [currentPieceIndex, setCurrentPieceIndex] = useState(0);
    const [detectedShapes, setDetectedShapes] = useState([]);
    const [savedPieces, setSavedPieces] = useState([]);

    const SIZE_SCALES = {
        'S': { scale: 1.00, w: 65, h: 90 },
        'M': { scale: 1.08, w: 70.2, h: 97.2 },
        'L': { scale: 1.16, w: 75.4, h: 104.4 },
        'XL': { scale: 1.24, w: 80.6, h: 111.6 },
        'XXL': { scale: 1.32, w: 85.8, h: 118.8 }
    };

    // Automated Calibration State
    const [selectedSize, setSelectedSize] = useState('M');
    const [imgWidthCm, setImgWidthCm] = useState(SIZE_SCALES['M'].w);
    const [imgHeightCm, setImgHeightCm] = useState(SIZE_SCALES['M'].h);
    
    // Manual Calibration Fallback State
    const [measurements, setMeasurements] = useState([]);
    const [currentMeasurement, setCurrentMeasurement] = useState({ points: [], value: 10 });
    const [isAddingMeasurement, setIsAddingMeasurement] = useState(false);

    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);

    // Arranges pieces in a simple grid for the library view
    const renderLibraryPieces = (canvas) => {
        const w = canvas.width;
        const h = canvas.height;
        const padding = 40;

        if (savedPieces.length === 0) return;

        // Bounding box logic to fit all pieces in view
        let totalW = 0;
        let totalH = 0;
        savedPieces.forEach(p => {
            totalW += p.width + 10;
            totalH = Math.max(totalH, p.height + 25);
        });

        const displayScale = Math.min(2.5, (w - padding * 2) / Math.max(100, totalW / 2), (h - padding * 2) / Math.max(100, totalH));

        const offsetX = 40;
        const offsetY = 60;
        const columnGap = 15;
        const rowGap = 35;

        let currentX = 0;
        let currentY = 0;
        let maxHeightInRow = 0;
        const maxRowWidth = (canvas.width - offsetX * 2) / displayScale;

        savedPieces.forEach((piece, idx) => {
            if (!piece.cmPoints) return;

            if (currentX + piece.width > maxRowWidth && currentX > 0) {
                currentX = 0;
                currentY += maxHeightInRow + rowGap;
                maxHeightInRow = 0;
            }

            const gridPoints = piece.cmPoints.map(p => ({
                x: offsetX + (p.x + currentX) * displayScale,
                y: offsetY + (p.y + currentY) * displayScale
            }));

            const poly = new fabric.Polygon(gridPoints, {
                fill: 'rgba(14, 165, 233, 0.2)',
                stroke: '#0ea5e9',
                strokeWidth: 2,
                selectable: false
            });
            canvas.add(poly);

            // Label
            const label = new fabric.Text(`${piece.width.toFixed(1)}x${piece.height.toFixed(1)}cm`, {
                left: offsetX + (currentX + piece.width / 2) * displayScale,
                top: offsetY + (currentY + piece.height + 8) * displayScale,
                fontSize: 12,
                fill: '#94a3b8',
                originX: 'center',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 'bold'
            });
            canvas.add(label);

            // Size Badge
            const sizeBadge = new fabric.Text(piece.sizeLabel || 'M', {
                left: offsetX + (currentX + piece.width / 2) * displayScale,
                top: offsetY + currentY * displayScale - 12,
                fontSize: 10,
                fill: '#ffffff',
                backgroundColor: '#0ea5e9',
                originX: 'center',
                fontFamily: 'Inter, sans-serif',
                fontWeight: '900',
                padding: 4
            });
            canvas.add(sizeBadge);

            currentX += piece.width + columnGap;
            maxHeightInRow = Math.max(maxHeightInRow, piece.height);
        });
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            // Get Image Natural Dimensions
            const imgObj = new Image();
            imgObj.src = URL.createObjectURL(file);
            await new Promise(resolve => {
                imgObj.onload = () => resolve();
            });

            const res = await axios.post('http://localhost:8000/upload', formData);
            console.log("Backend response:", res.data);

            if (res.data.shapes && res.data.shapes.length > 0) {
                setDetectedShapes(res.data.shapes);
                
                // AUTOMATED CALIBRATION LOGIC
                if (imgWidthCm > 0 && imgHeightCm > 0) {
                    const scaleX = imgWidthCm / imgObj.naturalWidth;
                    const scaleY = imgHeightCm / imgObj.naturalHeight;
                    
                    const autoScaled = res.data.shapes.map(s => {
                        const cmPoints = s.points.map(pt => ({ x: pt[0] * scaleX, y: pt[1] * scaleY }));
                        const xs = cmPoints.map(p => p.x);
                        const ys = cmPoints.map(p => p.y);
                        const minX = Math.min(...xs);
                        const maxX = Math.max(...xs);
                        const minY = Math.min(...ys);
                        const maxY = Math.max(...ys);
                        
                        // Shift to origin for library-view storage
                        const normalizedPoints = cmPoints.map(p => ({ x: p.x - minX, y: p.y - minY }));
                        
                        return {
                            id: s.id,
                            cmPoints: normalizedPoints,
                            width: maxX - minX,
                            height: maxY - minY,
                            image: s.image,
                            sizeLabel: selectedSize
                        };
                    });
                    
                    setSavedPieces(autoScaled);
                    setWorkflow('library');
                } else {
                    setWorkflow('calibrate');
                }
            }
        } catch (error) {
            console.error("Detection failed:", error);
            alert("Detection failed: " + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
    };

    const deletePiece = (idx) => {
        const newPieces = [...savedPieces];
        newPieces.splice(idx, 1);
        setSavedPieces(newPieces);
    };

    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        const canvas = new fabric.Canvas(canvasRef.current, {
            width: 800,
            height: 600,
            backgroundColor: '#0f172a',
            selection: false
        });

        if (workflow === 'calibrate' && detectedShapes.length > 0) {
            renderPieceForCalibration(canvas, detectedShapes[currentPieceIndex]);
        } else if (workflow === 'library') {
            renderLibraryPieces(canvas);
        }

        return () => canvas.dispose();
    }, [workflow, detectedShapes, currentPieceIndex, savedPieces, isAddingMeasurement, currentMeasurement]);

    const renderPieceForCalibration = (canvas, piece) => {
        if (!piece) return;
        canvas.clear();
        canvas.backgroundColor = '#0f172a';

        const padding = 60;
        const scale = Math.min((800 - padding) / piece.bbox.w, (600 - padding) / piece.bbox.h);
        const offsetX = (800 - piece.bbox.w * scale) / 2;
        const offsetY = (600 - piece.bbox.h * scale) / 2;

        const points = piece.points.map(p => ({
            x: (p[0] - piece.bbox.x) * scale + offsetX,
            y: (p[1] - piece.bbox.y) * scale + offsetY
        }));

        const poly = new fabric.Polygon(points, {
            fill: 'rgba(14, 165, 233, 0.4)',
            stroke: '#0ea5e9',
            strokeWidth: 2,
            selectable: false,
            evented: false
        });
        canvas.add(poly);

        measurements.forEach(m => {
            const p1 = { x: (m.points[0].x - piece.bbox.x) * scale + offsetX, y: (m.points[0].y - piece.bbox.y) * scale + offsetY };
            const p2 = { x: (m.points[1].x - piece.bbox.x) * scale + offsetX, y: (m.points[1].y - piece.bbox.y) * scale + offsetY };
            canvas.add(new fabric.Line([p1.x, p1.y, p2.x, p2.y], { stroke: '#fbbf24', strokeWidth: 3 }));
            canvas.add(new fabric.Circle({ left: p1.x, top: p1.y, radius: 6, fill: '#fbbf24', originX: 'center', originY: 'center' }));
            canvas.add(new fabric.Circle({ left: p2.x, top: p2.y, radius: 6, fill: '#fbbf24', originX: 'center', originY: 'center' }));
        });

        if (isAddingMeasurement && currentMeasurement.points.length > 0) {
            const p1 = { x: (currentMeasurement.points[0].x - piece.bbox.x) * scale + offsetX, y: (currentMeasurement.points[0].y - piece.bbox.y) * scale + offsetY };
            canvas.add(new fabric.Circle({ left: p1.x, top: p1.y, radius: 6, fill: '#ef4444', originX: 'center', originY: 'center' }));
        }

        canvas.on('mouse:down', (opt) => {
            if (!isAddingMeasurement) return;
            const pointer = canvas.getPointer(opt.e);
            const imgX = (pointer.x - offsetX) / scale + piece.bbox.x;
            const imgY = (pointer.y - offsetY) / scale + piece.bbox.y;

            if (currentMeasurement.points.length === 0) {
                setCurrentMeasurement({ ...currentMeasurement, points: [{ x: imgX, y: imgY }] });
            } else {
                const newM = { ...currentMeasurement, points: [...currentMeasurement.points, { x: imgX, y: imgY }] };
                setMeasurements([...measurements, newM]);
                setCurrentMeasurement({ points: [], value: 10 });
                setIsAddingMeasurement(false);
            }
        });
    };

    const savePieceAndContinue = () => {
        if (measurements.length === 0) return;
        const piece = detectedShapes[currentPieceIndex];
        const scales = measurements.map(m => {
            const dx = m.points[1].x - m.points[0].x;
            const dy = m.points[1].y - m.points[0].y;
            const pxDist = Math.sqrt(dx * dx + dy * dy);
            return m.value / pxDist;
        });
        const avgScale = scales.reduce((a, b) => a + b, 0) / scales.length;
        const cmPoints = piece.points.map(p => ({ x: (p[0] - piece.bbox.x) * avgScale, y: (p[1] - piece.bbox.y) * avgScale }));
        const newPiece = { id: piece.id, cmPoints: cmPoints, width: piece.bbox.w * avgScale, height: piece.bbox.h * avgScale, image: piece.image, sizeLabel: selectedSize };
        setSavedPieces([...savedPieces, newPiece]);
        if (currentPieceIndex < detectedShapes.length - 1) { setCurrentPieceIndex(currentPieceIndex + 1); setMeasurements([]); }
        else setWorkflow('library');
    };

    return (
        <div className="flex h-full bg-slate-950 text-white font-sans overflow-hidden">
            <div className="w-96 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 shadow-2xl relative z-10">
                <div className="p-8 border-b border-slate-800">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                            <Layers className="text-sky-400 w-6 h-6" />
                        </div>
                        <h1 className="text-2xl font-black tracking-tight text-white">Pattern Setup</h1>
                    </div>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-none">Automated Calibration & Digitization</p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {/* Size & Dimension Config */}
                    <div className="p-5 bg-slate-950/50 rounded-3xl border border-white/5 space-y-5 shadow-inner ring-1 ring-white/5">
                        <h3 className="text-[10px] font-black uppercase text-sky-400 tracking-[0.2em] mb-1">1. Pattern Configuration</h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Width (cm)</label>
                                <input 
                                    type="number" 
                                    value={imgWidthCm} 
                                    onChange={(e) => setImgWidthCm(Number(e.target.value))}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Height (cm)</label>
                                <input 
                                    type="number" 
                                    value={imgHeightCm} 
                                    onChange={(e) => setImgHeightCm(Number(e.target.value))}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Select Size</label>
                            <div className="flex gap-1 bg-slate-900 p-1 rounded-2xl border border-white/5">
                                {['S', 'M', 'L', 'XL', 'XXL'].map(size => (
                                    <button
                                        key={size}
                                        onClick={() => {
                                            setSelectedSize(size);
                                            setImgWidthCm(SIZE_SCALES[size].w);
                                            setImgHeightCm(SIZE_SCALES[size].h);
                                        }}
                                        className={`flex-1 py-1.5 text-[10px] font-black rounded-xl transition-all ${
                                            selectedSize === size ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {workflow === 'upload' && (
                        <div className="space-y-6">
                            <h3 className="text-[10px] font-black uppercase text-sky-400 tracking-[0.2em] mb-1">2. Upload Pattern Image</h3>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full group relative aspect-square bg-slate-800/30 border-2 border-dashed border-slate-700/50 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 hover:border-sky-500/50 hover:bg-sky-500/5 transition-all overflow-hidden active:scale-95 shadow-xl"
                            >
                                <div className="p-6 rounded-3xl bg-slate-800 border border-slate-700 group-hover:bg-sky-500 group-hover:border-sky-400 group-hover:scale-110 transition-all shadow-xl">
                                    <Upload className="w-8 h-8 text-sky-400 group-hover:text-white" />
                                </div>
                                <div className="text-center">
                                    <div className="text-sm font-black text-white mb-1">Click to Select Patterns</div>
                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Automatic Detection Active</div>
                                </div>
                                <input type="file" ref={fileInputRef} onChange={handleImageUpload} hidden accept="image/*" />
                            </button>
                        </div>
                    )}

                    {(workflow === 'calibrate' || workflow === 'library') && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-black uppercase text-emerald-400 tracking-[0.2em]">Captured Layouts</h3>
                                <button onClick={() => setWorkflow('upload')} className="text-[10px] font-black text-sky-400 hover:text-sky-300 uppercase tracking-widest">Rescan +</button>
                            </div>

                            <div className="space-y-3">
                                {savedPieces.map((piece, idx) => (
                                    <div key={idx} className="group p-4 bg-slate-950/50 rounded-2xl border border-white/5 flex items-center gap-4 hover:bg-slate-900 transition-all">
                                        <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                                            {piece.image ? <img src={piece.image} alt="" className="max-w-[80%] max-h-[80%] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" /> : <Layers className="w-6 h-6 text-slate-700" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="text-xs font-black text-white truncate">Piece {idx + 1}</div>
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-sky-500 text-white font-black leading-none">{piece.sizeLabel}</span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-bold tabular-nums">
                                                {piece.width.toFixed(1)} x {piece.height.toFixed(1)} cm
                                            </div>
                                        </div>
                                        <button onClick={() => deletePiece(idx)} className="p-2.5 rounded-xl text-slate-600 hover:text-rose-500 hover:bg-rose-500/5 transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-8 border-t border-slate-800 bg-slate-900/50">
                    <button
                        disabled={savedPieces.length === 0}
                        onClick={() => { setGlobalShapes(savedPieces); onNext(); }}
                        className={`w-full py-5 rounded-3xl font-black uppercase text-xs flex items-center justify-center gap-3 transition-all ${savedPieces.length > 0 ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-2xl shadow-sky-500/20 active:scale-95' : 'bg-slate-800 text-slate-600'
                            }`}
                    >
                        Optimize Layout <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-8 bg-slate-950 relative" ref={containerRef}>
                <div className="relative bg-slate-900 rounded-[3rem] border-2 border-slate-800 shadow-[0_0_80px_rgba(0,0,0,0.5)] overflow-hidden" style={{ width: '800px', height: '600px' }}>
                    <canvas ref={canvasRef} />
                    {loading && (
                        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl flex flex-col items-center justify-center gap-6">
                            <div className="w-16 h-16 border-4 border-sky-500/10 border-t-sky-500 rounded-full animate-spin"></div>
                            <div className="flex flex-col items-center gap-2">
                                <p className="text-xl font-black text-white tracking-[0.2em] uppercase italic">Digitalizing</p>
                                <p className="text-[10px] font-black text-sky-400 uppercase tracking-[0.4em] animate-pulse">Patterns Detected: {detectedShapes.length}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UploadCalibrate;
