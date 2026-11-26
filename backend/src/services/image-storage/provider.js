/** @typedef {{ url: string, assetId: string, format: string, bytes: number, width: number, height: number }} StoredImage */

/**
 * @typedef {object} ImageStorageProvider
 * @property {(buffer: Buffer, options: {productId: number}) => Promise<StoredImage>} upload
 * @property {(assetId: string) => Promise<void>} delete
 */

export class ImageStorageConfigurationError extends Error {
  constructor() { super('Product image storage is not configured'); this.name = 'ImageStorageConfigurationError'; }
}
