import React, { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
import { View } from 'react-native';

interface SignatureCanvasRef {
  clearSignature: () => void;
  readSignature: () => void;
}

interface Props {
  onOK: (signature: string) => void;
  onBegin?: () => void;
  backgroundColor?: string;
  penColor?: string;
  minWidth?: number;
  maxWidth?: number;
}

const SignatureCanvas = forwardRef<SignatureCanvasRef, Props>(
  ({ onOK, onBegin, backgroundColor = '#ffffff', penColor = '#1e293b', minWidth = 1.5, maxWidth = 3 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const lastPos = useRef<{ x: number; y: number } | null>(null);
    const hasDrawn = useRef(false);

    // Set canvas dimensions to match its CSS size (handles HiDPI/retina too)
    // On orientation change, we save the current image and restore it after resize
    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      const newW = Math.round(rect.width * dpr);
      const newH = Math.round(rect.height * dpr);

      // Skip if nothing actually changed (avoids unnecessary clears)
      if (canvas.width === newW && canvas.height === newH) return;

      // 1. Save whatever was drawn (if anything)
      let savedImage: ImageData | null = null;
      const ctx = canvas.getContext('2d');
      if (ctx && canvas.width > 0 && canvas.height > 0 && hasDrawn.current) {
        savedImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }

      // 2. Resize
      canvas.width = newW;
      canvas.height = newH;

      if (ctx) {
        ctx.scale(dpr, dpr);

        // 3. Restore background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, rect.width, rect.height);

        // 4. Restore the saved drawing scaled to the new dimensions
        if (savedImage) {
          // Draw the old image data onto a temporary canvas to get a Blob/URL for scaling
          const tmp = document.createElement('canvas');
          tmp.width = savedImage.width;
          tmp.height = savedImage.height;
          tmp.getContext('2d')?.putImageData(savedImage, 0, 0);

          // Draw scaled into the new canvas
          ctx.drawImage(tmp, 0, 0, rect.width, rect.height);
        }
      }
    }, [backgroundColor]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      resizeCanvas();

      const ro = new ResizeObserver(resizeCanvas);
      ro.observe(canvas);
      return () => ro.disconnect();
    }, [resizeCanvas]);

    const getPos = useCallback(
      (e: MouseEvent | PointerEvent | TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        if ('touches' in e && e.touches.length > 0) {
          const t = e.touches[0];
          return { x: t.clientX - rect.left, y: t.clientY - rect.top };
        }
        const pe = e as PointerEvent;
        return { x: pe.clientX - rect.left, y: pe.clientY - rect.top };
      },
      []
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const startDrawing = (e: PointerEvent) => {
        e.preventDefault();
        isDrawing.current = true;
        lastPos.current = getPos(e, canvas);
        if (!hasDrawn.current) {
          hasDrawn.current = true;
          onBegin?.();
        }
        canvas.setPointerCapture(e.pointerId);
      };

      const draw = (e: PointerEvent) => {
        e.preventDefault();
        if (!isDrawing.current || !lastPos.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pos = getPos(e, canvas);
        // Vary line width slightly with pressure (pointer API)
        const pressure = (e as any).pressure ?? 0.5;
        const lineWidth = minWidth + (maxWidth - minWidth) * pressure;

        ctx.beginPath();
        ctx.strokeStyle = penColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(lastPos.current.x, lastPos.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();

        lastPos.current = pos;
      };

      const stopDrawing = (e: PointerEvent) => {
        isDrawing.current = false;
        lastPos.current = null;
      };

      // Use Pointer Events API (supports mouse, touch, stylus)
      canvas.addEventListener('pointerdown', startDrawing);
      canvas.addEventListener('pointermove', draw);
      canvas.addEventListener('pointerup', stopDrawing);
      canvas.addEventListener('pointercancel', stopDrawing);
      canvas.addEventListener('pointerleave', stopDrawing);

      return () => {
        canvas.removeEventListener('pointerdown', startDrawing);
        canvas.removeEventListener('pointermove', draw);
        canvas.removeEventListener('pointerup', stopDrawing);
        canvas.removeEventListener('pointercancel', stopDrawing);
        canvas.removeEventListener('pointerleave', stopDrawing);
      };
    }, [penColor, minWidth, maxWidth, getPos, onBegin]);

    useImperativeHandle(ref, () => ({
      clearSignature: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = backgroundColor;
          ctx.fillRect(0, 0, rect.width, rect.height);
        }
        hasDrawn.current = false;
      },
      readSignature: () => {
        const canvas = canvasRef.current;
        if (canvas) {
          if (canvas.height > canvas.width) {
            // The canvas is in portrait mode, but the user signed it holding the device horizontally.
            // We rotate the image -90 degrees so the signature is saved horizontally.
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = canvas.height;
            tmpCanvas.height = canvas.width;
            const ctx = tmpCanvas.getContext('2d');
            if (ctx) {
              ctx.translate(tmpCanvas.width / 2, tmpCanvas.height / 2);
              ctx.rotate((-90 * Math.PI) / 180);
              ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
              onOK(tmpCanvas.toDataURL('image/png'));
              return;
            }
          }
          onOK(canvas.toDataURL('image/png'));
        }
      },
    }));

    return (
      <View style={{ flex: 1, backgroundColor }}>
        {/* @ts-ignore – <canvas> is valid HTML on web/RNW */}
        <canvas
          ref={canvasRef as any}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: 'crosshair',
            touchAction: 'none',
            userSelect: 'none',
          }}
        />
      </View>
    );
  }
);

export default SignatureCanvas;
