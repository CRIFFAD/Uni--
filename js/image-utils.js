/* ============================================================
   Resizes + re-encodes an image file entirely in the browser
   before it's uploaded, so a 4-5MB phone photo typically becomes
   a couple hundred KB with no visible quality loss.
   ============================================================ */

export function compressImage(file, { maxDimension = 1600, quality = 0.82 } = {}){
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')){
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension){
        if (width >= height){
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob){ resolve(file); return; }
        const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        const compressedFile = new File([blob], newName, { type: 'image/jpeg' });
        resolve(compressedFile);
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
