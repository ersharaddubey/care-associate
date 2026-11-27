const { User, Notification } = require('./models');

async function sendPushToUser(userId, title, body, data = {}) {
  try {
    const user = await User.findById(userId).select('expoPushTokens');
    const tokens = (user?.expoPushTokens || []).filter((token) => /^Expo(nent)?PushToken\[.+\]$/.test(token));
    if (!tokens.length) return;
    const messages = tokens.map((to) => ({
      to, sound: 'default', title, body, data,
      channelId: 'booking-updates',
      priority: 'high',
    }));
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error('Expo push gateway returned ' + response.status);
    const result = await response.json();
    const invalid = [];
    (result.data || []).forEach((item, index) => {
      if (item.status === 'error' && item.details?.error === 'DeviceNotRegistered') invalid.push(tokens[index]);
    });
    if (invalid.length) await User.updateOne({ _id: userId }, { $pull: { expoPushTokens: { $in: invalid } } });
  } catch (error) {
    console.warn('Push notification failed:', error.message);
  }
}

async function createNotification(recipientId, title, body, data = {}) {
  if (!recipientId) return null;
  try {
    return await Notification.create({
      recipient: recipientId,
      title: String(title || 'Care Associate update').slice(0, 120),
      body: String(body || '').slice(0, 500),
      data: data && typeof data === 'object' ? data : {},
    });
  } catch (error) {
    console.warn('In-app notification save failed:', error.message);
    return null;
  }
}

async function notifyBooking(booking, recipientId, title, body) {
  if (!recipientId) return;
  const data = { bookingId: String(booking._id), screen: 'booking' };
  await createNotification(recipientId, title, body, data);
  await sendPushToUser(recipientId, title, body, data);
}

module.exports = { sendPushToUser, notifyBooking, createNotification };
