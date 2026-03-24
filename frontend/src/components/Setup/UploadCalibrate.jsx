import React, { useState, useRef, useEffect } from 'react';
import { Upload, Ruler, ChevronRight, RotateCcw, Layers, X, Plus, Trash2 } from 'lucide-react';
import * as fabric from 'fabric';
import axios from 'axios';

const UploadCalibrate = ({ clothConfig, onNext, setShapes: setGlobalShapes }) => {
    const [loading, setLoading] = useState(false);
    const [workflow, setWorkflow] = useState('upload'); // 'upload', 'calibration', 'library'
    const [currentPieceIndex, setCurrentPieceIndex] = useState(0);

    // Multi-point calibration state
    const [measurements, setMeasurements] = useState([]);
    const [currentMeasurement, setCurrentMeasurement] = useState({ points: [], label: '', realCm: '' });
    const [isAddingMeasurement, setIsAddingMeasurement] = useState(false);
    const isAddingRef = useRef(false);

    const [detectedShapes, setDetectedShapes] = useState([]);
    const [savedPieces, setSavedPieces] = useState([]);

    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const fabricCanvasRef = useRef(null);

    const CLOTH_W = clothConfig.width || 100;
    const CLOTH_H = clothConfig.height || 100;
    const GRID_SCALE = clothConfig.scale || 10;

    // Canvas initialization
    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;

        const canvas = new fabric.Canvas(canvasRef.current, {
            backgroundColor: '#0f172a',
            selection: false
        });
        fabricCanvasRef.current = canvas;

        const handleResize = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            // Fixed size: 800x600
            const width = 800;
            const height = 600;
            canvas.setDimensions({ width, height });
            renderCurrentView();
        };

        canvas.on('mouse:down', (opt) => {
            if (!isAddingRef.current) return;
            const pointer = canvas.getPointer(opt.e);
            setCurrentMeasurement(prev => {
                if (prev.points.length < 2) {
                    return { ...prev, points: [...prev.points, pointer] };
                }
                return prev;
            });
        });

        handleResize();

        return () => {
            canvas.dispose();
            fabricCanvasRef.current = null;
        };
    }, []);

    const getGridParams = () => {
        const padding = 60;
        const vScale = Math.min((800 - padding) / CLOTH_W, (600 - padding) / CLOTH_H);
        const offsetX = (800 - CLOTH_W * vScale) / 2;
        const offsetY = (600 - CLOTH_H * vScale) / 2;
        return { vScale, offsetX, offsetY };
    };

    useEffect(() => {
        renderCurrentView();
    }, [workflow, currentPieceIndex, detectedShapes, savedPieces, currentMeasurement, measurements, isAddingMeasurement]);

    const renderCurrentView = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        canvas.clear();
        canvas.set('backgroundColor', '#0f172a');

        if (workflow === 'calibration' && detectedShapes[currentPieceIndex]) {
            renderPieceForCalibration(canvas);
        } else if (workflow === 'library') {
            renderLibraryPieces(canvas);
        }

        canvas.requestRenderAll();
    };

    const renderPieceForCalibration = async (canvas) => {
        const piece = detectedShapes[currentPieceIndex];
        console.log("Rendering piece for calibration:", piece);

        if (!piece) {
            console.error("No piece at index", currentPieceIndex);
            return;
        }

        if (!piece.image) {
            console.error("Piece missing image data:", piece);
            return;
        }

        try {
            // Load piece image using Fabric v6 API
            const img = await fabric.FabricImage.fromURL(piece.image);

            if (!fabricCanvasRef.current) return;

            const w = canvas.width;
            const h = canvas.height;

            // Scale to fit 80% of canvas
            const scale = Math.min((w * 0.8) / img.width, (h * 0.8) / img.height);
            const offsetX = (w - img.width * scale) / 2;
            const offsetY = (h - img.height * scale) / 2;

            img.set({
                left: offsetX,
                top: offsetY,
                scaleX: scale,
                scaleY: scale,
                selectable: false,
                evented: false
            });

            canvas.add(img);
            canvas.pieceParams = { scale, offsetX, offsetY };

            // Render existing measurements
            measurements.forEach(m => {
                if (m.points.length === 2) {
                    const p1 = new fabric.Circle({
                        left: m.points[0].x, top: m.points[0].y, radius: 8, fill: '#10b981',
                        stroke: '#fff', strokeWidth: 2, originX: 'center', originY: 'center',
                        selectable: true, hasControls: false,
                        data: { type: 'calib-point', mid: m.id, pid: 0 }
                    });
                    const p2 = new fabric.Circle({
                        left: m.points[1].x, top: m.points[1].y, radius: 8, fill: '#10b981',
                        stroke: '#fff', strokeWidth: 2, originX: 'center', originY: 'center',
                        selectable: true, hasControls: false,
                        data: { type: 'calib-point', mid: m.id, pid: 1 }
                    });
                    const line = new fabric.Line([m.points[0].x, m.points[0].y, m.points[1].x, m.points[1].y], {
                        stroke: '#10b981', strokeWidth: 2, selectable: false, evented: false,
                        data: { type: 'calib-line', mid: m.id }
                    });
                    canvas.add(line, p1, p2);
                }
            });

            // Render current measurement in progress
            currentMeasurement.points.forEach((p, idx) => {
                canvas.add(new fabric.Circle({
                    left: p.x, top: p.y, radius: 8, fill: '#f43f5e',
                    stroke: '#fff', strokeWidth: 2, originX: 'center', originY: 'center',
                    selectable: true, hasControls: false,
                    data: { type: 'current-point', pid: idx }
                }));
            });

            if (currentMeasurement.points.length === 2) {
                canvas.add(new fabric.Line([
                    currentMeasurement.points[0].x, currentMeasurement.points[0].y,
                    currentMeasurement.points[1].x, currentMeasurement.points[1].y
                ], {
                    stroke: '#f43f5e', strokeWidth: 3, selectable: false, evented: false,
                    data: { type: 'current-line' }
                }));
            }

            // Sync dragging to state (Optimized: Visual only during move, state sync on modify)
            canvas.on('object:moving', (e) => {
                const obj = e.target;
                if (obj.data?.type === 'calib-point' || obj.data?.type === 'current-point') {
                    const mid = obj.data.mid;
                    const pid = obj.data.pid;
                    const type = obj.data.type;

                    // Find the corresponding line for visual feedback
                    const lineType = type === 'calib-point' ? 'calib-line' : 'current-line';
                    const line = canvas.getObjects().find(o =>
                        o.data?.type === lineType && (lineType === 'current-line' || o.data?.mid === mid)
                    );

                    if (line) {
                        if (pid === 0) {
                            line.set({ x1: obj.left, y1: obj.top });
                        } else {
                            line.set({ x2: obj.left, y2: obj.top });
                        }
                    }
                }
            });

            canvas.on('object:modified', (e) => {
                const obj = e.target;
                if (obj.data?.type === 'calib-point') {
                    const { mid, pid } = obj.data;
                    setMeasurements(prev => prev.map(m => {
                        if (m.id === mid) {
                            const newPoints = [...m.points];
                            newPoints[pid] = { x: obj.left, y: obj.top };
                            return { ...m, points: newPoints };
                        }
                        return m;
                    }));
                } else if (obj.data?.type === 'current-point') {
                    const { pid } = obj.data;
                    setCurrentMeasurement(prev => {
                        const newPoints = [...prev.points];
                        newPoints[pid] = { x: obj.left, y: obj.top };
                        return { ...prev, points: newPoints };
                    });
                }
            });

            canvas.requestRenderAll();
            console.log("Piece rendered successfully");
        } catch (error) {
            console.error("Failed to load piece image:", error);
        }
    };

    const renderLibraryPieces = (canvas) => {
        const w = canvas.width;
        const h = canvas.height;
        const padding = 40;

        // Arrange pieces in a simple grid for the library view
        if (savedPieces.length === 0) return;

        // Calculate total area or dimensions to estimate a better scale
        const totalW = savedPieces.reduce((sum, p) => sum + p.width + 10, 0);
        const totalH = savedPieces.reduce((sum, p) => sum + p.height + 15, 0);

        // Dynamic scale to fit: target ~150-200cm total width/height in 800x600 px
        // If many pieces, scale down more.
        const displayScale = Math.min(3, 800 / (Math.max(100, totalW / 2)), 600 / (Math.max(100, totalH / 2)));

        const offsetX = 40;
        const offsetY = 40;
        const columnGap = 10; // cm
        const rowGap = 25;    // cm (enough for labels)

        let currentX = 0;
        let currentY = 0;
        let maxHeightInRow = 0;
        const maxRowWidth = (800 - offsetX * 2) / displayScale;

        savedPieces.forEach((piece, idx) => {
            if (!piece.cmPoints) return;

            // Wrap if necessary
            if (currentX + piece.width > maxRowWidth && currentX > 0) {
                currentX = 0;
                currentY += maxHeightInRow + rowGap;
                maxHeightInRow = 0;
            }

            const gridPoints = piece.cmPoints.map(p => ({
                x: offsetX + (p.x + currentX) * displayScale,
                y: offsetY + (p.y + currentY) * displayScale
            }));

            // Draw Polygon
            const poly = new fabric.Polygon(gridPoints, {
                fill: 'rgba(16, 185, 129, 0.4)',
                stroke: '#10b981',
                strokeWidth: 2,
                selectable: false
            });
            canvas.add(poly);

            // Draw Label
            const label = new fabric.Text(`Piece ${idx + 1}`, {
                left: offsetX + (currentX + piece.width / 2) * displayScale,
                top: offsetY + (currentY + piece.height + 2) * displayScale,
                fontSize: Math.max(10, 12 * (displayScale / 4)),
                fill: '#94a3b8',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 'bold',
                originX: 'center',
                selectable: false
            });
            canvas.add(label);

            maxHeightInRow = Math.max(maxHeightInRow, piece.height);
            currentX += piece.width + columnGap;
        });
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true);

        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post('http://localhost:8000/upload', formData);
            console.log("Backend response:", res.data);

            if (res.data.shapes && res.data.shapes.length > 0) {
                console.log(`Detected ${res.data.shapes.length} shapes`);
                setDetectedShapes(res.data.shapes);
                setWorkflow('calibration');
                setCurrentPieceIndex(0);
                setMeasurements([]);
                setCurrentMeasurement({ points: [], label: '', realCm: '' });
            } else {
                alert("No pieces detected in the image.");
            }
        } catch (err) {
            console.error("Upload error:", err);
            alert("Detection failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCanvasClick = (pointer) => {
        if (currentMeasurement.points.length < 2) {
            setCurrentMeasurement(prev => ({
                ...prev,
                points: [...prev.points, pointer]
            }));
        }
    };

    const startNewMeasurement = () => {
        setIsAddingMeasurement(true);
        isAddingRef.current = true;
        setCurrentMeasurement({ points: [], label: '', realCm: '' });
    };

    const saveMeasurement = () => {
        if (currentMeasurement.points.length !== 2 || !currentMeasurement.label || !currentMeasurement.realCm) {
            alert("Please complete the measurement (2 points, label, and distance)");
            return;
        }

        setMeasurements([...measurements, {
            id: Date.now(),
            ...currentMeasurement
        }]);
        setCurrentMeasurement({ points: [], label: '', realCm: '' });
        setIsAddingMeasurement(false);
        isAddingRef.current = false;
    };

    const deleteMeasurement = (id) => {
        setMeasurements(measurements.filter(m => m.id !== id));
    };

    const savePieceAndContinue = () => {
        if (measurements.length === 0) {
            alert("Please add at least one measurement");
            return;
        }

        const piece = detectedShapes[currentPieceIndex];
        const canvas = fabricCanvasRef.current;
        const pScale = canvas.pieceParams.scale;

        // Calculate average scale from all measurements
        const scales = measurements.map(m => {
            const distPx = Math.sqrt(
                Math.pow(m.points[1].x - m.points[0].x, 2) +
                Math.pow(m.points[1].y - m.points[0].y, 2)
            );
            return (distPx / pScale) / parseFloat(m.realCm);
        });
        const avgScale = scales.reduce((a, b) => a + b, 0) / scales.length;

        console.log("Average scale:", avgScale, "from", scales);

        // Convert piece points to CM
        const cmPoints = piece.points.map(p => ({
            x: (p[0] - piece.bbox.x) / avgScale,
            y: (p[1] - piece.bbox.y) / avgScale
        }));

        const savedPiece = {
            id: `piece_${Date.now()}`,
            name: `Piece ${currentPieceIndex + 1}`,
            cmPoints: cmPoints,
            width: piece.bbox.w / avgScale,
            height: piece.bbox.h / avgScale,
            measurements: measurements,
            quantity: 1
        };

        setSavedPieces([...savedPieces, savedPiece]);

        // Move to next piece or library
        if (currentPieceIndex < detectedShapes.length - 1) {
            setCurrentPieceIndex(currentPieceIndex + 1);
            setMeasurements([]);
            setCurrentMeasurement({ points: [], label: '', realCm: '' });
            setIsAddingMeasurement(false);
            isAddingRef.current = false;
        } else {
            setWorkflow('library');
        }
    };

    const deleteSavedPiece = (id) => {
        setSavedPieces(savedPieces.filter(p => p.id !== id));
    };

    return (
        <div className="flex h-full bg-slate-950 text-white font-sans overflow-hidden">
            {/* Sidebar */}
            <div className="w-96 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl">
                <div className="p-6 border-b border-slate-800">
                    <h2 className="text-xl font-black flex items-center gap-2">
                        <Ruler className="text-sky-500 w-5 h-5" /> CALIBRATION
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Multi-Point Measurement</p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {workflow === 'upload' && (
                        <label className="block cursor-pointer group">
                            <div className="p-12 border-2 border-dashed border-slate-700 rounded-3xl flex flex-col items-center gap-4 group-hover:border-sky-500/50 bg-slate-800/20 transition-all">
                                <Upload className="w-8 h-8 text-sky-500" />
                                <span className="text-sm font-bold opacity-60">Upload Pattern Scan</span>
                                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </div>
                        </label>
                    )}

                    {workflow === 'calibration' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black bg-sky-500/10 text-sky-400 px-3 py-1 rounded-full">
                                    PIECE {currentPieceIndex + 1} OF {detectedShapes.length}
                                </span>
                            </div>

                            {/* Measurements List */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-black text-slate-400 uppercase">Measurements</h3>
                                {measurements.map(m => (
                                    <div key={m.id} className="bg-slate-800/50 p-3 rounded-xl flex items-center justify-between border border-emerald-500/20">
                                        <div>
                                            <div className="text-xs font-bold text-emerald-400">{m.label}</div>
                                            <div className="text-[10px] text-slate-500">{m.realCm} cm</div>
                                        </div>
                                        <button onClick={() => deleteMeasurement(m.id)} className="text-slate-500 hover:text-rose-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Add Measurement */}
                            {!isAddingMeasurement ? (
                                <button
                                    onClick={startNewMeasurement}
                                    className="w-full bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all"
                                >
                                    <Plus className="w-4 h-4" /> Add Measurement
                                </button>
                            ) : (
                                <div className="bg-slate-800/50 p-4 rounded-2xl border border-sky-500/30 space-y-3">
                                    <h3 className="text-xs font-black uppercase text-sky-400">New Measurement</h3>
                                    <p className="text-[10px] text-slate-400">Click 2 points on the piece</p>

                                    <select
                                        value={currentMeasurement.label}
                                        onChange={(e) => setCurrentMeasurement({ ...currentMeasurement, label: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"

                                    >
                                        <option value="">Select Label</option>
                                        <option value="Height">Height</option>
                                        <option value="Width">Width</option>
                                        <option value="Top Width">Top Width</option>
                                        <option value="Bottom Width">Bottom Width</option>
                                        <option value="Sleeve Length">Sleeve Length</option>
                                        <option value="Custom">Custom</option>
                                    </select>

                                    <input
                                        type="number"
                                        placeholder="Distance in CM"
                                        value={currentMeasurement.realCm}
                                        onChange={(e) => setCurrentMeasurement({ ...currentMeasurement, realCm: e.target.value })}

                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none"
                                    />

                                    <div className="flex gap-2">
                                        <button
                                            onClick={saveMeasurement}
                                            disabled={currentMeasurement.points.length < 2 || !currentMeasurement.label || !currentMeasurement.realCm}
                                            className="flex-1 bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 py-3 rounded-xl font-black uppercase text-xs"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsAddingMeasurement(false);
                                                isAddingRef.current = false;
                                                setCurrentMeasurement({ points: [], label: '', realCm: '' });
                                            }}
                                            className="px-4 bg-slate-700 hover:bg-slate-600 py-3 rounded-xl"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Save Piece Button */}
                            <button
                                onClick={savePieceAndContinue}
                                disabled={measurements.length === 0}
                                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 py-4 rounded-xl font-black uppercase text-xs transition-all flex items-center justify-center gap-2"
                            >
                                Save Piece & Continue <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {workflow === 'library' && (
                        <div className="space-y-4">
                            <h3 className="text-xs font-black text-slate-400 uppercase">Calibrated Pieces</h3>
                            {savedPieces.map((piece, idx) => (
                                <div key={piece.id} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-2xl">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-black text-sm">{piece.name}</div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="text-[10px] text-emerald-400 font-bold">
                                                    {piece.width.toFixed(1)} × {piece.height.toFixed(1)} cm
                                                </div>
                                                <button
                                                    onClick={() => deleteSavedPiece(piece.id)}
                                                    className="text-slate-500 hover:text-rose-500 transition-colors"
                                                    title="Delete Piece"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex items-center bg-slate-950 rounded-lg p-1 border border-slate-700">
                                            <button
                                                onClick={() => {
                                                    const newPieces = [...savedPieces];
                                                    newPieces[idx].quantity = Math.max(1, (newPieces[idx].quantity || 1) - 1);
                                                    setSavedPieces(newPieces);
                                                }}
                                                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white"
                                            >-</button>
                                            <span className="w-8 text-center text-xs font-black">{piece.quantity || 1}</span>
                                            <button
                                                onClick={() => {
                                                    const newPieces = [...savedPieces];
                                                    newPieces[idx].quantity = (newPieces[idx].quantity || 1) + 1;
                                                    setSavedPieces(newPieces);
                                                }}
                                                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white"
                                            >+</button>
                                        </div>
                                    </div>
                                    <div className="text-[9px] text-slate-500 mt-2">
                                        {piece.measurements.length} measurements
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-slate-800">
                    <button
                        disabled={savedPieces.length === 0}
                        onClick={() => { setGlobalShapes(savedPieces); onNext(); }}
                        className={`w-full py-5 rounded-3xl font-black uppercase text-xs flex items-center justify-center gap-3 ${savedPieces.length > 0 ? 'bg-emerald-500 text-white shadow-2xl' : 'bg-slate-800 text-slate-600'
                            }`}
                    >
                        Optimize Layout <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 flex items-center justify-center p-8 bg-slate-950" ref={containerRef}>
                <div className="relative bg-slate-900 rounded-3xl border-2 border-slate-800 shadow-2xl overflow-hidden" style={{ width: '800px', height: '600px' }}>
                    <canvas ref={canvasRef} />

                    {isAddingMeasurement && currentMeasurement.points.length < 2 && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none">
                            <div className="bg-slate-950/90 backdrop-blur border border-white/10 text-white px-6 py-2 rounded-full font-black text-[10px] uppercase tracking-wider flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                Click Point {currentMeasurement.points.length + 1} of 2
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl flex flex-col items-center justify-center gap-6">
                            <div className="w-12 h-12 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin"></div>
                            <p className="text-[10px] font-black text-sky-400 uppercase tracking-[0.4em] animate-pulse">Extracting Pieces</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UploadCalibrate;
