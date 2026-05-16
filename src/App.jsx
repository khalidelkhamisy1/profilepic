import { useState, useRef, useCallback, useEffect } from "react";

// ===== Constants =====
const EXPORT_SIZE = 1080; // Final export dimensions (1080x1080)
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MIN_ZOOM = 1;   // 1× = exact cover (image fills the square perfectly)
const MAX_ZOOM = 3;   // 3× = zoomed in 3× past cover
const DEFAULT_ZOOM = 1;

// =====================================================================
// HELPER FUNCTIONS — cover-scale, display rect, clamping, canvas draw
// =====================================================================

/**
 * Calculate the base scale needed to "cover" a square of `squareSize`
 * with an image of `naturalWidth × naturalHeight`, preserving aspect ratio.
 *
 * This is the CSS `object-fit: cover` equivalent:
 *   pick the LARGER of (squareSize/w) and (squareSize/h)
 *   so the shorter dimension fills the square and the longer overflows.
 */
function calculateCoverScale(naturalWidth, naturalHeight, squareSize) {
  return Math.max(squareSize / naturalWidth, squareSize / naturalHeight);
}

/**
 * Return the displayed width, height, x, y of the user image
 * given image natural size, squareSize, zoom multiplier, and offsets.
 *
 * displayedWidth  = naturalWidth  × baseScale × zoom
 * displayedHeight = naturalHeight × baseScale × zoom
 * x = squareSize/2 + offsetX − displayedWidth/2
 * y = squareSize/2 + offsetY − displayedHeight/2
 */
function getDisplayedImageRect(naturalWidth, naturalHeight, squareSize, zoom, offsetX, offsetY) {
  const baseScale = calculateCoverScale(naturalWidth, naturalHeight, squareSize);
  const displayedWidth = naturalWidth * baseScale * zoom;
  const displayedHeight = naturalHeight * baseScale * zoom;
  const x = squareSize / 2 + offsetX - displayedWidth / 2;
  const y = squareSize / 2 + offsetY - displayedHeight / 2;
  return { x, y, width: displayedWidth, height: displayedHeight };
}

/**
 * Clamp offsetX and offsetY so the image never leaves blank areas
 * inside the square. The image edges must always reach or exceed
 * the square edges.
 *
 * maxOffsetX = max(0, (displayedWidth  − squareSize) / 2)
 * maxOffsetY = max(0, (displayedHeight − squareSize) / 2)
 */
function clampOffsets(offsetX, offsetY, naturalWidth, naturalHeight, squareSize, zoom) {
  const baseScale = calculateCoverScale(naturalWidth, naturalHeight, squareSize);
  const displayedWidth = naturalWidth * baseScale * zoom;
  const displayedHeight = naturalHeight * baseScale * zoom;
  const maxOffsetX = Math.max(0, (displayedWidth - squareSize) / 2);
  const maxOffsetY = Math.max(0, (displayedHeight - squareSize) / 2);
  return {
    x: Math.max(-maxOffsetX, Math.min(maxOffsetX, offsetX)),
    y: Math.max(-maxOffsetY, Math.min(maxOffsetY, offsetY)),
  };
}

/**
 * Draw the composited image (user photo + frame) onto a canvas at `size × size`.
 * Uses the exact same cover-scale / offset maths as the preview so the
 * export matches pixel-for-pixel.
 */
async function drawCanvas(canvas, imageEl, zoom, offset, size) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  // 1) Draw the user's photo at the correct cover-scaled position
  const rect = getDisplayedImageRect(
    imageEl.naturalWidth,
    imageEl.naturalHeight,
    size,
    zoom,
    // Scale the offsets from preview-space → export-space
    // (offsets are stored in preview-pixel units, so we need to convert)
    offset.x,
    offset.y
  );
  ctx.drawImage(imageEl, rect.x, rect.y, rect.width, rect.height);

  // 2) Draw the transparent frame above it
  const frameImg = new Image();
  frameImg.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    frameImg.onload = resolve;
    frameImg.onerror = reject;
    frameImg.src = "/frame.png";
  });
  ctx.drawImage(frameImg, 0, 0, size, size);
}

// =====================================================================
// COMPONENT
// =====================================================================

export default function App() {
  // ===== State =====
  const [image, setImage] = useState(null);       // User's uploaded image blob URL
  const [imageEl, setImageEl] = useState(null);    // Loaded HTMLImageElement
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // Drag offset (in preview-pixel units)
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

  // ===== Re-clamp offsets whenever zoom changes =====
  useEffect(() => {
    if (!imageEl || !previewRef.current) return;
    const squareSize = previewRef.current.offsetWidth;
    setOffset((prev) => clampOffsets(prev.x, prev.y, imageEl.naturalWidth, imageEl.naturalHeight, squareSize, zoom));
  }, [zoom, imageEl]);

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

    // Revoke previous object URL if any
    setImage((prevUrl) => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      return null;
    });

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
    e.target.value = ""; // Reset so re-uploading the same file works
  };

  // ===== Handle drag-and-drop upload =====
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
    if (!isDragging || !imageEl || !previewRef.current) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    const rawX = pos.x - dragStart.x;
    const rawY = pos.y - dragStart.y;
    // Clamp immediately so blank areas never appear while dragging
    const squareSize = previewRef.current.offsetWidth;
    const clamped = clampOffsets(rawX, rawY, imageEl.naturalWidth, imageEl.naturalHeight, squareSize, zoom);
    setOffset(clamped);
  };

  const handlePointerUp = () => setIsDragging(false);

  // ===== Reset controls =====
  const handleReset = () => {
    setZoom(DEFAULT_ZOOM);
    setOffset({ x: 0, y: 0 });
  };

  // ===== Compute inline style for the user's photo in preview =====
  const getPhotoStyle = () => {
    if (!imageEl || !previewRef.current) return {};
    const squareSize = previewRef.current.offsetWidth;
    const rect = getDisplayedImageRect(
      imageEl.naturalWidth,
      imageEl.naturalHeight,
      squareSize,
      zoom,
      offset.x,
      offset.y
    );
    return {
      position: "absolute",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      pointerEvents: "none",
    };
  };

  // ===== Export final image using Canvas =====
  const handleDownload = async () => {
    if (!imageEl || !previewRef.current) return;
    setExporting(true);

    try {
      const previewSize = previewRef.current.offsetWidth;
      // Scale offsets from preview-space → export-space so crop matches
      const scaleFactor = EXPORT_SIZE / previewSize;
      const exportOffset = {
        x: offset.x * scaleFactor,
        y: offset.y * scaleFactor,
      };

      await drawCanvas(canvasRef.current, imageEl, zoom, exportOffset, EXPORT_SIZE);

      // Trigger download
      const dataUrl = canvasRef.current.toDataURL("image/png");
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
              {/* User's photo — cover-scaled, draggable, zoomable */}
              <img
                src={image}
                alt="Your uploaded photo"
                style={getPhotoStyle()}
                draggable={false}
              />
              {/* Frame overlay — fixed, always fills the square */}
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
