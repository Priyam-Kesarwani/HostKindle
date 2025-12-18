const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function ensureCloudinaryConfigured() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary env vars missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.');
  }
}

/**
 * Upload an in-memory file buffer to Cloudinary.
 * @param {Buffer} buffer
 * @param {{ folder?: string, public_id?: string }} opts
 * @returns {Promise<{ secure_url: string, url: string, public_id: string }>}
 */
function uploadBuffer(buffer, opts = {}) {
  ensureCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder || 'hostkindle/homes',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
}

module.exports = {
  cloudinary,
  uploadBuffer,
};


