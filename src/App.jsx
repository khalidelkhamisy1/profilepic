import { useState, useRef, useCallback, useEffect } from "react";

// ===== Constants =====
const EXPORT_SIZE = 1080; // Final export dimensions (1080x1080)
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 1;

export default function App() {
  // ===== State =====
  const [image, setImage] = useState(null); // User's uploaded image URL
  const [imageEl, setImageEl] = useState(null); // Loaded HTMLImageElement
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // Drag offset
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // ===== Refs =====
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const previewRef = useRef(null);

  // ===== Auto-dismiss errors after 4 seconds =====
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // ===== Validate and process uploaded file =====
  const processFile = useCallback((file) => {
    if (!file) return;

    // Validate file type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Invalid file type. Please upload JPG, PNG, or WEBP images.");
      return;
    }

    // Validate file size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      setError("File is too large. Maximum size is 20MB.");
      return;
    }

    setLoading(true);
    setError(null);

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(url);
      setImageEl(img);
      setZoom(DEFAULT_ZOOM);
      setOffset({ x: 0, y: 0 });
      setLoading(false);
    };
    img.onerror = () => {
      setError("Failed to load image. The file might be corrupted.");
      setLoading(false);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  // ===== Handle file input change =====
  const handleFileChange = (e) => {
    processFile(e.target.files[0]);
    // Reset input so user can re-upload the same file
    e.target.value = "";
  };

  // ===== Handle drag and drop =====
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  // ===== Photo drag (reposition inside frame) =====
  const getPointerPos = (e) => {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const handlePointerDown = (e) => {
    if (!imageEl) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    setIsDragging(true);
    setDragStart({ x: pos.x - offset.x, y: pos.y - offset.y });
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    setOffset({
      x: pos.x - dragStart.x,
      y: pos.y - dragStart.y,
    });
  };

  const handlePointerUp = () => setIsDragging(false);

  // ===== Reset controls =====
  const handleReset = () => {
    setZoom(DEFAULT_ZOOM);
    setOffset({ x: 0, y: 0 });
  };

  // ===== Compute transform for the user's photo in preview =====
  const getPhotoStyle = () => {
    if (!imageEl || !previewRef.current) return {};
    const containerSize = previewRef.current.offsetWidth;

    // Calculate cover dimensions
    const imgAspect = imageEl.naturalWidth / imageEl.naturalHeight;
    let drawW, drawH;
    if (imgAspect > 1) {
      // Landscape: height fills, width overflows
      drawH = containerSize * zoom;
      drawW = drawH * imgAspect;
    } else {
      // Portrait or square: width fills, height overflows
      drawW = containerSize * zoom;
      drawH = drawW / imgAspect;
    }

    const offsetX = (containerSize - drawW) / 2 + offset.x;
    const offsetY = (containerSize - drawH) / 2 + offset.y;

    return {
      position: "absolute",
      width: `${drawW}px`,
      height: `${drawH}px`,
      left: `${offsetX}px`,
      top: `${offsetY}px`,
      pointerEvents: "none",
    };
  };

  // ===== Export final image using Canvas =====
  const handleDownload = async () => {
    if (!imageEl) return;
    setExporting(true);

    try {
      const canvas = canvasRef.current;
      canvas.width = EXPORT_SIZE;
      canvas.height = EXPORT_SIZE;
      const ctx = canvas.getContext("2d");

      // Clear canvas
      ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);

      // Calculate the user's photo draw dimensions at export scale
      const containerSize = previewRef.current.offsetWidth;
      const scale = EXPORT_SIZE / containerSize;

      const imgAspect = imageEl.naturalWidth / imageEl.naturalHeight;
      let drawW, drawH;
      if (imgAspect > 1) {
        drawH = EXPORT_SIZE * zoom;
        drawW = drawH * imgAspect;
      } else {
        drawW = EXPORT_SIZE * zoom;
        drawH = drawW / imgAspect;
      }

      const drawX = (EXPORT_SIZE - drawW) / 2 + offset.x * scale;
      const drawY = (EXPORT_SIZE - drawH) / 2 + offset.y * scale;

      // 1) Draw the user's photo first
      ctx.drawImage(imageEl, drawX, drawY, drawW, drawH);

      // 2) Draw the frame above it
      const frameImg = new Image();
      frameImg.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        frameImg.onload = resolve;
        frameImg.onerror = reject;
        frameImg.src = "/frame.png";
      });
      ctx.drawImage(frameImg, 0, 0, EXPORT_SIZE, EXPORT_SIZE);

      // 3) Export as PNG
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = "profile-frame.png";
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError("Failed to export image. Please try again.");
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  // ===== Remove current image =====
  const handleRemoveImage = () => {
    if (image) URL.revokeObjectURL(image);
    setImage(null);
    setImageEl(null);
    setZoom(DEFAULT_ZOOM);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center">
      {/* Animated background blobs */}
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="bg-blob bg-blob-3" />

      {/* Hidden canvas for export */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ===== Main Content ===== */}
      <main className="relative z-10 w-full max-w-2xl mx-auto px-4 py-8 md:py-12 flex flex-col items-center gap-8">
        {/* Title / Logo */}
        <div className="flex flex-col items-center gap-4 fade-in">
          <img
            src="/title.png"
            alt="Pharmacy EPNU EXPO v.2 — Cosmo Day: From Lab to Market"
            className="title-image"
          />
          <h1 className="text-2xl md:text-3xl font-semibold text-center" style={{ fontFamily: "'Playfair Display', serif", color: "#6b3a2a" }}>
            Put Your Photo Inside the Frame
          </h1>
          <p className="text-center text-sm md:text-base opacity-70 max-w-md">
            Upload your personal photo and it will automatically be placed inside the event frame. Download your framed photo instantly!
          </p>
        </div>

        {/* ===== Upload / Preview Area ===== */}
        {!image ? (
          /* Upload Zone */
          <div
            className={`upload-zone w-full max-w-md py-16 px-8 flex flex-col items-center gap-4 fade-in ${dragOver ? "drag-over" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            id="upload-zone"
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="spinner" />
                <span className="text-sm opacity-60">Processing image...</span>
              </div>
            ) : (
              <>
                {/* Upload Icon */}
                <svg className="w-14 h-14 opacity-40" style={{ color: "#c8907e" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-base font-medium" style={{ color: "#a06b5a" }}>
                  Click to upload or drag & drop
                </p>
                <p className="text-xs opacity-50">
                  Supports JPG, PNG, WEBP — Max 20MB
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleFileChange}
              id="file-input"
            />
          </div>
        ) : (
          /* Preview + Controls */
          <div className="w-full flex flex-col items-center gap-6 fade-in">
            {/* Preview */}
            <div
              ref={previewRef}
              className="preview-container w-[90vw] max-w-[500px]"
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
              id="preview-area"
            >
              {/* User's photo */}
              <img
                src={image}
                alt="Your uploaded photo"
                style={getPhotoStyle()}
                draggable={false}
              />
              {/* Frame overlay */}
              <img
                src="/frame.png"
                alt="Frame overlay"
                className="preview-frame"
                draggable={false}
              />
            </div>

            {/* Hint */}
            <p className="text-xs opacity-50 text-center -mt-2">
              ✋ Drag to reposition • Use the slider to zoom
            </p>

            {/* Controls Card */}
            <div className="glass-card w-full max-w-md p-5 flex flex-col gap-4">
              {/* Zoom Slider */}
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
                </svg>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="zoom-slider flex-1"
                  id="zoom-slider"
                />
                <svg className="w-5 h-5 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                </svg>
                <span className="text-xs font-medium opacity-60 w-12 text-right">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 justify-center">
                <button onClick={handleReset} className="btn-secondary" id="reset-btn">
                  ↺ Reset
                </button>
                <button onClick={handleRemoveImage} className="btn-secondary" id="change-photo-btn">
                  ⟳ Change Photo
                </button>
              </div>
            </div>

            {/* Download Button */}
            <button
              onClick={handleDownload}
              disabled={exporting}
              className="btn-primary flex items-center gap-2 text-lg"
              id="download-btn"
            >
              {exporting ? (
                <>
                  <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download Image
                </>
              )}
            </button>
          </div>
        )}

        {/* ===== Error Toast ===== */}
        {error && (
          <div className="error-toast fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm max-w-sm" id="error-toast">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {error}
            <button onClick={() => setError(null)} className="ml-2 opacity-50 hover:opacity-100 transition-opacity">
              ✕
            </button>
          </div>
        )}
      </main>

      {/* ===== Footer ===== */}
      <footer className="relative z-10 w-full text-center py-6 mt-auto">
        <p className="footer-text text-xs">
          Pharmacy EPNU EXPO v.2 — Cosmo Day: From Lab to Market
        </p>
        <p className="footer-text text-xs mt-1">
          All processing happens locally in your browser. No images are uploaded to any server.
        </p>
      </footer>
    </div>
  );
}
