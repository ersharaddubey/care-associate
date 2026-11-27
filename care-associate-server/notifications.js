const { User, Notification, NotificationPreference, NotificationDelivery } = require('./models');

async function sendPushToUser(userId, title, body, data = {}) {
  let kind = data?.screen === 'chat' ? 'chatMessages' : 'bookingUpdates';
  try {
    const [user,prefs] = await Promise.all([
      User.findById(userId).select('expoPushTokens'),
      NotificationPreference.findOne({user:userId}).lean(),
    ]);
    if (prefs?.pushEnabled === false || prefs?.[kind] === false) {
      await NotificationDelivery.create({user:userId,kind,status:'skipped',providerStatus:'disabled_by_user'});
      return;
    }
    const tokens = (user?.expoPushTokens || []).filter((token) => /^Expo(nent)?PushToken\\[.+\\]$/.test(token));
    if (!tokens.length) {
      await NotificationDelivery.create({user:userId,kind,status:'skipped',providerStatus:'no_registered_device'});
      return;
    }
    const messages = tokens.map((to) => ({
      to, sound: 'default', title, body, data,
      channelId: 'booking-updates', priority: 'high',
    }));
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error('Expo push gateway returned ' + response.status);
    const result = await response.json();
    const invalid = [];
    let sent=0,failed=0;
    (result.data || []).forEach((item, index) => {
      if (item.status === 'error' && item.details?.error === 'DeviceNotRegistered') invalid.push(tokens[index]);
      if(item.status==='ok') sent++; else failed++;
    });
    if (invalid.length) await User.updateOne({ _id: userId }, { $pull: { expoPushTokens: { $in: invalid } } });
    await NotificationDelivery.create({user:userId,kind,status:sent?'sent':'failed',providerStatus:'accepted:'+sent+',failed:'+failed});
  } catch (error) {
    await NotificationDelivery.create({user:userId,kind,status:'failed',errorCode:String(error.message||'push_error').slice(0,120)}).catch(()=>{});
    console.warn('Push notification failed:', error.message);
  }
}
