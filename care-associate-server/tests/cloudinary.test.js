const test = require('node:test');
const assert = require('node:assert/strict');

const cloudinaryStore = require('../cloudinary');

test('Cloudinary configuration is reported as missing when credentials are absent', async () => {
  const previous = {
    cloud: process.env.CLOUDINARY_CLOUD_NAME,
    key: process.env.CLOUDINARY_API_KEY,
    secret: process.env.CLOUDINARY_API_SECRET,
  };
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;

  try {
    assert.equal(cloudinaryStore.isConfigured(), false);
    await assert.rejects(
      cloudinaryStore.uploadAadhaar(Buffer.from('x'), 'image/jpeg', 'test-user'),
      /Cloudinary is not configured/
    );
    await assert.rejects(
      cloudinaryStore.downloadAadhaar('private/test', 'jpg'),
      /Cloudinary is not configured/
    );
  } finally {
    if (previous.cloud === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
    else process.env.CLOUDINARY_CLOUD_NAME = previous.cloud;
    if (previous.key === undefined) delete process.env.CLOUDINARY_API_KEY;
    else process.env.CLOUDINARY_API_KEY = previous.key;
    if (previous.secret === undefined) delete process.env.CLOUDINARY_API_SECRET;
    else process.env.CLOUDINARY_API_SECRET = previous.secret;
  }
});
