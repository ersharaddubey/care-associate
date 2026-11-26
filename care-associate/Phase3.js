import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Linking, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

const LOCATION_TASK = 'care-associate-duty-location';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const latest = data.locations[data.locations.length - 1];
  try {
    const [baseUrl, token, bookingId] = await Promise.all([
      AsyncStorage.getItem('careApiUrl'),
      AsyncStorage.getItem('token'),
      AsyncStorage.getItem('careActiveBookingId'),
    ]);
    if (!baseUrl || !token || !bookingId) {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      return;
    }
    const response = await fetch(baseUrl + '/api/bookings/' + bookingId + '/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        accuracy: latest.coords.accuracy,
        heading: latest.coords.heading,
        speed: latest.coords.speed,
      }),
    });
    // Server rejects updates as soon as duty ends, so stop the native task too.
    if (!response.ok) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      await AsyncStorage.multiRemove(['careActiveBookingId', 'careApiUrl']);
    }
  } catch (_) {
    // Keep the task registered during temporary network outages; next location retries.
  }
});

export async function requestCareLocationPermissions() {
  const accepted = await new Promise((resolve) => Alert.alert(
    'Live location during active duty',
    'Care Associate location will be shared with the assigned patient only while this booking is marked On Duty. Sharing stops when duty ends. Android will show an ongoing location notification.',
    [{ text: 'Not now', style: 'cancel', onPress: () => resolve(false) }, { text: 'Continue', onPress: () => resolve(true) }],
    { cancelable: false }
  ));
  if (!accepted) throw new Error('Location sharing was not enabled. Duty was not started.');
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') throw new Error('Location permission is required to start duty tracking');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') throw new Error('Please allow background location in Settings to share location while the screen is off');
  return true;
}

export async function startCareLocationTracking(bookingId, apiUrl) {
  const activeId = await AsyncStorage.getItem('careActiveBookingId');
  const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (already && activeId === String(bookingId)) return;
  if (already) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await requestCareLocationPermissions();
  await AsyncStorage.setItem('careActiveBookingId', String(bookingId));
  await AsyncStorage.setItem('careApiUrl', apiUrl);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000,
    distanceInterval: 50,
    deferredUpdatesInterval: 15000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: Platform.OS === 'android' ? {
      notificationTitle: 'Care Associate duty tracking',
      notificationBody: 'Your live location is shared with the patient until duty ends.',
      notificationColor: '#0f766e',
      killServiceOnDestroy: true,
    } : undefined,
  });
}

export async function stopCareLocationTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  await AsyncStorage.multiRemove(['careActiveBookingId', 'careApiUrl']);
}

const timeLabel = (value) => value ? new Date(value).toLocaleString() : 'Not available';

