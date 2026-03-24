import React, { useState, useRef, useEffect } from 'react';
import { Upload, Ruler, ChevronRight, RotateCcw, Layers, X, Plus, Trash2 } from 'lucide-react';
import * as fabric from 'fabric';
import axios from 'axios';

const UploadCalibrate = ({ clothConfig, onNext, setShapes: setGlobalShapes }) => {
    const [loading, setLoading] = useState(false);
    const [workflow, setWorkflow] = useState('upload'); // 'upload', 'dimensions', 'library'
    
    // Detection State
    const [detectedShapes, setDetectedShapes] = useState([]);
    const [savedPieces, setSavedPieces] = useState([]);
    const [imageNaturalSize, setImageNaturalSize] = useState({ w: 0, h: 0 });

    // User Input Dimensions
    const [globalWidthCm, setGlobalWidthCm] = useState(100);
    const [globalHeightCm, setGlobalHeightCm] = useState(150);

    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);

    // Arranges pieces in a simple grid for the library view
    const renderLibraryPieces = (canvas) => {
        const w = canvas.width;
        const h = canvas.height;
        const padding = 40;

        if (savedPieces.length === 0) return;

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
            // Get Image Natural Dimensions First
            const imgObj = new Image();
            imgObj.src = URL.createObjectURL(file);
            await new Promise(resolve => {
                imgObj.onload = () => {
                    setImageNaturalSize({ w: imgObj.naturalWidth, h: imgObj.naturalHeight });
                    resolve();
                };
            });

            // Send to Backend for Shape Detection
            const res = await axios.post('http://localhost:8000/upload', formData);
            console.log("Backend response:", res.data);

            if (res.data.shapes && res.data.shapes.length > 0) {
                setDetectedShapes(res.data.shapes);
                setWorkflow('dimensions');
            } else {
                alert("No pieces detected in the image.");
            }
        } catch (error) {
            console.error("Detection failed:", error);
            alert("Detection failed: " + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleCalculateDimensions = () => {
        if (!globalWidthCm || !globalHeightCm || globalWidthCm <= 0 || globalHeightCm <= 0) {
            alert("Please enter valid width and height dimensions.");
            return;
        }

        const scaleX = globalWidthCm / imageNaturalSize.w;
        const scaleY = globalHeightCm / imageNaturalSize.h;
        
        const autoScaled = detectedShapes.map(s => {
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
                name: `Piece ${savedPieces.length + 1}`,
                cmPoints: normalizedPoints,
                width: maxX - minX,
                height: maxY - minY,
                image: s.image,
                quantity: 1
            };
        });
        
        setSavedPieces(autoScaled);
        setWorkflow('library');
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

        if (workflow === 'dimensions') {
            const tempPiece = detectedShapes[0];
            if (tempPiece) {
                // Just display a nice prompt on the canvas
                const promptText = new fabric.Text("DETECTED PATTERNS SUCCESSFULLY\n\nPlease enter the total Width and Height\nof your image in the sidebar.", {
                    left: 400,
                    top: 300,
                    fontSize: 24,
                    fill: '#38bdf8',
                    originX: 'center',
                    originY: 'center',
                    textAlign: 'center',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 'bold',
                    lineHeight: 1.5
                });
                canvas.add(promptText);
            }
        } else if (workflow === 'library') {
            renderLibraryPieces(canvas);
        }

        return () => canvas.dispose();
    }, [workflow, detectedShapes, savedPieces]);

    return (
        <div className="flex h-full bg-slate-950 text-white font-sans overflow-hidden">
            {/* Sidebar Control */}
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

                    {workflow === 'upload' && (
                        <div className="space-y-6">
                            <h3 className="text-[10px] font-black uppercase text-sky-400 tracking-[0.2em] mb-1">1. Upload Pattern Image</h3>
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

                    {workflow === 'dimensions' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[10px] font-black uppercase text-amber-400 tracking-[0.2em]">2. Enter Image Dimensions</h3>
                                <div className="text-[10px] font-black text-slate-500 bg-slate-800 px-3 py-1 rounded-full">{detectedShapes.length} Pieces Found</div>
                            </div>
                            
                            <div className="p-5 bg-amber-500/5 rounded-3xl border border-amber-500/20 space-y-6 shadow-inner ring-1 ring-amber-500/10">
                                <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wide leading-relaxed">
                                    Please provide the total physical width and height (in CM) of the uploaded image to automatically scale all {detectedShapes.length} detected patterns.
                                </p>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-amber-500 uppercase ml-1">Total Width (cm)</label>
                                        <input 
                                            type="number" 
                                            value={globalWidthCm} 
                                            onChange={(e) => setGlobalWidthCm(Number(e.target.value))}
                                            className="w-full bg-slate-900 border border-amber-500/30 rounded-2xl px-4 py-3 text-sm font-bold focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all text-amber-50"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-amber-500 uppercase ml-1">Total Height (cm)</label>
                                        <input 
                                            type="number" 
                                            value={globalHeightCm} 
                                            onChange={(e) => setGlobalHeightCm(Number(e.target.value))}
                                            className="w-full bg-slate-900 border border-amber-500/30 rounded-2xl px-4 py-3 text-sm font-bold focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none transition-all text-amber-50"
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleCalculateDimensions}
                                    className="w-full py-4 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-xl shadow-amber-500/20 transition-all active:scale-95"
                                >
                                    Calculate Dimensions <Ruler className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {workflow === 'library' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-black uppercase text-emerald-400 tracking-[0.2em]">3. Captured Layouts</h3>
                                <button onClick={() => setWorkflow('upload')} className="text-[10px] font-black text-sky-400 hover:text-sky-300 uppercase tracking-widest">Rescan +</button>
                            </div>

                            <div className="space-y-3">
                                {savedPieces.map((piece, idx) => (
                                    <div key={idx} className="group p-4 bg-slate-950/50 rounded-2xl border border-white/5 flex items-center gap-4 hover:bg-slate-900 transition-all">
                                        <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                                            {piece.image ? <img src={piece.image} alt="" className="max-w-[80%] max-h-[80%] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" /> : <Layers className="w-6 h-6 text-slate-700" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="text-xs font-black text-white truncate">Piece {idx + 1}</div>
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-bold tabular-nums">
                                                {piece.width.toFixed(1)} x {piece.height.toFixed(1)} cm
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center bg-slate-950 rounded-lg p-1 border border-slate-700 opacity-0 group-hover:opacity-100 transition-all mr-2">
                                            <button
                                                onClick={() => {
                                                    const newPieces = [...savedPieces];
                                                    newPieces[idx].quantity = Math.max(1, (newPieces[idx].quantity || 1) - 1);
                                                    setSavedPieces(newPieces);
                                                }}
                                                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white"
                                            >-</button>
                                            <span className="w-6 text-center text-xs font-black">{piece.quantity || 1}</span>
                                            <button
                                                onClick={() => {
                                                    const newPieces = [...savedPieces];
                                                    newPieces[idx].quantity = (newPieces[idx].quantity || 1) + 1;
                                                    setSavedPieces(newPieces);
                                                }}
                                                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white"
                                            >+</button>
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
