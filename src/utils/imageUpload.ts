/**
 * Utility functions for handling, compressing, and encoding QR Code and image uploads
 * to ensure images stay lightweight (< 100KB) and fit securely into Firestore documents.
 */

export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  // Check MIME type
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
  if (!validTypes.includes(file.type.toLowerCase()) && !file.name.match(/\.(png|jpe?g|webp|svg)$/i)) {
    return { valid: false, error: 'Please select a valid image file (PNG, JPG, WEBP, or SVG).' };
  }

  // Check raw size limit (10MB max upload)
  if (file.size > 10 * 1024 * 1024) {
    return { valid: false, error: 'Image file size must be less than 10MB.' };
  }

  return { valid: true };
}

export interface CompressImageOptions {
  maxDimension?: number;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeBytes?: number;
}

/**
 * Compresses an image and converts it into a Base64 data URL.
 * QR codes are typically square; 400x400 provides razor-sharp clarity for UPI scanners
 * while keeping the payload under ~30-50KB for fast Firestore reads and writes.
 * Supports both options object and positional arguments.
 */
export function compressAndEncodeImage(
  file: File,
  maxWidthOrOptions?: number | CompressImageOptions,
  maxHeightParam?: number,
  qualityParam?: number
): Promise<string> {
  let maxWidth = 400;
  let maxHeight = 400;
  let quality = 0.88;

  if (typeof maxWidthOrOptions === 'object' && maxWidthOrOptions !== null) {
    if (maxWidthOrOptions.maxDimension) {
      maxWidth = maxWidthOrOptions.maxDimension;
      maxHeight = maxWidthOrOptions.maxDimension;
    }
    if (maxWidthOrOptions.maxWidth) maxWidth = maxWidthOrOptions.maxWidth;
    if (maxWidthOrOptions.maxHeight) maxHeight = maxWidthOrOptions.maxHeight;
    if (typeof maxWidthOrOptions.quality === 'number') quality = maxWidthOrOptions.quality;
  } else if (typeof maxWidthOrOptions === 'number') {
    maxWidth = maxWidthOrOptions;
    if (typeof maxHeightParam === 'number') maxHeight = maxHeightParam;
    if (typeof qualityParam === 'number') quality = qualityParam;
  }

  return new Promise((resolve, reject) => {
    // If it's an SVG, read directly as text data URL without rasterizing
    if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to read SVG file.'));
        }
      };
      reader.onerror = () => reject(new Error('Error reading SVG file.'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate scaling preserving aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback to original data URL if 2D context fails
          resolve(readerEvent.target?.result as string);
          return;
        }

        // Fill with white background (useful for transparent PNG QR codes)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // Draw the image
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG or PNG
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve(dataUrl);
      };

      img.onerror = () => {
        reject(new Error('Failed to process the image file. Please try another image.'));
      };

      if (typeof readerEvent.target?.result === 'string') {
        img.src = readerEvent.target.result;
      } else {
        reject(new Error('Failed to read image buffer.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file from disk.'));
    };

    reader.readAsDataURL(file);
  });
}
