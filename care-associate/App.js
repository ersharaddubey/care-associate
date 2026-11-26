import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch, ActivityIndicator,
  Image, Alert, Keyboard, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { BookingTools, requestCareLocationPermissions, startCareLocationTracking, stopCareLocationTracking } from './Phase3';
import { CFPaymentGatewayService } from 'react-native-cashfree-pg-sdk';
import { CFEnvironment, CFSession } from 'cashfree-pg-api-contract';

// The server address is detected automatically (the computer running "expo start").
// Server port: change only if you changed PORT in care-associate-server/.env
const API_PORT = 5001;
// For a deployed server write its full address here, e.g. 'https://api.example.com'
const API_OVERRIDE = '';
const devHost = (Constants.expoConfig?.hostUri || '').split(':')[0];
const API_URL = API_OVERRIDE || (devHost ? `http://${devHost}:${API_PORT}` : `http://10.0.2.2:${API_PORT}`);

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

const ROLE_NAME = 'Care Associate';
// Help line shown on the login/register screens, Help tab and booking page.
// TODO: yahan apna asli mobile number daalo (country code ke saath)
const SUPPORT_PHONE = '+91 00000 00000';
const C = { p: '#0f766e', bg: '#f1f5f4', card: '#fff', mute: '#64748b', err: '#dc2626', line: '#e2e8f0' };
const SERVICES = [
  { id: 'queue', icon: '🧾', label: 'Queue / token' },
  { id: 'report', icon: '📄', label: 'Collect / show reports' },
  { id: 'accompany', icon: '🤝', label: 'Accompany patient' },
  { id: 'medicine', icon: '💊', label: 'Buy medicines' },
  { id: 'admission', icon: '🛏️', label: 'Admission / discharge' },
  { id: 'insurance', icon: '🪪', label: 'Insurance / Ayushman' },
  { id: 'other', icon: '➕', label: 'Other task' },
];
const svcOf = (id) => SERVICES.find((x) => x.id === id) || SERVICES[6];
const STATUS = { awaiting_payment: 'Payment pending', pending: 'Waiting for associate', accepted: 'Confirmed', ongoing: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_BG = { awaiting_payment: '#ffedd5', pending: '#fef3c7', accepted: '#dbeafe', ongoing: '#ede9fe', completed: '#dcfce7', cancelled: '#fee2e2' };
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

// ---------- API ----------
let TOKEN = '';
async function api(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch(API_URL + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error('Cannot reach the server. Check your internet connection or server address.');
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty response */ }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ---------- Date helpers ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (v) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (v) => { const d = new Date(v); const h = d.getHours(); return `${d.getDate()} ${MON[d.getMonth()]}, ${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtDay = (v) => { const d = parseDay(v); return `${DAYS[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const dur = (m) => `${Math.floor((m || 0) / 60)}h ${(m || 0) % 60}m`;
const validTime = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return !!m && +m[1] < 24 && +m[2] < 60; };

async function pickPhoto() {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.5 });
  if (r.canceled || !r.assets?.[0]?.base64) return null;
  return { uri: r.assets[0].uri, base64: r.assets[0].base64 };
}

function useKeyboard() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return shown;
}

// ---------- Logo: shield + cross, cradled by a golden hand arc ----------
function Logo({ size = 64 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect width="100" height="100" rx="24" fill={C.p} />
      <Path d="M50 14 L78 24 V48 C78 66 66 78 50 86 C34 78 22 66 22 48 V24 Z" fill="#fff" />
      <Path d="M44 34 H56 V44 H66 V56 H56 V66 H44 V56 H34 V44 H44 Z" fill={C.p} />
      <Path d="M16 66 C30 96 70 96 84 66" stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ---------- Small UI parts ----------
function Btn({ title, onPress, kind, disabled, small, style }) {
  const bg = kind === 'danger' ? C.err : kind === 'alt' ? C.mute : kind === 'light' ? '#fff' : C.p;
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} activeOpacity={0.8}
      style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, kind === 'light' && { borderWidth: 2, borderColor: C.p }, small && s.btnSmall, style]}>
      <Text style={[s.btnTxt, kind === 'light' && { color: C.p }]}>{title}</Text>
    </TouchableOpacity>
  );
}
function Chip({ label, on, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={on ? { fontWeight: '700' } : null}>{label}</Text>
    </TouchableOpacity>
  );
}
function SupportCard({ title = 'Having trouble registering or booking?' }) {
  const call = () => Linking.openURL('tel:' + SUPPORT_PHONE.replace(/\s/g, '')).catch(() => Alert.alert('Call us', SUPPORT_PHONE));
  return (
    <View style={[s.card, s.support]}>
      <Text style={{ fontWeight: '700' }}>📞 {title}</Text>
      <Text style={s.muted}>Not able to register or stuck somewhere? Just call us and we will help you right away.</Text>
      <Btn title={`Call ${SUPPORT_PHONE}`} onPress={call} />
    </View>
  );
}
const Input = (p) => <TextInput placeholderTextColor="#94a3b8" {...p} style={[s.input, p.multiline && { height: 80, textAlignVertical: 'top' }]} />;

