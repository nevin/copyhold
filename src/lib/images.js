// Larger images are skipped by automatic capture; Save clipboard keeps them up to the hard limit.
export const autoCaptureMaxImageBytes = 10 * 1024 * 1024;
export const maxImageBytes = 25 * 1024 * 1024;
const thumbnailSize = 160;

async function toBlob(canvas, type) {
  return canvas.convertToBlob({ type, quality: 0.85 });
}

/**
 * Prepares a copied image for saving: the image as PNG, which every clipboard accepts,
 * a small thumbnail for the list, and its dimensions.
 * @param {Blob} blob
 */
export async function describeImage(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = bitmap;
    let image = blob;
    if (blob.type !== "image/png") {
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      image = await toBlob(canvas, "image/png");
    }
    const scale = Math.min(1, thumbnailSize / Math.max(width, height));
    const thumbnailCanvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    thumbnailCanvas.getContext("2d").drawImage(bitmap, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    return { image, thumbnail: await toBlob(thumbnailCanvas, "image/webp"), width, height };
  } finally {
    bitmap.close();
  }
}
