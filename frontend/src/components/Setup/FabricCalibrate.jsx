import React, { useState, useRef, useEffect } from 'react';
import { Upload, Ruler, ChevronRight, X, Plus, Trash2 } from 'lucide-react';
import * as fabric from 'fabric';
import axios from 'axios';

const FabricCalibrate = ({ onNext }) => {
    const [loading, setLoading] = useState(false);
    const [fabricData, setFabricData] = useState(null); // id, points, bbox, image
    const [measurement, setMeasurement] = useState({ points: [], realCm: '' });
    const [isCalibrating, setIsCalibrating] = useState(false);

    const canvasRef = useRef(null);
    const fabricCanvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvas = new fabric.Canvas(canvasRef.current, {
            backgroundColor: '#0f172a',
            selection: false
        });
        fabricCanvasRef.current = canvas;

        canvas.on('mouse:down', (opt) => {
            if (!isCalibrating) return;
            const pointer = canvas.getPointer(opt.e);
            setMeasurement(prev => {
                if (prev.points.length < 2) {
                    return { ...prev, points: [...prev.points, pointer] };
                }
                return prev;
            });
        });

        return () => canvas.dispose();
    }, [isCalibrating]);

    useEffect(() => {
        if (fabricData) {
            renderFabric();
        }
    }, [fabricData, measurement]);

    const renderFabric = async () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        canvas.clear();
        canvas.set('backgroundColor', '#0f172a');

        try {
            const img = await fabric.FabricImage.fromURL(fabricData.image);
            const w = canvas.width;
            const h = canvas.height;
            const scale = Math.min((w * 0.8) / img.width, (h * 0.8) / img.height);
            const offsetX = (w - img.width * scale) / 2;
            const offsetY = (h - img.height * scale) / 2;

            img.set({
                left: offsetX, top: offsetY,
                scaleX: scale, scaleY: scale,
                selectable: false, evented: false
            });
            canvas.add(img);
            canvas.fabricScale = scale;
            canvas.fabricOffset = { x: offsetX, y: offsetY };

            // Render measurements
            measurement.points.forEach((p, idx) => {
                canvas.add(new fabric.Circle({
                    left: p.x, top: p.y, radius: 8, fill: '#f43f5e',
                    stroke: '#fff', strokeWidth: 2, originX: 'center', originY: 'center',
                    selectable: true, hasControls: false
                }));
            });

            if (measurement.points.length === 2) {
                canvas.add(new fabric.Line([
                    measurement.points[0].x, measurement.points[0].y,
                    measurement.points[1].x, measurement.points[1].y
                ], {
                    stroke: '#f43f5e', strokeWidth: 3, selectable: false, evented: false
                }));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleFabricUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true);

        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await axios.post('http://localhost:8000/process-fabric', formData);
            setFabricData(res.data);
            setIsCalibrating(true);
        } catch (err) {
            alert("Fabric detection failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleContinue = () => {
        if (measurement.points.length !== 2 || !measurement.realCm) {
            alert("Please complete calibration first.");
            return;
        }

        const distPx = Math.sqrt(
            Math.pow(measurement.points[1].x - measurement.points[0].x, 2) +
            Math.pow(measurement.points[1].y - measurement.points[0].y, 2)
        );
        const imgScale = fabricCanvasRef.current.fabricScale;
        const avgScale = (distPx / imgScale) / parseFloat(measurement.realCm);

        // Convert fabric points to CM
        const cmPoints = fabricData.points.map(p => ({
            x: (p[0] - fabricData.bbox.x) / avgScale,
            y: (p[1] - fabricData.bbox.y) / avgScale
        }));

        onNext({
            boundaryPoints: cmPoints.map(p => [p.x, p.y]),
            width: fabricData.bbox.w / avgScale,
            height: fabricData.bbox.h / avgScale,
            scale: 10, // Grid interval in CM
            pxPerCm: avgScale // Store this separately if needed
        });
    };

    return (
        <div className="flex h-full bg-slate-950 text-white font-sans overflow-hidden">
            <div className="w-96 bg-slate-900 border-r border-slate-800 p-6 flex flex-col gap-6 shadow-2xl">
                <div>
                    <h2 className="text-xl font-black flex items-center gap-2">
                        <Ruler className="text-emerald-500 w-5 h-5" /> FABRIC SETUP
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Irregular Piece Calibration</p>
                </div>

                {!fabricData ? (
                    <label className="block cursor-pointer group flex-1">
                        <div className="h-full border-2 border-dashed border-slate-700 rounded-3xl flex flex-col items-center justify-center gap-4 group-hover:border-emerald-500/50 bg-slate-800/20 transition-all">
                            <Upload className="w-12 h-12 text-emerald-500" />
                            <span className="text-sm font-bold opacity-60 text-center px-4">Upload Fabric Photo</span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleFabricUpload} />
                        </div>
                    </label>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-slate-800/50 p-4 rounded-2xl border border-emerald-500/30">
                            <h3 className="text-xs font-black uppercase text-emerald-400 mb-2">Calibration</h3>
                            <p className="text-[10px] text-slate-400 mb-4">Click 2 points on the fabric image to define a known distance.</p>

                            <input
                                type="number"
                                placeholder="Known Distance (CM)"
                                value={measurement.realCm}
                                onChange={(e) => setMeasurement({ ...measurement, realCm: e.target.value })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>

                        <button
                            onClick={handleContinue}
                            disabled={measurement.points.length < 2 || !measurement.realCm}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-600 py-4 rounded-xl font-black uppercase text-xs transition-all flex items-center justify-center gap-2 shadow-lg"
                        >
                            Confirm Calibration <ChevronRight className="w-4 h-4" />
                        </button>

                        <button onClick={() => setFabricData(null)} className="w-full py-3 text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">
                            Change Photo
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 flex items-center justify-center p-8 bg-slate-950">
                <div className="relative bg-slate-900 rounded-3xl border-2 border-slate-800 shadow-2xl overflow-hidden" style={{ width: '800px', height: '600px' }}>
                    <canvas ref={canvasRef} width={800} height={600} />

                    {loading && (
                        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl flex flex-col items-center justify-center gap-6 text-center">
                            <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em] animate-pulse px-8">Extracting Fabric Contour</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FabricCalibrate;