// ---------- Calendar ----------
function Calendar({ value, onChange, marked = [], leave = [], allowPast = false }) {
  const today = ymd(new Date());
  const base = value ? parseDay(value) : new Date();
  const [m, setM] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const now = new Date();
  const minM = new Date(now.getFullYear(), now.getMonth(), 1);
  const maxM = new Date(now.getFullYear(), now.getMonth() + 3, 1);
  const total = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells = [...Array(m.getDay()).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const shift = (n) => setM(new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <View>
      <View style={s.calHead}>
        <Btn small kind="alt" title="‹" disabled={!allowPast && m <= minM} onPress={() => shift(-1)} />
        <Text style={{ fontWeight: '700', fontSize: 16 }}>{MONTHS[m.getMonth()]} {m.getFullYear()}</Text>
        <Btn small kind="alt" title="›" disabled={m >= maxM} onPress={() => shift(1)} />
      </View>
      <View style={s.calGrid}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => <Text key={w} style={s.wd}>{w}</Text>)}
        {cells.map((d, i) => {
          if (!d) return <View key={'e' + i} style={s.cell} />;
          const key = ymd(new Date(m.getFullYear(), m.getMonth(), d));
          const off = !allowPast && key < today;
          const sel = key === value;
          const isLeave = leave.includes(key);
          return (
            <TouchableOpacity key={key} disabled={off} style={s.cell} onPress={() => onChange(key)}>
              <View style={[s.day, key === today && s.dayToday, isLeave && s.dayLeave, sel && s.daySel]}>
                <Text style={{ color: sel ? '#fff' : off ? '#cbd5e1' : isLeave ? '#b91c1c' : '#1f2933' }}>{d}</Text>
                {marked.includes(key) && <View style={s.dot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Booking card ----------
function BookingCard({ b, isAssoc, admin, children }) {
  const sv = svcOf(b.service);
  return (
    <View style={s.card}>
      <View style={s.rowBetween}>
        <Text style={{ fontWeight: '700', flex: 1 }}>{sv.icon} {sv.label}</Text>
        <Text style={[s.tag, { backgroundColor: STATUS_BG[b.status] }]}>{STATUS[b.status]}</Text>
      </View>
      <Text>🏥 {b.hospital}, {b.city}</Text>
      <Text style={s.muted}>🕒 Scheduled: {fmt(b.startTime)} → {fmt(b.endTime)} ({b.hours} hr)</Text>
      {!!b.actualStart && (
        <Text style={s.duty}>
          {b.status === 'ongoing'
            ? `🟣 On duty since ${fmt(b.actualStart)}`
            : `✅ With patient: ${fmt(b.actualStart)} → ${fmt(b.actualEnd)} (${dur(b.actualMinutes)})`}
        </Text>
      )}
      {!!b.details && <Text>📝 {b.details}</Text>}
      <Text style={s.price}>₹{b.amount}</Text>
      {!!b.paymentStatus && <Text style={s.muted}>Payment: {b.paymentStatus === 'paid' ? 'Paid ✅' : b.paymentStatus === 'pending' ? 'Awaiting payment' : b.paymentStatus}</Text>}
      {b.patient?.name && (isAssoc || admin) && <Text style={s.muted}>Patient: {b.patient.name}{b.status !== 'pending' && b.patient.phone ? ' • ' + b.patient.phone : ''}</Text>}
      {b.helper?.name && !isAssoc && <Text style={s.muted}>{ROLE_NAME}: {b.helper.name} • {b.helper.phone}</Text>}
      {admin && b.helper?.upiId && <Text style={s.muted}>Pay to UPI: {b.helper.upiId}</Text>}
      {children}
    </View>
  );
}

// ---------- Login / Register (opens only when needed) ----------
function Auth({ onLogin, notify, initialMode = 'login', reason, onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [f, setF] = useState({ name: '', phone: '', password: '', city: '', role: 'patient', upiId: '' });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const isAssoc = f.role === 'helper';

  const choose = async () => { try { const p = await pickPhoto(); if (p) setPhoto(p); } catch (e) { notify('Could not open the gallery', true); } };

  const submit = async () => {
    if (mode === 'register' && isAssoc) {
      if (!UPI_RE.test(f.upiId.trim())) return notify('Enter a valid UPI ID, for example name@bank', true);
      if (!photo) return notify('Please upload your masked Aadhaar card', true);
    }
    try {
      setBusy(true);
      const data = await api('/auth/' + mode, 'POST', { ...f, upiId: f.upiId.trim() });
      TOKEN = data.token;
      await AsyncStorage.setItem('token', data.token);
      let user = data.user;
      if (mode === 'register' && isAssoc && photo) {
        try { user = await api('/me/aadhaar', 'POST', { image: photo.base64 }); }
        catch (e) { notify('Account created, but the Aadhaar upload failed. Upload it from the Profile tab.', true); }
      }
      onLogin(user);
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', marginVertical: 10 }}>
        <Logo size={72} />
        <Text style={[s.brand, { fontSize: 24, marginTop: 8 }]}>Care Associate</Text>
      </View>
      {!!reason && <View style={[s.card, { backgroundColor: '#fffbeb' }]}><Text>{reason}</Text></View>}
      <View style={s.card}>
        <Text style={s.h2}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
        {mode === 'register' && <>
          <View style={s.chips}>
            <Chip label="I need help (Patient)" on={f.role === 'patient'} onPress={() => setF({ ...f, role: 'patient' })} />
            <Chip label={`I'm a ${ROLE_NAME}`} on={isAssoc} onPress={() => setF({ ...f, role: 'helper' })} />
          </View>
          <Input placeholder="Full name" value={f.name} onChangeText={set('name')} />
          <Input placeholder="City" value={f.city} onChangeText={set('city')} />
        </>}
        <Input placeholder="Mobile number" keyboardType="phone-pad" value={f.phone} onChangeText={set('phone')} />
        <Input placeholder="Password" secureTextEntry autoCapitalize="none" autoCorrect={false} value={f.password} onChangeText={set('password')} />

        {mode === 'register' && isAssoc && <>
          <Text style={s.sec}>Payment details</Text>
          <Input placeholder="UPI ID (for example name@bank)" autoCapitalize="none" autoCorrect={false} value={f.upiId} onChangeText={set('upiId')} />
          <Text style={s.sec}>Identity verification</Text>
          <Text style={s.muted}>Upload your masked Aadhaar card. Only the last 4 digits of the number should be visible. Our admin will review it before you can take jobs.</Text>
          {photo && <Image source={{ uri: photo.uri }} style={s.preview} resizeMode="contain" />}
          <Btn kind={photo ? 'alt' : 'primary'} title={photo ? 'Change photo' : 'Upload masked Aadhaar'} onPress={choose} />
        </>}

        <Btn title={busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'} disabled={busy} onPress={submit} />
        <Btn kind="alt" title={mode === 'login' ? 'New here? Create account' : 'Have an account? Log in'} onPress={() => setMode(mode === 'login' ? 'register' : 'login')} />
      </View>

      <SupportCard title="Unable to register? Call us" />

      <Btn kind="alt" small title="‹ Continue without logging in" style={{ alignSelf: 'center', marginTop: 8 }} onPress={onClose} />
    </ScrollView>
  );
}

// ---------- Help tab ----------
function Help() {
  return (
    <View>
      <SupportCard title="Need help? Call us" />
      <View style={s.card}>
        <Text style={s.h2}>How it works</Text>
        <Text style={s.muted}>1. Choose the service, hospital, day and time.</Text>
        <Text style={s.muted}>2. See the price and available Care Associates. No login needed so far.</Text>
        <Text style={s.muted}>3. Log in only when you confirm the booking.</Text>
      </View>
    </View>
  );
}

// ---------- Shown in "My bookings" before login ----------
function LoginPrompt({ onLogin, onRegister }) {
  return (
    <View style={s.card}>
      <Text style={s.h2}>Log in to see your bookings</Text>
      <Text style={s.muted}>Browsing is free. You only need an account to book and track your bookings.</Text>
      <Btn title="Log in" onPress={onLogin} />
      <Btn kind="light" title="Create account" onPress={onRegister} />
    </View>
  );
}

// ---------- Patient: new booking ----------
function NewBooking({ user, notify, done, requireLogin, resume }) {
  const [f, setF] = useState({ service: 'queue', hospital: '', city: user?.city || '', details: '' });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [hours, setHours] = useState(4);
  const [price, setPrice] = useState(null);
  const [free, setFree] = useState([]);
  const [pick, setPick] = useState('any');
  const [payBusy, setPayBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });

  const range = () => {
    const [y, mo, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const start = new Date(y, mo - 1, d, hh, mm);
    return { startTime: start.toISOString(), endTime: new Date(start.getTime() + hours * 3600000).toISOString() };
  };

  useEffect(() => {
    if (!date || !validTime(time) || !f.city.trim()) { setPrice(null); setFree([]); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      const r = range();
      const q = `startTime=${encodeURIComponent(r.startTime)}&endTime=${encodeURIComponent(r.endTime)}&city=${encodeURIComponent(f.city.trim())}`;
      Promise.all([api('/price', 'POST', r), api('/availability?' + q)])
        .then(([p, a]) => { if (live) { setPrice(p); setFree(a); setPick('any'); } })
        .catch((e) => { if (live) { setPrice(null); setFree([]); notify(e.message, true); } });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [date, time, hours, f.city]);

  const book = async () => {
    if (!user) return requireLogin('Please log in or create an account to confirm your booking. Your details are saved, you will not have to fill them again.');
    if (user.role !== 'patient') return notify('Please use a patient account to book', true);
    if (payBusy) return;
    try {
      setPayBusy(true);
      const order = await api('/bookings/create-payment', 'POST', {
        ...f, ...range(), helperId: pick === 'any' ? undefined : pick,
      });
      CFPaymentGatewayService.setCallback({
        onVerify: async (orderID) => {
          try {
            const result = await api('/payments/verify', 'POST', { orderId: orderID });
            if (result.paymentStatus === 'paid') {
              notify('Payment successful. Your booking is confirmed ✅');
              done();
            } else {
              notify('Payment is not confirmed yet. Please check My bookings.');
            }
          } catch (e) {
            notify(e.message || 'Payment confirmation is pending. Check My bookings.', true);
          } finally {
            setPayBusy(false);
            CFPaymentGatewayService.removeCallback();
          }
        },
        onError: (error) => {
          notify('Payment was not completed. Your booking is still unpaid. Please try again.', true);
          setPayBusy(false);
          CFPaymentGatewayService.removeCallback();
        },
      });
      const environment = order.environment === 'PRODUCTION' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
      const session = new CFSession(order.paymentSessionId, order.orderId, environment);
      CFPaymentGatewayService.doWebPayment(session);
    } catch (e) {
      setPayBusy(false);
      CFPaymentGatewayService.removeCallback();
      notify(e.message || 'Could not start Cashfree checkout', true);
    }
  };

  // after a guest logs in, finish the booking they started
  useEffect(() => { if (resume) book(); }, [resume]);

  return (
    <View>
      <View style={s.card}><Text style={s.muted}>💰 Charged per hour only. Day (6 AM–8 PM) ₹150/hr • Night (8 PM–6 AM) ₹200/hr. After 24 hours the rate drops by ₹10 every hour, down to a minimum of ₹120/hr.</Text></View>

      <Text style={s.sec}>1. What do you need help with?</Text>
      <View style={s.svcGrid}>
        {SERVICES.map((sv) => (
          <TouchableOpacity key={sv.id} style={[s.svc, f.service === sv.id && s.chipOn]} onPress={() => setF({ ...f, service: sv.id })}>
            <Text style={{ fontSize: 24 }}>{sv.icon}</Text><Text style={{ textAlign: 'center' }}>{sv.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sec}>2. Which hospital?</Text>
      <Input placeholder="Hospital name" value={f.hospital} onChangeText={set('hospital')} />
      <Input placeholder="City" value={f.city} onChangeText={set('city')} />
      <Input placeholder="Anything we should know? (doctor, department, reports...)" multiline value={f.details} onChangeText={set('details')} />

      <Text style={s.sec}>3. Which day? (you can book in advance)</Text>
      <View style={s.card}><Calendar value={date} onChange={setDate} /></View>
      {!!date && <Text style={{ color: '#15803d' }}>📅 {fmtDay(date)}</Text>}

      <Text style={s.sec}>4. Start time and duration</Text>
      <Input placeholder="Start time, 24-hour (e.g. 09:30 or 18:00)" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
      {!validTime(time) && <Text style={{ color: C.err }}>Enter the time like 09:30 (24-hour format)</Text>}
      <View style={s.chips}>{['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'].map((t) => <Chip key={t} label={t} on={time === t} onPress={() => setTime(t)} />)}</View>
      <View style={s.chips}>{[2, 4, 8, 12, 24, 48].map((h) => <Chip key={h} label={`${h} hr`} on={hours === h} onPress={() => setHours(h)} />)}</View>
      <View style={s.stepper}>
        <Btn small title="−" onPress={() => setHours(Math.max(1, hours - 1))} />
        <Text style={{ fontSize: 20, fontWeight: '700', minWidth: 70, textAlign: 'center' }}>{hours} hr</Text>
        <Btn small title="+" onPress={() => setHours(Math.min(240, hours + 1))} />
      </View>

      {price && <>
        <Text style={s.sec}>5. Choose your {ROLE_NAME}</Text>
        <View style={s.card}>
          {free.length > 0
            ? <Text style={{ color: '#15803d' }}>✅ {free.length} {ROLE_NAME}{free.length > 1 ? 's are' : ' is'} available</Text>
            : <Text style={s.muted}>No one is free at this time. Send a request and you will be confirmed as soon as a {ROLE_NAME} accepts it.</Text>}
          {free.length > 0 && <>
            <TouchableOpacity style={s.opt} onPress={() => setPick('any')}><Text>{pick === 'any' ? '🔘' : '⚪'} Any available (instant confirmation)</Text></TouchableOpacity>
            {free.map((a) => <TouchableOpacity key={a.id} style={s.opt} onPress={() => setPick(a.id)}><Text>{pick === a.id ? '🔘' : '⚪'} {a.name}</Text></TouchableOpacity>)}
          </>}
        </View>
        <View style={s.card}>
          <Text style={s.muted}>{price.totalHours} hours • average ₹{price.avgPerHour}/hr</Text>
          <Text style={s.price}>Total: ₹{price.total}</Text>
        </View>
        <Btn title={payBusy ? 'Opening secure payment...' : (user ? '' : 'Log in & ') + 'Pay & confirm booking'} disabled={!f.hospital.trim() || payBusy} onPress={book} />
        {!f.hospital.trim() && <Text style={s.muted}>Please enter the hospital name.</Text>}
        {!user && <Text style={s.muted}>You only need to log in at this last step.</Text>}
      </>}
      <SupportCard />
    </View>
  );
}

// ---------- My bookings (patient and Care Associate) ----------
function MyBookings({ notify, isAssoc, tick }) {
  const [list, setList] = useState([]);
  const [day, setDay] = useState(null);
  const load = () => api('/bookings/mine').then(setList).catch((e) => notify(e.message, true));
  useEffect(() => { load(); const timer = setInterval(load, 20000); return () => clearInterval(timer); }, [tick]);
  const act = async (id, what) => { try { if (what === 'start') await requestCareLocationPermissions(); await api(`/bookings/${id}/${what}`, 'POST'); if (what === 'start') await startCareLocationTracking(id, API_URL); if (what === 'end') await stopCareLocationTracking().catch(() => {}); load(); } catch (e) { notify(e.message, true); load(); } };
  const toggleDuty = (b, on) => {
    if (on) return act(b._id, 'start');
    return Alert.alert('Switch off duty?', 'This records the end of your time with the patient.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch off', onPress: () => act(b._id, 'end') },
    ]);
  };
  const shown = day ? list.filter((b) => ymd(new Date(b.startTime)) === day) : list;

  return (
    <View>
      <View style={s.card}>
        <Calendar value={day} allowPast onChange={(d) => setDay(d === day ? null : d)}
          marked={list.filter((b) => b.status !== 'cancelled').map((b) => ymd(new Date(b.startTime)))} />
        <Text style={s.muted}>🟠 marks a day with a booking. Tap a date to filter.</Text>
      </View>
      <Text style={s.h3}>{day ? fmtDay(day) : 'All bookings'}</Text>
      {shown.length === 0 && <Text style={s.muted}>No bookings yet.</Text>}
      {shown.map((b) => (
        <BookingCard key={b._id} b={b} isAssoc={isAssoc}>
          {!isAssoc && ['pending', 'accepted'].includes(b.status) && <Btn kind="danger" title="Cancel booking" onPress={() => act(b._id, 'cancel')} />}
          {isAssoc && ['accepted', 'ongoing'].includes(b.status) && (
            <View style={[s.rowBetween, s.dutyBox]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontWeight: '700' }}>{b.status === 'ongoing' ? 'On duty' : 'Off duty'}</Text>
                <Text style={s.muted}>{b.status === 'ongoing' ? 'Switch off when the work is finished' : 'Switch on when you join the patient'}</Text>
              </View>
              <Switch value={b.status === 'ongoing'} onValueChange={(v) => toggleDuty(b, v)} trackColor={{ true: C.p }} />
            </View>
          )}
          <BookingTools booking={b} isAssoc={isAssoc} api={api} apiUrl={API_URL} notify={notify} />
        </BookingCard>
      ))}
    </View>
  );
}

// ---------- Care Associate: profile ----------
function Profile({ user, setUser, notify }) {
  const [upi, setUpi] = useState(user.upiId || '');
  const saveUpi = () => {
    if (!UPI_RE.test(upi.trim())) return notify('Enter a valid UPI ID, for example name@bank', true);
    return api('/me/upi', 'POST', { upiId: upi.trim() }).then((u) => { setUser(u); notify('UPI ID saved. The admin will re-verify your account.'); }).catch((e) => notify(e.message, true));
  };
  const upload = async () => {
    try {
      const p = await pickPhoto();
      if (!p) return;
      setUser(await api('/me/aadhaar', 'POST', { image: p.base64 }));
      notify('Aadhaar uploaded. The admin will review it.');
    } catch (e) { notify(e.message, true); }
  };
  return (
    <View>
      <View style={s.card}>
        <Text style={s.h2}>{user.name}</Text>
        <Text style={s.muted}>{user.phone} • {user.city}</Text>
        <Text style={[s.tag, { alignSelf: 'flex-start', marginTop: 8, backgroundColor: user.verified ? '#dcfce7' : '#fef3c7' }]}>
          {user.verified ? '✅ Verified' : '⏳ Waiting for admin verification'}
        </Text>
      </View>
      <View style={s.card}>
        <Text style={{ fontWeight: '700' }}>UPI ID for payments</Text>
        <Input placeholder="name@bank" autoCapitalize="none" autoCorrect={false} value={upi} onChangeText={setUpi} />
        <Btn title="Save UPI ID" onPress={saveUpi} />
      </View>
      <View style={s.card}>
        <Text style={{ fontWeight: '700' }}>Masked Aadhaar card</Text>
        <Text style={s.muted}>{user.aadhaarUploaded ? `Uploaded on ${fmt(user.aadhaarAt)}` : 'Not uploaded yet'}</Text>
        <Text style={s.muted}>Only the last 4 digits of the number should be visible. Uploading a new photo needs re-verification.</Text>
        <Btn title={user.aadhaarUploaded ? 'Replace photo' : 'Upload masked Aadhaar'} onPress={upload} />
      </View>
    </View>
  );
}

// ---------- Care Associate ----------
function Associate({ user, setUser, notify, tab }) {
  const [open, setOpen] = useState([]);
  const [mine, setMine] = useState([]);
  const load = () => {
    api('/bookings/open').then(setOpen).catch((e) => notify(e.message, true));
    api('/bookings/mine').then(setMine).catch(() => {});
  };
  useEffect(() => { load(); }, [tab]);
  const toggleAvail = (v) => api('/me/available', 'POST', { available: v }).then(setUser).catch((e) => notify(e.message, true));
  const toggleLeave = (d) => api('/me/leave', 'POST', { date: d }).then(setUser).catch((e) => notify(e.message, true));
  const accept = (id) => api(`/bookings/${id}/accept`, 'POST').then(() => { notify('Job accepted ✅'); load(); }).catch((e) => notify(e.message, true));

  if (tab === 'profile') return <Profile user={user} setUser={setUser} notify={notify} />;
  if (tab === 'mine') return <MyBookings notify={notify} isAssoc tick={tab} />;
  if (tab === 'cal') return (
    <View style={s.card}>
      <Text style={{ fontWeight: '700' }}>My availability calendar</Text>
      <Text style={s.muted}>Tap a date you cannot work and it turns red. Tap again to undo. 🟠 marks a day with a job.</Text>
      <Calendar onChange={toggleLeave} leave={user.leaveDates} marked={mine.filter((b) => ['accepted', 'ongoing'].includes(b.status)).map((b) => ymd(new Date(b.startTime)))} />
    </View>
  );

  const onDuty = mine.find((b) => b.status === 'ongoing');
  return (
    <View>
      {onDuty && <View style={[s.card, { backgroundColor: '#ede9fe' }]}><Text style={{ fontWeight: '700' }}>🟣 You are on duty</Text><Text style={s.muted}>{onDuty.hospital} • since {fmt(onDuty.actualStart)}. Open "My jobs" to switch off when you finish.</Text></View>}
      {!user.verified && (
        <View style={s.card}>
          <Text style={{ color: C.err }}>Your account is not verified yet. The admin will verify it before you can accept jobs.</Text>
          {(!user.aadhaarUploaded || !user.upiId) && <Text style={s.muted}>Please complete your Profile first (UPI ID and masked Aadhaar).</Text>}
        </View>
      )}
      <View style={[s.card, s.rowBetween]}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontWeight: '700' }}>I am available</Text>
          <Text style={s.muted}>When ON, patients can book you directly.</Text>
        </View>
        <Switch value={user.available} onValueChange={toggleAvail} trackColor={{ true: C.p }} />
      </View>
      <Text style={s.h3}>New jobs in {user.city}</Text>
      {open.length === 0 && <Text style={s.muted}>No new jobs right now.</Text>}
      {open.map((b) => <BookingCard key={b._id} b={b} isAssoc><Btn title="Accept job" onPress={() => accept(b._id)} /></BookingCard>)}
    </View>
  );
}

// ---------- Admin ----------
function Admin({ tab, notify }) {
  const [users, setUsers] = useState([]);
  const [data, setData] = useState({ revenue: 0, bookings: [] });
  const [showId, setShowId] = useState(null);
  const load = () => {
    api('/admin/users').then(setUsers).catch((e) => notify(e.message, true));
    api('/admin/bookings').then(setData).catch(() => {});
  };
  useEffect(() => { load(); }, [tab]);
  const toggle = (id) => api(`/admin/users/${id}/verify`, 'POST').then(load).catch((e) => notify(e.message, true));

  if (tab === 'bookings') return <View>{data.bookings.map((b) => <BookingCard key={b._id} b={b} admin />)}</View>;
  return (
    <View>
      <View style={s.card}><Text style={{ fontWeight: '700' }}>Paid revenue (completed bookings)</Text><Text style={s.price}>₹{data.revenue}</Text></View>
      <Text style={s.h3}>Users</Text>
      {users.map((u) => (
        <View style={s.card} key={u.id}>
          <Text style={{ fontWeight: '700' }}>{u.name} • {u.role === 'helper' ? ROLE_NAME : 'Patient'}{u.verified ? ' ✅' : ''}</Text>
          <Text style={s.muted}>{u.phone} • {u.city}</Text>
          {u.role === 'helper' && <>
            <Text style={s.muted}>UPI: {u.upiId || 'not provided'}</Text>
            <Text style={s.muted}>Aadhaar: {u.aadhaarUploaded ? 'uploaded' : 'not uploaded'}</Text>
            {u.aadhaarUploaded && <Btn kind="alt" title={showId === u.id ? 'Hide Aadhaar' : 'View Aadhaar'} onPress={() => setShowId(showId === u.id ? null : u.id)} />}
            {showId === u.id && (
              <Image source={{ uri: `${API_URL}/api/admin/users/${u.id}/aadhaar`, headers: { Authorization: 'Bearer ' + TOKEN } }} style={s.preview} resizeMode="contain" />
            )}
            <Btn title={u.verified ? 'Remove verification' : 'Verify'} onPress={() => toggle(u.id)} />
          </>}
        </View>
      ))}
    </View>
  );
}

// ---------- App shell ----------
const TABS = {
  guest: [['new', '➕', 'Book'], ['mine', '📅', 'My bookings'], ['help', '📞', 'Help'], ['login', '🔑', 'Log in']],
  patient: [['new', '➕', 'Book'], ['mine', '📅', 'My bookings'], ['help', '📞', 'Help']],
  helper: [['jobs', '🩺', 'Jobs'], ['mine', '📋', 'My jobs'], ['cal', '📅', 'Calendar'], ['profile', '👤', 'Profile']],
  admin: [['users', '👥', 'Users'], ['bookings', '📋', 'Bookings']],
};

function Root() {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboard();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState(null);
  const [toast, setToast] = useState(null);
  const [auth, setAuth] = useState(null); // null | { mode, reason }
  const [pendingBook, setPendingBook] = useState(false);
  const [resume, setResume] = useState(0);
  const notify = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem('token');
        if (t) { TOKEN = t; setUser(await api('/me')); }
      } catch (e) { TOKEN = ''; await AsyncStorage.removeItem('token'); }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!user || !['patient', 'helper'].includes(user.role)) return undefined;
    let active = true;
    (async () => {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
      if (!projectId) { console.warn('Set extra.eas.projectId after running eas init to enable push notifications.'); return; }
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('booking-updates', { name: 'Booking updates', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250] });
      const permission = await Notifications.getPermissionsAsync();
      let status = permission.status;
      if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
      if (status !== 'granted') return;
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      if (active && token) await api('/push-token', 'POST', { expoPushToken: token });
    })().catch((e) => console.warn('Push registration:', e.message));
    return () => { active = false; };
  }, [user?.id]);

  const openAuth = (mode = 'login', reason = '') => setAuth({ mode, reason });
  const requireLogin = (reason) => { setPendingBook(true); openAuth('login', reason); };
  const onLogin = (u) => {
    setUser(u);
    setAuth(null);
    setTab(null);
    if (pendingBook && u.role === 'patient') setResume((r) => r + 1);
    setPendingBook(false);
  };

  const toastEl = toast && <View style={[s.toast, { top: insets.top + 70 }, toast.bad && { backgroundColor: '#b91c1c' }]}><Text style={{ color: '#fff' }}>{toast.m}</Text></View>;

  if (!ready) return <View style={[s.screen, { justifyContent: 'center', alignItems: 'center' }]}><Logo size={90} /><ActivityIndicator style={{ marginTop: 20 }} size="large" color={C.p} /></View>;

  const role = user ? user.role : 'guest';
  const tabs = TABS[role];
  const cur = tab && tabs.some((t) => t[0] === tab && t[0] !== 'login') ? tab : tabs[0][0];
  const logout = async () => { await stopCareLocationTracking().catch(() => {}); TOKEN = ''; await AsyncStorage.removeItem('token'); setUser(null); setTab(null); };
  const onTab = (id) => (id === 'login' ? (setPendingBook(false), openAuth('login')) : setTab(id));

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={s.rowBetween}>
          <Logo size={38} />
          <View style={{ marginLeft: 10 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Care Associate</Text>
            <Text style={{ color: '#d1fae5', fontSize: 12 }}>{user ? `${user.name} • ${user.role === 'helper' ? ROLE_NAME : user.role === 'admin' ? 'Admin' : 'Patient'}` : 'Trusted help for every hospital visit'}</Text>
          </View>
        </View>
        {user
          ? <Btn small kind="alt" title="Log out" onPress={logout} />
          : <Btn small kind="light" title="Log in" onPress={() => { setPendingBook(false); openAuth('login'); }} />}
      </View>
      {toastEl}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          {(role === 'guest' || role === 'patient') && (
            // NewBooking stays mounted (hidden) so a guest does not lose the form while logging in
            <>
              <View style={cur === 'new' ? null : { display: 'none' }}>
                <NewBooking user={user} notify={notify} requireLogin={requireLogin} resume={resume} done={() => setTab('mine')} />
              </View>
              {cur === 'mine' && (user
                ? <MyBookings notify={notify} tick={cur} />
                : <LoginPrompt onLogin={() => openAuth('login')} onRegister={() => openAuth('register')} />)}
              {cur === 'help' && <Help />}
            </>
          )}
          {role === 'helper' && <Associate user={user} setUser={setUser} notify={notify} tab={cur} />}
          {role === 'admin' && <Admin tab={cur} notify={notify} />}
        </ScrollView>
      </KeyboardAvoidingView>
      {!keyboard && (
        <View style={[s.nav, { paddingBottom: insets.bottom + 8 }]}>
          {tabs.map(([id, icon, label]) => (
            <TouchableOpacity key={id} style={s.navItem} onPress={() => onTab(id)}>
              <Text style={{ fontSize: 20 }}>{icon}</Text>
              <Text style={{ fontSize: 12, color: cur === id ? C.p : C.mute, fontWeight: cur === id ? '700' : '400' }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {auth && (
        <View style={[s.authOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            <Auth key={auth.mode} initialMode={auth.mode} reason={auth.reason} notify={notify} onLogin={onLogin}
              onClose={() => { setAuth(null); setPendingBook(false); }} />
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><Root /></SafeAreaProvider>;
}

// ---------- Styles ----------
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.p, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  brand: { fontSize: 32, fontWeight: '800', color: C.p, marginTop: 18 },
  tagline: { color: C.mute, marginTop: 6, fontSize: 15, textAlign: 'center' },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  h3: { fontSize: 17, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  sec: { fontWeight: '700', marginTop: 16, marginBottom: 6, fontSize: 15 },
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginVertical: 6, elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4 },
  muted: { color: C.mute, fontSize: 13, marginVertical: 2 },
  duty: { color: '#5b21b6', fontSize: 13, marginVertical: 2, fontWeight: '600' },
  dutyBox: { backgroundColor: '#f5f3ff', borderRadius: 10, padding: 10, marginTop: 8 },
  price: { fontSize: 20, fontWeight: '700', color: C.p, marginVertical: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, fontSize: 12, overflow: 'hidden' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 11, marginVertical: 5, fontSize: 15, backgroundColor: '#fff' },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, marginVertical: 4, alignItems: 'center', alignSelf: 'stretch' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'auto', marginVertical: 0 },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  preview: { width: '100%', height: 200, marginVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  chip: { borderWidth: 2, borderColor: C.line, backgroundColor: '#fff', borderRadius: 99, paddingVertical: 7, paddingHorizontal: 13 },
  chipOn: { borderColor: C.p, backgroundColor: '#ecfdf5' },
  svcGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  svc: { width: '48%', borderWidth: 2, borderColor: C.line, backgroundColor: '#fff', borderRadius: 12, padding: 10, alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  opt: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  calHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  wd: { width: '14.2857%', textAlign: 'center', color: C.mute, fontSize: 12, paddingVertical: 4 },
  cell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' },
  day: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1.5, borderColor: C.p },
  daySel: { backgroundColor: C.p },
  dayLeave: { backgroundColor: '#fee2e2' },
  dot: { position: 'absolute', bottom: 3, width: 5, height: 5, borderRadius: 3, backgroundColor: '#f59e0b' },
  nav: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  support: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  authOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 10 },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: '#166534', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 14, zIndex: 20, maxWidth: '92%' },
});
