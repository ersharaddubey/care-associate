const cloudinary = require('cloudinary').v2;

function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function assertConfigured() {
  if (!isConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

async function uploadAadhaar(buffer, mimeType, userId) {
  assertConfigured();
  const format = mimeType === 'image/png' ? 'png' : 'jpg';
  const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return cloudinary.uploader.upload(dataUri, {
    folder: 'care-associate/aadhaar',
    public_id: `helper_${String(userId)}_${Date.now()}`,
    resource_type: 'image',
    type: 'authenticated',
    overwrite: false,
    unique_filename: false,
    use_filename: false,
    format,
  });
}

async function uploadPrivateDocument(buffer, mimeType, ownerId) {
  assertConfigured();
  const format = mimeType === 'image/png' ? 'png' : 'jpg';
  const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return cloudinary.uploader.upload(dataUri, {
    folder: 'care-associate/private-documents',
    public_id: `document_${String(ownerId)}_${Date.now()}`,
    resource_type: 'image', type: 'authenticated', overwrite: false,
    unique_filename: false, use_filename: false, format,
  });
}

async function deleteAadhaar(publicId) {
  if (!publicId) return { result: 'not found' };
  assertConfigured();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    invalidate: true,
  });
}

async function deletePrivateDocument(publicId) {
  if (!publicId) return { result: 'not found' };
  assertConfigured();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    invalidate: true,
  });
}

async function downloadAadhaar(publicId, format) {
  assertConfigured();
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  const signedUrl = cloudinary.utils.private_download_url(publicId, format || 'jpg', {
    resource_type: 'image',
    type: 'authenticated',
    expires_at: expiresAt,
    attachment: false,
  });
  const response = await fetch(signedUrl);
  if (!response.ok) {
    throw new Error('Unable to retrieve the private Aadhaar document from Cloudinary');
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || (format === 'png' ? 'image/png' : 'image/jpeg'),
  };
}

module.exports = { isConfigured, uploadAadhaar, uploadPrivateDocument, deleteAadhaar, downloadAadhaar };
