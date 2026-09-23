export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 25 MB.");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Photo processing is unavailable.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = 0.86;
    const encode = () =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error("Could not compress this photo.")),
          "image/jpeg",
          quality,
        ),
      );
    let blob = await encode();
    while (blob.size > 300 * 1024 && quality > 0.5) {
      quality -= 0.09;
      blob = await encode();
    }
    return blob;
  } finally {
    bitmap.close();
  }
}
