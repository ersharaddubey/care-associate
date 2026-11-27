const mongoose = require('mongoose');
const { SupportTicket, User, Notification } = require('./models');

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const validId = value => mongoose.isValidObjectId(value);
const safe = fn => (req, res) => Promise.resolve(fn(req, res)).catch(error => res.status(400).json({ error: error.message }));

function mountSupportRoutes(app, auth) {
  app.get('/api/support/tickets', auth('patient', 'helper'), safe(async (req, res) => {
    const items = await SupportTicket.find({ owner: req.user._id }).sort('-updatedAt').limit(100).lean();
    res.json({ items });
  }));

  app.post('/api/support/tickets', auth('patient', 'helper'), safe(async (req, res) => {
    const subject = clean(req.body.subject, 120);
    const category = clean(req.body.category, 40);
    const message = clean(req.body.message, 3000);
    if (!subject || !message || !['booking', 'payment', 'account', 'associate', 'safety', 'other'].includes(category)) {
      return res.status(400).json({ error: 'Enter a subject, valid category and message' });
    }
    const recent = await SupportTicket.countDocuments({ owner: req.user._id, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    if (recent >= 5) return res.status(429).json({ error: 'You can create up to 5 support tickets in 24 hours' });
    const ticket = await SupportTicket.create({
      owner: req.user._id, role: req.user.role, subject, category,
      messages: [{ sender: req.user._id, senderRole: req.user.role, body: message }],
    });
    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    await Promise.all(admins.map(admin => Notification.create({
      recipient: admin._id, title: 'New support ticket',
      body: subject, data: { ticketId: String(ticket._id), screen: 'admin-support' },
    })));
    res.status(201).json({ ticket });
  }));

  app.post('/api/support/tickets/:id/messages', auth('patient', 'helper'), safe(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid ticket' });
    const body = clean(req.body.message, 3000);
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });
    const ticket = await SupportTicket.findOne({ _id: req.params.id, owner: req.user._id });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (['resolved', 'closed'].includes(ticket.status)) return res.status(409).json({ error: 'This ticket is closed. Create a new ticket if you still need help.' });
    ticket.messages.push({ sender: req.user._id, senderRole: req.user.role, body });
    ticket.status = ticket.status === 'open' ? 'open' : 'in_progress';
    await ticket.save();
    res.json({ ticket });
  }));

  app.get('/api/admin/support/tickets', auth('admin'), safe(async (req, res) => {
    const query = {};
    if (['open', 'in_progress', 'resolved', 'closed'].includes(req.query.status)) query.status = req.query.status;
    const items = await SupportTicket.find(query).populate('owner', 'name phone role city').sort('-updatedAt').limit(200).lean();
    res.json({ items });
  }));

  app.patch('/api/admin/support/tickets/:id', auth('admin'), safe(async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid ticket' });
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (req.body.status !== undefined) {
      if (!['open', 'in_progress', 'resolved', 'closed'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid ticket status' });
      ticket.status = req.body.status;
    }
    if (req.body.message !== undefined) {
      const body = clean(req.body.message, 3000);
      if (!body) return res.status(400).json({ error: 'Reply cannot be empty' });
      ticket.messages.push({ sender: req.user._id, senderRole: 'admin', body });
      if (!['resolved', 'closed'].includes(ticket.status)) ticket.status = 'in_progress';
      await Notification.create({ recipient: ticket.owner, title: 'Support team replied', body: ticket.subject, data: { ticketId: String(ticket._id), screen: 'support-ticket' } });
    }
    await ticket.save();
    res.json({ ticket });
  }));
}

module.exports = { mountSupportRoutes };