export function BookingTools({ booking, isAssoc, api, apiUrl, notify }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [location, setLocation] = useState(null);
  const [sending, setSending] = useState(false);
  const [etaMinutes, setEtaMinutes] = useState(String(booking.etaMinutes || 20));
  const otherPhone = isAssoc ? booking.patient?.phone : booking.helper?.phone;
  const canChat = ['accepted', 'ongoing'].includes(booking.status);
  const canTrack = booking.status === 'ongoing';

  const loadChat = async () => {
    try { setMessages(await api('/bookings/' + booking._id + '/chat')); } catch (_) {}
  };
  const loadLocation = async () => {
    try {
      const result = await api('/bookings/' + booking._id + '/location');
      setLocation(result.active ? result.location : null);
    } catch (_) {}
  };

  useEffect(() => {
    if (isAssoc && canTrack) {
      startCareLocationTracking(booking._id, apiUrl).catch((e) => notify(e.message, true));
    }
    if (isAssoc && !canTrack) AsyncStorage.getItem('careActiveBookingId').then((activeId) => { if (activeId === String(booking._id)) return stopCareLocationTracking(); }).catch(() => {});
  }, [booking._id, booking.status, isAssoc]);

  useEffect(() => {
    if (!chatOpen) return undefined;
    loadChat();
    const timer = setInterval(loadChat, 5000);
    return () => clearInterval(timer);
  }, [chatOpen, booking._id]);

  useEffect(() => {
    if (!canTrack || isAssoc) return undefined;
    loadLocation();
    const timer = setInterval(loadLocation, 15000);
    return () => clearInterval(timer);
  }, [canTrack, isAssoc, booking._id]);

  const myId = isAssoc ? booking.helper?._id : booking.patient?._id;
  const updateEta = async () => {
    const minutes = Number(etaMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return notify('ETA must be between 1 and 600 minutes', true);
    try { await api('/bookings/' + booking._id + '/eta', 'POST', { minutes }); notify('ETA shared with the patient'); }
    catch (e) { notify(e.message, true); }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    try {
      setSending(true);
      await api('/bookings/' + booking._id + '/chat', 'POST', { text });
      setDraft('');
      await loadChat();
    } catch (e) { notify(e.message, true); } finally { setSending(false); }
  };

  return (
    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {canChat && <TouchableOpacity onPress={() => setChatOpen(!chatOpen)} style={{ backgroundColor: '#0f766e', padding: 10, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{chatOpen ? 'Close chat' : '💬 Chat'}</Text>
        </TouchableOpacity>}
        {!!otherPhone && <TouchableOpacity onPress={() => Linking.openURL('tel:' + otherPhone).catch(() => Alert.alert('Call', otherPhone))} style={{ backgroundColor: '#334155', padding: 10, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>📞 Call {isAssoc ? 'patient' : 'associate'}</Text>
        </TouchableOpacity>}
        {!isAssoc && canTrack && <TouchableOpacity onPress={loadLocation} style={{ backgroundColor: '#0369a1', padding: 10, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>📍 Refresh location</Text>
        </TouchableOpacity>}
      </View>

      {chatOpen && <View style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, marginTop: 8 }}>
        <Text style={{ fontWeight: '700', marginBottom: 6 }}>Booking chat</Text>
        {messages.map((m, index) => (
          <View key={m._id || index} style={{ alignSelf: String(m.sender?._id || m.sender) === String(myId) ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: '#fff', borderRadius: 8, padding: 8, marginVertical: 3 }}>
            <Text style={{ fontSize: 12, color: '#64748b' }}>{m.sender?.name || 'User'} • {timeLabel(m.createdAt)}</Text>
            <Text>{m.text}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <TextInput value={draft} onChangeText={setDraft} placeholder="Type a message" maxLength={2000} style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10 }} />
          <TouchableOpacity disabled={sending || !draft.trim()} onPress={send} style={{ backgroundColor: '#0f766e', padding: 12, borderRadius: 8, opacity: sending || !draft.trim() ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>}

      {isAssoc && booking.status === 'accepted' && <View style={{ backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginTop: 8 }}>
        <Text style={{ fontWeight: '700' }}>Share arrival ETA with patient</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <TextInput value={etaMinutes} onChangeText={setEtaMinutes} keyboardType="number-pad" placeholder="Minutes" style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 9 }} />
          <TouchableOpacity onPress={updateEta} style={{ backgroundColor: '#0f766e', padding: 10, borderRadius: 8 }}><Text style={{ color: '#fff', fontWeight: '700' }}>Update ETA</Text></TouchableOpacity>
        </View>
      </View>}
      {!isAssoc && booking.etaMinutes > 0 && ['accepted', 'ongoing'].includes(booking.status) && <Text style={{ color: '#0f766e', fontWeight: '700', marginTop: 8 }}>🕒 Associate's shared ETA: {booking.etaMinutes} minutes • updated {timeLabel(booking.etaUpdatedAt)}</Text>}
      {!isAssoc && canTrack && <View style={{ backgroundColor: '#eff6ff', borderRadius: 8, padding: 10, marginTop: 8 }}>
        <Text style={{ fontWeight: '700' }}>Live Care Associate location</Text>
        {location
          ? <>
            <Text style={{ color: '#475569', fontSize: 12 }}>Last updated: {timeLabel(location.updatedAt)}</Text>
            <Text style={{ color: '#475569', fontSize: 12 }}>Accuracy: {location.accuracy ? Math.round(location.accuracy) + ' m' : 'Not available'}</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + location.latitude + ',' + location.longitude)}>
              <Text style={{ color: '#0369a1', fontWeight: '700', marginTop: 5 }}>Open live position in Maps ↗</Text>
            </TouchableOpacity>
          </>
          : <Text style={{ color: '#475569', fontSize: 12 }}>Waiting for the Care Associate's location update. Location sharing works only during active duty.</Text>}
      </View>}
    </View>
  );
}
