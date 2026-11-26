import { v2 as cloudinary } from 'cloudinary';
import { ImageStorageConfigurationError } from './provider.js';

export function createCloudinaryImageStorage({ client = cloudinary, env = process.env } = {}) {
  function configure() {
    const cloudName = env.CLOUDINARY_CLOUD_NAME;
    const apiKey = env.CLOUDINARY_API_KEY;
    const apiSecret = env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) throw new ImageStorageConfigurationError();
    client.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  }

  return {
    upload(buffer, { productId, assetId }) {
      configure();
      const publicId = assetId || `kilicart/products/product-${productId}`;
      return new Promise((resolve, reject) => {
        const stream = client.uploader.upload_stream({
          folder: 'kilicart/products',
          public_id: publicId,
          resource_type: 'image',
          format: 'webp',
          overwrite: false,
          invalidate: true,
        }, (error, result) => {
          if (error || !result?.secure_url || !result?.public_id) return reject(error || new Error('Image provider returned an invalid result'));
          resolve({ url: result.secure_url, assetId: result.public_id, format: result.format, bytes: result.bytes, width: result.width, height: result.height });
        });
        stream.end(buffer);
      });
    },
    async delete(assetId) {
      configure();
      const result = await client.uploader.destroy(assetId, { resource_type: 'image', invalidate: true });
      if (!['ok', 'not found'].includes(result?.result)) throw new Error('Image provider could not confirm asset deletion');
    },
  };
}

export const imageStorage = createCloudinaryImageStorage();
