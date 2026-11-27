const mongoose = require('mongoose');
const { Notification } = require('./models');

const safe = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((error) => res.status(400).json({ error: error.message }));

function mountNotificationRoutes(app, auth) {
  app.get('/api/notifications', auth('patient', 'helper', 'admin'), safe(async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const query = { recipient: req.user._id };
    if (req.query.unread === 'true') query.readAt = { $exists: false };
    const [items, unreadCount] = await Promise.all([
      Notification.find(query).sort('-createdAt').limit(limit).lean(),
      Notification.countDocuments({ recipient: req.user._id, readAt: { $exists: false } }),
    ]);
    res.json({ items, unreadCount, hasMore: items.length === limit });
  }));

  app.patch('/api/notifications/:id/read', auth('patient', 'helper', 'admin'), safe(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid notification' });
    const item = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Notification not found' });
    res.json({ id: item._id, readAt: item.readAt });
  }));

  app.post('/api/notifications/read-all', auth('patient', 'helper', 'admin'), safe(async (req, res) => {
    const result = await Notification.updateMany(
      { recipient: req.user._id, readAt: { $exists: false } },
      { $set: { readAt: new Date() } }
    );
    res.json({ updated: result.modifiedCount || 0 });
  }));

  app.delete('/api/notifications/:id', auth('patient', 'helper', 'admin'), safe(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid notification' });
    const result = await Notification.deleteOne({ _id: req.params.id, recipient: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Notification not found' });
    res.json({ deleted: true });
  }));
}

module.exports = { mountNotificationRoutes };
