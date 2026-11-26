const { User } = require('./models');

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

async function notifyBooking(booking, recipientId, title, body) {
  if (recipientId) await sendPushToUser(recipientId, title, body, { bookingId: String(booking._id) });
}

module.exports = { sendPushToUser, notifyBooking };
