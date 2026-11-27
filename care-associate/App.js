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
import * as Location from 'expo-location';
import { BookingTools, requestCareLocationPermissions, startCareLocationTracking, stopCareLocationTracking } from './Phase3';
import { CFPaymentGatewayService } from 'react-native-cashfree-pg-sdk';
import { CFEnvironment, CFSession } from 'cashfree-pg-api-contract';

// The server address is detected automatically (the computer running "expo start").
// Server port: change only if you changed PORT in care-associate-server/.env
const API_PORT = 5001;
// Configure the deployed HTTPS backend with EXPO_PUBLIC_API_URL at build time,
// or set expo.extra.apiUrl in app.json. Local Metro/emulator fallback is for development only.
const API_OVERRIDE = String(process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || '').trim().replace(/\/+$/, '');
const devHost = (Constants.expoConfig?.hostUri || '').split(':')[0];
const API_URL = API_OVERRIDE || (__DEV__ && devHost ? `http://${devHost}:${API_PORT}` : 'https://care-associate-server.vercel.app');

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

const ROLE_NAME = 'Care Associate';
// Help line shown on the login/register screens, Help tab and booking page.
// TODO: yahan apna asli mobile number daalo (country code ke saath)
const SUPPORT_PHONE = String(Constants.expoConfig?.extra?.supportPhone || '').trim();
const C = { p: '#0f766e', bg: '#f4f8f7', card: '#ffffff', mute: '#64748b', err: '#dc2626', line: '#e1eae8' };
let ACTIVE_NAV_LABELS = {};
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
const SERVICE_DETAILS = {
  queue: { title: 'Queue & Token Assistance', subtitle: 'Skip the confusion at hospital counters. Your Care Associate can help manage the queue and token process.', points: ['Token and registration counter guidance', 'Queue status and waiting support', 'Updates to the patient or family'], steps: ['Choose hospital and preferred time', 'Share counter or department details', 'Confirm booking and track your associate'] },
  report: { title: 'Medical Reports Collection', subtitle: 'Get help collecting, submitting or showing reports at the right hospital desk.', points: ['Collect reports from diagnostic centres', 'Submit reports at hospital departments', 'Keep family updated on task progress'], steps: ['Select the hospital or diagnostic centre', 'Mention report type and collection desk', 'Track the task until completion'] },
  accompany: { title: 'Patient Accompaniment', subtitle: 'A Care Associate can accompany a patient during a hospital visit and help with non-clinical tasks.', points: ['Hospital navigation and department guidance', 'Support with registration and counters', 'Coordination with the family contact'], steps: ['Add patient and hospital details', 'Choose visit date and duration', 'Meet your assigned Care Associate'] },
  medicine: { title: 'Medicine Assistance', subtitle: 'Get help with medicine pickup and pharmacy visits. Prescription and purchase decisions remain with the patient and doctor.', points: ['Medicine pickup from a named pharmacy', 'Queue and billing counter assistance', 'Delivery of the packed medicines to the agreed person'], steps: ['Enter pharmacy and pickup instructions', 'Keep prescription ready where required', 'Confirm handover with your associate'] },
  admission: { title: 'Admission & Discharge Support', subtitle: 'Get practical help navigating hospital admission or discharge counters and paperwork.', points: ['Help locate admission and discharge desks', 'Coordinate document movement and queues', 'Keep a family contact informed'], steps: ['Select hospital and admission or discharge task', 'Add relevant non-sensitive instructions', 'Track the associate during the visit'] },
  insurance: { title: 'Insurance & Ayushman Assistance', subtitle: 'Get non-clinical help navigating insurance desks and document submission processes.', points: ['Locate insurance or scheme help desks', 'Organise the documents you provide', 'Coordinate submission and status updates'], steps: ['Choose the relevant hospital desk', 'List the documents you already have', 'Follow the task status in your bookings'] },
  other: { title: 'Custom Hospital Task', subtitle: 'Need help with another non-medical hospital task? Describe it and our team can review the request.', points: ['Custom errands inside the hospital', 'Document or counter coordination', 'Clear instructions and status updates'], steps: ['Describe the task clearly', 'Choose your hospital, date and duration', 'Confirm after reviewing availability and price'] },
};
const STATUS = { awaiting_payment: 'Payment pending', pending: 'Waiting for associate', accepted: 'Confirmed', on_the_way: 'Associate on the way', ongoing: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_BG = { awaiting_payment: '#ffedd5', pending: '#fef3c7', accepted: '#dbeafe', on_the_way: '#cffafe', ongoing: '#ede9fe', completed: '#dcfce7', cancelled: '#fee2e2' };
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
      <Text style={on ? { fontWeight: '700' } : null}>{ACTIVE_NAV_LABELS[label] || label}</Text>
    </TouchableOpacity>
  );
}
function SupportCard({ title = 'Having trouble registering or booking?' }) {
  const canCall = /^[+0-9 ()-]{7,20}$/.test(SUPPORT_PHONE) && (SUPPORT_PHONE.match(/[0-9]/g) || []).length >= 7;
  const call = () => Linking.openURL('tel:' + SUPPORT_PHONE.replace(/\\s/g, '')).catch(() => Alert.alert('Call us', SUPPORT_PHONE));
  return (
    <View style={[s.card, s.support]}>
      <Text style={{ fontWeight: '700' }}>📞 {title}</Text>
      <Text style={s.muted}>{canCall ? 'Not able to register or stuck somewhere? Call our support team for help.' : 'Support phone number has not been configured yet. Please contact the service administrator for assistance.'}</Text>
      {canCall && <Btn title={`Call ${SUPPORT_PHONE}`} onPress={call} />}
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
function NewBooking({ user, notify, done, requireLogin, resume, repeatBooking, onOpenService, selectedService }) {
  const [f, setF] = useState({ service: 'queue', hospital: '', city: user?.city || '', details: '' });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [hours, setHours] = useState(4);
  const [price, setPrice] = useState(null);
  const [free, setFree] = useState([]);
  const [pick, setPick] = useState('any');
  const [patientExperience, setPatientExperience] = useState(null);
  const [familyProfileId, setFamilyProfileId] = useState('');
  const [hospitalLocation,setHospitalLocation]=useState(null);
  const [payBusy, setPayBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  useEffect(() => { if (selectedService) setF(old => ({ ...old, service: selectedService })); }, [selectedService]);
  useEffect(() => { if (user?.role === 'patient') api('/patient/experience').then(setPatientExperience).catch(() => {}); else setPatientExperience(null); }, [user?.id]);
  useEffect(() => { if (repeatBooking) { setF(old => ({ ...old, service: repeatBooking.service || 'queue', hospital: repeatBooking.hospital || '', city: repeatBooking.city || user?.city || '', details: repeatBooking.details || '' })); setDate(''); setPick('any'); } }, [repeatBooking?._id]);

  const range = () => {
    const [y, mo, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    const start = new Date(y, mo - 1, d, hh, mm);
    return { startTime: start.toISOString(), endTime: new Date(start.getTime() + hours * 3600000).toISOString() };
  };

  useEffect(()=>{let live=true;const timer=setTimeout(async()=>{if(!f.hospital.trim()||!f.city.trim()){setHospitalLocation(null);return;}try{const found=await Location.geocodeAsync(`${f.hospital}, ${f.city}`);if(live&&found?.[0])setHospitalLocation({latitude:found[0].latitude,longitude:found[0].longitude});else if(live)setHospitalLocation(null);}catch{if(live)setHospitalLocation(null);}},700);return()=>{live=false;clearTimeout(timer);};},[f.hospital,f.city]);

  useEffect(() => {
    if (!date || !validTime(time) || !f.city.trim()) { setPrice(null); setFree([]); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      const r = range();
      const loc = hospitalLocation ? `&latitude=${hospitalLocation.latitude}&longitude=${hospitalLocation.longitude}` : '';
      const q = `startTime=${encodeURIComponent(r.startTime)}&endTime=${encodeURIComponent(r.endTime)}&city=${encodeURIComponent(f.city.trim())}${loc}`;
      Promise.all([api('/price', 'POST', r), api('/availability?' + q)])
        .then(([p, a]) => { if (live) { setPrice(p); setFree(a); setPick('any'); } })
        .catch((e) => { if (live) { setPrice(null); setFree([]); notify(e.message, true); } });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [date, time, hours, f.city, hospitalLocation?.latitude, hospitalLocation?.longitude]);

  const book = async () => {
    if (!user) return requireLogin('Please log in or create an account to confirm your booking. Your details are saved, you will not have to fill them again.');
    if (user.role !== 'patient') return notify('Please use a patient account to book', true);
    if (payBusy) return;
    try {
      setPayBusy(true);
      const order = await api('/bookings/create-payment', 'POST', {
        ...f, ...range(), helperId: pick === 'any' ? undefined : pick, familyProfileId: familyProfileId || undefined, hospitalLocation: hospitalLocation || undefined,
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
          <TouchableOpacity key={sv.id} style={[s.svc, f.service === sv.id && s.chipOn]} onPress={() => onOpenService ? onOpenService(sv.id) : setF({ ...f, service: sv.id })}>
            <Text style={{ fontSize: 24 }}>{sv.icon}</Text><Text style={{ textAlign: 'center' }}>{sv.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sec}>2. Which hospital?</Text>
      <Input placeholder="Hospital name" value={f.hospital} onChangeText={set('hospital')} />
      {!!patientExperience?.savedHospitals?.length && <View style={s.chips}>{patientExperience.savedHospitals.map(h => <Chip key={h._id} label={h.name} on={f.hospital === h.name && f.city === h.city} onPress={() => setF(old => ({ ...old, hospital: h.name, city: h.city }))} />)}</View>}
      <Input placeholder="City" value={f.city} onChangeText={set('city')} />
      <Input placeholder="Anything we should know? (doctor, department, reports...)" multiline value={f.details} onChangeText={set('details')} />
      {!!patientExperience?.familyProfiles?.length && <><Text style={s.sec}>Booking for</Text><View style={s.chips}><Chip label="Myself" on={!familyProfileId} onPress={() => setFamilyProfileId('')} />{patientExperience.familyProfiles.map(p => <Chip key={p._id} label={p.name + ' (' + p.relation + ')'} on={familyProfileId === p._id} onPress={() => setFamilyProfileId(p._id)} />)}</View></>}

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
            {free.map((a) => <TouchableOpacity key={a.id} style={s.opt} onPress={() => setPick(a.id)}><Text>{pick === a.id ? '🔘' : '⚪'} {a.name} • ⭐ {a.ratingAverage||'New'}{a.distanceKm!=null?` • ${a.distanceKm.toFixed(1)} km`:''}</Text></TouchableOpacity>)}
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

// ---------- Dedicated service detail pages ----------
function ServiceDetail({ serviceId, onBack, onContinue }) {
  const service = svcOf(serviceId);
  const detail = SERVICE_DETAILS[service.id] || SERVICE_DETAILS.other;
  return (
    <View>
      <Btn kind="alt" small title="‹ Back to services" onPress={onBack} />
      <View style={[s.card, { backgroundColor: '#e8f4f1', borderColor: '#c8e3dc', padding: 20 }]}>
        <Text style={{ fontSize: 38 }}>{service.icon}</Text>
        <Text style={[s.h2, { fontSize: 23, color: '#123c38', marginTop: 8 }]}>{detail.title}</Text>
        <Text style={{ color: '#49645f', lineHeight: 21 }}>{detail.subtitle}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
          <Text style={s.tag}>Verified associates</Text>
          <Text style={s.tag}>Live booking status</Text>
          <Text style={s.tag}>Secure checkout</Text>
        </View>
      </View>
      <Text style={s.h3}>What this service includes</Text>
      {detail.points.map((point, i) => (
        <View key={point} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Text style={{ color: C.p, fontSize: 20, fontWeight: '800' }}>✓</Text>
          <Text style={{ flex: 1, color: '#28433f', lineHeight: 20 }}>{point}</Text>
        </View>
      ))}
      <Text style={s.h3}>How it works</Text>
      <View style={s.card}>
        {detail.steps.map((step, i) => (
          <View key={step} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#dcefe9', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.p, fontWeight: '800' }}>{i + 1}</Text>
            </View>
            <Text style={{ flex: 1, color: '#28433f', lineHeight: 20, paddingTop: 3 }}>{step}</Text>
          </View>
        ))}
      </View>
      <View style={[s.card, { backgroundColor: '#fffaf0', borderColor: '#f2dfb7' }]}>
        <Text style={{ fontWeight: '700', color: '#704d12' }}>Important</Text>
        <Text style={{ color: '#765b2b', fontSize: 13, lineHeight: 19, marginTop: 4 }}>Care Associates provide non-clinical assistance. They do not diagnose, prescribe medicines or provide nursing or emergency medical treatment.</Text>
      </View>
      <Btn title="Continue to booking" onPress={() => onContinue(service.id)} />
    </View>
  );
}

// ---------- My bookings (patient and Care Associate) ----------
function MyBookings({ notify, isAssoc, tick, onRepeat }) {
  const [list, setList] = useState([]);
  const [day, setDay] = useState(null);
  const [reviewRatings,setReviewRatings]=useState({});
  const [reviewComments,setReviewComments]=useState({});
  const [bookingSearch,setBookingSearch]=useState('');
  const [selectedBooking,setSelectedBooking]=useState(null);
  const load = () => api('/bookings/mine').then(setList).catch((e) => notify(e.message, true));
  useEffect(() => { load(); const timer = setInterval(load, 20000); return () => clearInterval(timer); }, [tick]);
  const act = async (id, what) => { try { if (what === 'start') { await requestCareLocationPermissions(); await api(`/bookings/${id}/start`, 'POST'); try { await startCareLocationTracking(id, API_URL); } catch (trackingError) { await api(`/bookings/${id}/end`, 'POST').catch(() => {}); throw trackingError; } } else if (what === 'cancel') { await api(`/bookings/${id}/cancel`, 'POST'); } else { await api(`/bookings/${id}/end`, 'POST'); await stopCareLocationTracking().catch(() => {}); } load(); } catch (e) { notify(e.message, true); load(); } };
  const markOnTheWay = id => api(`/bookings/${id}/on-the-way`,'POST').then(()=>{notify('Patient ko bataya: aap raste mein hain');load();}).catch(e=>notify(e.message,true));
  const submitReview = id => api(`/bookings/${id}/review`,'POST',{rating:Number(reviewRatings[id]||5),comment:reviewComments[id]||''}).then(()=>{notify('Review submitted');load();}).catch(e=>notify(e.message,true));
  const toggleDuty = (b, on) => {
    if (on) return act(b._id, 'start');
    return Alert.alert('Switch off duty?', 'This records the end of your time with the patient.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch off', onPress: () => act(b._id, 'end') },
    ]);
  };
  const shown = (day ? list.filter((b) => ymd(new Date(b.startTime)) === day) : list).filter((b) => !bookingSearch.trim() || [b.hospital,b.city,b.service,b.status].filter(Boolean).join(' ').toLowerCase().includes(bookingSearch.trim().toLowerCase()));
  if (selectedBooking) return (
    <View>
      <Btn kind="alt" title="‹ Back to my bookings" onPress={()=>setSelectedBooking(null)}/>
      <View style={[s.card,{backgroundColor:'#e8f4f1'}]}><Text style={s.h2}>Booking details</Text><Text style={s.muted}>Your service schedule, assigned Care Associate and booking updates.</Text></View>
      <BookingCard b={selectedBooking} isAssoc={isAssoc}/>
      {!isAssoc && selectedBooking.paymentStatus==='paid' && <Btn kind="light" title="Book this service again" onPress={()=>{setSelectedBooking(null);onRepeat?.(selectedBooking);}}/>}
      {!isAssoc && ['pending','accepted','on_the_way'].includes(selectedBooking.status) && <Btn kind="danger" title="Cancel booking" onPress={()=>act(selectedBooking._id,'cancel').then(()=>setSelectedBooking(null))}/>}
      {isAssoc && selectedBooking.status==='accepted' && <Btn kind="alt" title="I am on the way" onPress={()=>markOnTheWay(selectedBooking._id)}/>}
      {isAssoc && ['accepted','on_the_way','ongoing'].includes(selectedBooking.status) && <View style={[s.card,s.dutyBox]}><Text style={{fontWeight:'700'}}>{selectedBooking.status==='ongoing'?'On duty':selectedBooking.status==='on_the_way'?'On the way':'Off duty'}</Text><Text style={s.muted}>Use the switch on the booking list to start or end duty.</Text></View>}
      {!isAssoc && selectedBooking.status==='completed' && !selectedBooking.reviewSubmittedAt && <View style={s.card}><Text style={{fontWeight:'700'}}>Rate your Care Associate</Text><Input placeholder="Rating 1–5 (default 5)" keyboardType="number-pad" value={String(reviewRatings[selectedBooking._id]||'')} onChangeText={v=>setReviewRatings(old=>({...old,[selectedBooking._id]:v}))}/><Input placeholder="Feedback (optional)" value={reviewComments[selectedBooking._id]||''} onChangeText={v=>setReviewComments(old=>({...old,[selectedBooking._id]:v}))}/><Btn title="Submit review" onPress={()=>submitReview(selectedBooking._id)}/></View>}
      <BookingTools booking={selectedBooking} isAssoc={isAssoc} api={api} apiUrl={API_URL} notify={notify}/>
    </View>
  );

  return (
    <View>
      <View style={s.card}>
        <Calendar value={day} allowPast onChange={(d) => setDay(d === day ? null : d)}
          marked={list.filter((b) => b.status !== 'cancelled').map((b) => ymd(new Date(b.startTime)))} />
        <Text style={s.muted}>🟠 marks a day with a booking. Tap a date to filter.</Text>
      </View>
      <Text style={s.h3}>{day ? fmtDay(day) : 'All bookings'}</Text>
      <Input placeholder="Search hospital, city or service" value={bookingSearch} onChangeText={setBookingSearch}/>
      {shown.length === 0 && <Text style={s.muted}>{list.length===0?'No bookings yet.':'No bookings match this search.'}</Text>}
      {shown.map((b) => (
        <BookingCard key={b._id} b={b} isAssoc={isAssoc}>
          <Btn kind="alt" title="View booking details ›" onPress={()=>setSelectedBooking(b)}/>
          {!isAssoc && b.paymentStatus === 'paid' && <Btn kind="light" title="Book this service again" onPress={() => onRepeat?.(b)} />}
          {!isAssoc && b.status === 'completed' && !b.reviewSubmittedAt && <View style={s.card}><Text style={{fontWeight:'700'}}>Rate your Care Associate</Text><Input placeholder="Rating 1–5 (default 5)" keyboardType="number-pad" value={String(reviewRatings[b._id]||'')} onChangeText={v=>setReviewRatings(old=>({...old,[b._id]:v}))}/><Input placeholder="Feedback (optional)" value={reviewComments[b._id]||''} onChangeText={v=>setReviewComments(old=>({...old,[b._id]:v}))}/><Btn title="Submit review" onPress={()=>submitReview(b._id)}/></View>}
          {!isAssoc && b.helper?._id && <Btn kind="alt" title="Toggle favourite Care Associate" onPress={() => api('/patient/favourites/' + b.helper._id, 'POST').then(r => notify(r.favourite ? 'Added to favourites' : 'Removed from favourites')).catch(e => notify(e.message, true))} />}
          {!isAssoc && ['pending', 'accepted', 'on_the_way'].includes(b.status) && <Btn kind="danger" title="Cancel booking" onPress={() => act(b._id, 'cancel')} />}
          {isAssoc && b.status === 'accepted' && <Btn kind="alt" title="I am on the way" onPress={()=>markOnTheWay(b._id)}/>}
          {isAssoc && ['accepted', 'on_the_way', 'ongoing'].includes(b.status) && (
            <View style={[s.rowBetween, s.dutyBox]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontWeight: '700' }}>{b.status === 'ongoing' ? 'On duty' : b.status === 'on_the_way' ? 'On the way' : 'Off duty'}</Text>
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
  const [matchingEnabled,setMatchingEnabled]=useState(!!user.matchingLocationEnabled);
  const saveMatchingLocation=async()=>{try{const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=='granted')return notify('Location permission is required for distance-based matching',true);const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});await api('/me/matching-location','PUT',{latitude:pos.coords.latitude,longitude:pos.coords.longitude,consent:true});setMatchingEnabled(true);notify('Approximate service area saved for matching');}catch(e){notify(e.message,true);}};
  const removeMatchingLocation=()=>api('/me/matching-location','DELETE').then(()=>{setMatchingEnabled(false);notify('Service-area location removed');}).catch(e=>notify(e.message,true));
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
      <View style={s.card}><Text style={{fontWeight:'700'}}>Distance-based job matching (optional)</Text><Text style={s.muted}>Share your approximate current service area to help patients compare nearby associates. This is not live tracking and can be removed any time.</Text><Btn title={matchingEnabled?'Refresh service area':'Share service area'} onPress={saveMatchingLocation}/>{matchingEnabled&&<Btn kind="alt" title="Remove saved location" onPress={removeMatchingLocation}/>}</View>
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
function Earnings({ notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/helper/earnings').then((v) => { setData(v); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  return (
    <View>
      <View style={s.card}>
        <Text style={s.h2}>My earnings</Text>
        {error ? <Text style={{ color: C.err }}>{error}</Text> : !data ? <ActivityIndicator color={C.p} /> : <>
          <Text style={s.muted}>Completed paid bookings • commission {data.commissionBps / 100}%</Text>
          <Text style={s.price}>₹{data.associateEarning.toFixed(2)}</Text>
          <Text style={s.muted}>Gross: ₹{data.gross.toFixed(2)}  •  Platform fee: ₹{data.platformFee.toFixed(2)}</Text>
          <Text style={s.muted}>This is calculated earning, not an automatic UPI payout.</Text>
        </>}
        <Btn kind="alt" title="Refresh earnings" onPress={load} />
      </View>
      <Text style={s.h3}>Completed bookings</Text>
      {data?.bookings?.map((b) => <View key={b.bookingId} style={s.card}>
        <Text style={{ fontWeight: '700' }}>{b.hospital}</Text>
        <Text style={s.muted}>{b.service} • {fmt(b.completedAt)}</Text>
        <Text style={s.muted}>Gross ₹{b.gross.toFixed(2)} • Fee ₹{b.platformFee.toFixed(2)}</Text>
        <Text style={s.price}>Your earning: ₹{b.associateEarning.toFixed(2)}</Text>
      </View>)}
      {data && data.bookings.length === 0 && <Text style={s.muted}>No completed paid bookings yet.</Text>}
    </View>
  );
}

function Associate({ user, setUser, notify, tab }) {
  const [open, setOpen] = useState([]);
  const [mine, setMine] = useState([]);
  const [jobSearch, setJobSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const load = () => {
    setJobsLoading(true);
    Promise.all([
      api('/bookings/open').then(setOpen).catch((e) => notify(e.message, true)),
      api('/bookings/mine').then(setMine).catch(() => {}),
    ]).finally(() => setJobsLoading(false));
  };
  useEffect(() => { setSelectedJob(null); load(); }, [tab]);
  const toggleAvail = (v) => api('/me/available', 'POST', { available: v }).then(setUser).catch((e) => notify(e.message, true));
  const toggleLeave = (d) => api('/me/leave', 'POST', { date: d }).then(setUser).catch((e) => notify(e.message, true));
  const accept = (id) => api(`/bookings/${id}/accept`, 'POST').then(() => { setSelectedJob(null); notify('Job accepted ✅'); load(); }).catch((e) => notify(e.message, true));

  if (tab === 'safety') return <IncidentCentre notify={notify} />;
  if (tab === 'jobs' && selectedJob) return (
    <View>
      <Btn kind="alt" small title="‹ Back to available jobs" onPress={() => setSelectedJob(null)} />
      <View style={[s.card, { backgroundColor: '#e8f4f1' }]}>
        <Text style={s.h2}>Job details</Text>
        <Text style={s.muted}>Review the schedule, location and patient instructions before accepting.</Text>
      </View>
      <BookingCard b={selectedJob} isAssoc />
      <View style={s.card}>
        <Text style={s.h3}>Before you accept</Text>
        <Text style={s.muted}>• Confirm that you can reach the hospital at the scheduled time.</Text>
        <Text style={s.muted}>• Read the patient's assistance instructions carefully.</Text>
        <Text style={s.muted}>• Care Associate duties are non-clinical; do not perform medical procedures.</Text>
        <Text style={s.muted}>• Patient contact details are shared only when the booking status permits it.</Text>
      </View>
      <Btn title="Accept this job" disabled={!user.verified || !user.available} onPress={() => accept(selectedJob._id)} />
      {!user.verified && <Text style={[s.muted, { color: C.err }]}>Your profile must be verified before accepting jobs.</Text>}
      {!user.available && <Text style={s.muted}>Turn on availability before accepting a job.</Text>}
    </View>
  );
  if (tab === 'profile') return <Profile user={user} setUser={setUser} notify={notify} />;
  if (tab === 'earnings') return <Earnings notify={notify} />;
  if (tab === 'mine') return <MyBookings notify={notify} isAssoc tick={tab} />;
  if (tab === 'cal') return (
    <View style={s.card}>
      <Text style={{ fontWeight: '700' }}>My availability calendar</Text>
      <Text style={s.muted}>Tap a date you cannot work and it turns red. Tap again to undo. 🟠 marks a day with a job.</Text>
      <Calendar onChange={toggleLeave} leave={user.leaveDates} marked={mine.filter((b) => ['accepted', 'on_the_way', 'ongoing'].includes(b.status)).map((b) => ymd(new Date(b.startTime)))} />
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
      <View style={s.rowBetween}>
        <Text style={s.h3}>Available jobs</Text>
        <Text style={s.muted}>{open.length} found</Text>
      </View>
      <Input placeholder={`Search hospital or city in ${user.city || 'your area'}`} value={jobSearch} onChangeText={setJobSearch} />
      {jobsLoading && <ActivityIndicator color={C.p} style={{ marginVertical: 12 }} />}
      {!jobsLoading && open.length === 0 && <View style={s.card}><Text style={{fontWeight:'700'}}>No new jobs right now</Text><Text style={s.muted}>Keep your availability on. New requests will appear here when they match your service area.</Text><Btn kind="alt" title="Refresh jobs" onPress={load}/></View>}
      {open.filter((b) => [b.hospital, b.city, b.service, b.details].filter(Boolean).join(' ').toLowerCase().includes(jobSearch.trim().toLowerCase())).map((b) => (
        <BookingCard key={b._id} b={b} isAssoc>
          <Btn kind="alt" title="View job details ›" onPress={() => setSelectedJob(b)} />
          <Btn title="Quick accept" disabled={!user.verified || !user.available} onPress={() => accept(b._id)} />
        </BookingCard>
      ))}
      {!jobsLoading && open.length > 0 && open.filter((b) => [b.hospital, b.city, b.service, b.details].filter(Boolean).join(' ').toLowerCase().includes(jobSearch.trim().toLowerCase())).length === 0 && <Text style={s.muted}>No jobs match this search. Try another hospital or city.</Text>}
    </View>
  );
}


function PatientCentre({ notify }) {
 const [data,setData]=useState({familyProfiles:[],savedHospitals:[],favourites:[]});
 const [family,setFamily]=useState({name:'',relation:'',phone:'',age:'',notes:''});
 const [hospital,setHospital]=useState({name:'',city:'',address:''});
 const [page,setPage]=useState('home');
 const load=()=>api('/patient/experience').then(setData).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 const addFamily=()=>api('/patient/family','POST',family).then(()=>{setFamily({name:'',relation:'',phone:'',age:'',notes:''});load();notify('Family profile saved');}).catch(e=>notify(e.message,true));
 const removeFamily=id=>api('/patient/family/'+id,'DELETE').then(load).catch(e=>notify(e.message,true));
 const addHospital=()=>api('/patient/hospitals','POST',hospital).then(()=>{setHospital({name:'',city:'',address:''});load();notify('Hospital saved');}).catch(e=>notify(e.message,true));
 const removeHospital=id=>api('/patient/hospitals/'+id,'DELETE').then(load).catch(e=>notify(e.message,true));
 if(page==='home') return <View>
  <View style={[s.card,{backgroundColor:'#e8f4f1'}]}><Text style={s.h2}>Patient tools</Text><Text style={s.muted}>Manage the people, hospitals and associates you use most often.</Text></View>
  <View style={s.card}><Text style={s.h2}>Family profiles</Text><Text style={s.muted}>{data.familyProfiles.length} saved profiles</Text><Btn title="Open family profiles ›" onPress={()=>setPage('family')}/></View>
  <View style={s.card}><Text style={s.h2}>Saved hospitals</Text><Text style={s.muted}>{data.savedHospitals.length} saved hospitals</Text><Btn title="Open saved hospitals ›" onPress={()=>setPage('hospitals')}/></View>
  <View style={s.card}><Text style={s.h2}>Favourite Care Associates</Text><Text style={s.muted}>{data.favourites.length} favourites</Text><Btn title="Open favourites ›" onPress={()=>setPage('favourites')}/></View>
 </View>;
 if(page==='family') return <View><Btn kind="alt" small title="‹ Patient tools" onPress={()=>setPage('home')}/><View style={s.card}><Text style={s.h2}>Family profiles</Text><Text style={s.muted}>Save patient details to reuse them when booking for family members.</Text>
  {data.familyProfiles.map(p=><View key={p._id} style={s.rowBetween}><Text>{p.name} • {p.relation}{p.phone?' • '+p.phone:''}</Text><Btn small kind="danger" title="Remove" onPress={()=>removeFamily(p._id)}/></View>)}
  <Input placeholder="Full name" value={family.name} onChangeText={v=>setFamily({...family,name:v})}/>
  <Input placeholder="Relationship (e.g. Mother)" value={family.relation} onChangeText={v=>setFamily({...family,relation:v})}/>
  <Input placeholder="Contact number (optional)" value={family.phone} onChangeText={v=>setFamily({...family,phone:v})} keyboardType="phone-pad"/>
  <Input placeholder="Age (optional)" value={family.age} onChangeText={v=>setFamily({...family,age:v})} keyboardType="number-pad"/>
  <Input placeholder="Notes (optional)" value={family.notes} onChangeText={v=>setFamily({...family,notes:v})}/>
  <Btn title="Add family profile" onPress={addFamily}/>
 </View></View>;
 if(page==='hospitals') return <View><Btn kind="alt" small title="‹ Patient tools" onPress={()=>setPage('home')}/><View style={s.card}><Text style={s.h2}>Saved hospitals</Text><Text style={s.muted}>Keep frequently used hospitals and cities ready for your next booking.</Text>
  {data.savedHospitals.map(h=><View key={h._id} style={s.rowBetween}><Text style={{flex:1}}>{h.name} • {h.city}</Text><Btn small kind="danger" title="Remove" onPress={()=>removeHospital(h._id)}/></View>)}
  <Input placeholder="Hospital name" value={hospital.name} onChangeText={v=>setHospital({...hospital,name:v})}/>
  <Input placeholder="City" value={hospital.city} onChangeText={v=>setHospital({...hospital,city:v})}/>
  <Input placeholder="Address (optional)" value={hospital.address} onChangeText={v=>setHospital({...hospital,address:v})}/>
  <Btn title="Save hospital" onPress={addHospital}/>
 </View></View>;
 return <View><Btn kind="alt" small title="‹ Patient tools" onPress={()=>setPage('home')}/><View style={s.card}><Text style={s.h2}>Favourite Care Associates</Text>
  {data.favourites.length===0?<Text style={s.muted}>No favourites yet. Add an associate from your booking history.</Text>:data.favourites.map(h=><Text key={h._id} style={s.muted}>⭐ {h.name} • {h.city} • {h.available===false?'Unavailable':'Available'}</Text>)}
 </View></View>;
}

function EmergencyCentre({ notify }) {
 const [form,setForm]=useState({patientName:'',contactPhone:'',hospital:'',city:'',details:''});
 const [requests,setRequests]=useState([]);
 const [busy,setBusy]=useState(false);
 const [page,setPage]=useState('home');
 const load=()=>api('/emergency/mine').then(setRequests).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 const submit=async()=>{try{setBusy(true);const r=await api('/emergency/request','POST',form);notify(r.notice);setForm({patientName:'',contactPhone:'',hospital:'',city:'',details:''});load();setPage('history');}catch(e){notify(e.message,true);}finally{setBusy(false);}};
 if(page==='home') return <View>
  <View style={[s.card,{backgroundColor:'#fff7ed',borderWidth:1,borderColor:'#fed7aa'}]}><Text style={s.h2}>Emergency assistance</Text><Text style={{color:'#9a3412',lineHeight:20}}>For immediate danger or medical emergency in India, call 112. Care Associate is not an ambulance or emergency dispatch service.</Text><Btn kind="danger" title="Call 112" onPress={()=>Linking.openURL('tel:112').catch(()=>notify('Call 112 from your phone',true))}/></View>
  <View style={s.card}><Text style={s.h2}>Request assistance</Text><Text style={s.muted}>Send a non-ambulance assistance request to our administrators.</Text><Btn title="Create request ›" onPress={()=>setPage('request')}/></View>
  <View style={s.card}><Text style={s.h2}>Request history</Text><Text style={s.muted}>{requests.length} requests</Text><Btn kind="alt" title="View request history ›" onPress={()=>setPage('history')}/></View>
 </View>;
 if(page==='history') return <View><Btn kind="alt" small title="‹ Emergency assistance" onPress={()=>setPage('home')}/><Text style={s.h3}>Your requests</Text>
  {requests.length===0?<View style={s.card}><Text style={s.muted}>No assistance requests yet.</Text></View>:requests.map(r=><View style={s.card} key={r._id}><Text style={{fontWeight:'700'}}>{r.patientName} • {r.hospital}</Text><Text style={s.muted}>{r.city} • {r.status}</Text><Text style={s.muted}>{r.details}</Text></View>)}
 </View>;
 return <View><Btn kind="alt" small title="‹ Emergency assistance" onPress={()=>setPage('home')}/><View style={[s.card,{backgroundColor:'#fff7ed',borderWidth:1,borderColor:'#fed7aa'}]}>
  <Text style={s.h2}>New assistance request</Text><Text style={{color:'#9a3412',lineHeight:20}}>This sends a request to Care Associate administrators. It is not an ambulance or emergency dispatch service. For immediate danger or medical emergency in India, call 112.</Text>
  <Input placeholder="Patient name" value={form.patientName} onChangeText={v=>setForm({...form,patientName:v})}/>
  <Input placeholder="Contact phone" keyboardType="phone-pad" value={form.contactPhone} onChangeText={v=>setForm({...form,contactPhone:v})}/>
  <Input placeholder="Hospital name" value={form.hospital} onChangeText={v=>setForm({...form,hospital:v})}/>
  <Input placeholder="City" value={form.city} onChangeText={v=>setForm({...form,city:v})}/>
  <Input placeholder="What assistance is needed?" multiline value={form.details} onChangeText={v=>setForm({...form,details:v})}/>
  <Btn kind="danger" title={busy?'Sending…':'Send assistance request'} disabled={busy} onPress={submit}/>
 </View></View>;
}

function AdminEmergency({notify}) {
 const [items,setItems]=useState([]);const load=()=>api('/admin/emergency').then(setItems).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 const setStatus=(id,status)=>api('/admin/emergency/'+id+'/status','POST',{status}).then(load).catch(e=>notify(e.message,true));
 return <View><Text style={s.h2}>Patient assistance requests</Text>{items.map(r=><View key={r._id} style={s.card}>
  <Text style={{fontWeight:'700'}}>{r.patientName} • {r.contactPhone}</Text><Text>{r.hospital}, {r.city}</Text><Text style={s.muted}>{r.details}</Text><Text style={s.muted}>Status: {r.status}</Text>
  {r.status==='pending'&&<Btn title="Acknowledge" onPress={()=>setStatus(r._id,'acknowledged')}/>}
  {r.status!=='closed'&&<Btn kind="alt" title="Close request" onPress={()=>setStatus(r._id,'closed')}/>}
 </View>)}</View>;
}


function IncidentCentre({notify}) {
 const [form,setForm]=useState({category:'safety',description:'',bookingId:''});
 const [items,setItems]=useState([]);
 const load=()=>api('/incidents/mine').then(setItems).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 const submit=()=>api('/incidents','POST',form).then(()=>{notify('Report submitted to the safety team');setForm({category:'safety',description:'',bookingId:''});load();}).catch(e=>notify(e.message,true));
 return <View>
  <View style={s.card}><Text style={s.h2}>Safety & incident report</Text><Text style={s.muted}>Report safety, harassment, service, payment or privacy concerns. For immediate danger in India, call 112.</Text>
   <Input placeholder="Category: safety / harassment / service / payment / privacy / other" value={form.category} onChangeText={v=>setForm({...form,category:v.toLowerCase()})}/>
   <Input placeholder="Booking ID (optional)" value={form.bookingId} onChangeText={v=>setForm({...form,bookingId:v})}/>
   <Input multiline placeholder="Describe what happened (minimum 10 characters)" value={form.description} onChangeText={v=>setForm({...form,description:v})}/>
   <Btn title="Submit report" onPress={submit}/>
  </View>
  <Text style={s.h3}>My reports</Text>
  {items.map(x=><View key={x._id} style={s.card}><Text style={{fontWeight:'700'}}>{x.category} • {x.status}</Text><Text style={s.muted}>{fmt(x.createdAt)}</Text></View>)}
 </View>;
}
function AdminIncidents({notify}) {
 const [items,setItems]=useState([]);
 const load=()=>api('/admin/incidents').then(setItems).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 const update=(id,status)=>api('/admin/incidents/'+id,'PATCH',{status,resolutionNote:status==='resolved'?'Reviewed by administrator':''}).then(load).catch(e=>notify(e.message,true));
 return <View><Text style={s.h2}>Safety incidents</Text>{items.map(x=><View key={x._id} style={s.card}>
  <Text style={{fontWeight:'700'}}>{x.category} • {x.status}</Text><Text style={s.muted}>{x.reporter?.name} • {fmt(x.createdAt)}</Text><Text>{x.description}</Text>
  {x.booking && <Text style={s.muted}>Booking: {x.booking._id} • {x.booking.hospital}</Text>}
  {x.status==='open'&&<Btn title="Investigate" onPress={()=>update(x._id,'investigating')}/>}
  {x.status!=='resolved'&&<Btn kind="alt" title="Resolve" onPress={()=>update(x._id,'resolved')}/>}
  {x.status!=='dismissed'&&<Btn kind="danger" title="Dismiss" onPress={()=>update(x._id,'dismissed')}/>}
 </View>)}</View>;
}
function AdminPayouts({notify}) {
 const [data,setData]=useState(null);const [users,setUsers]=useState([]);const [draft,setDraft]=useState({});
 const load=()=>{api('/admin/reconciliation').then(setData).catch(e=>notify(e.message,true));api('/admin/users').then(setUsers).catch(()=>{});};
 useEffect(()=>{load();},[]);
 const create=(id)=>{const d=draft[id]||{};api('/admin/helpers/'+id+'/payouts','POST',{amount:Number(d.amount),status:'pending'}).then(()=>{notify('Payout record created as pending');load();}).catch(e=>notify(e.message,true));};
 const markPaid=(p)=>{const ref=draft[p.helper?._id]?.reference||'';if(!ref.trim())return notify('Enter the real bank/UPI transfer reference first',true);api('/admin/payouts/'+p._id,'PATCH',{status:'paid',reference:ref}).then(()=>{notify('Payout marked paid');load();}).catch(e=>notify(e.message,true));};
 return <View>
  <View style={s.card}><Text style={s.h2}>Payout reconciliation</Text>{data&&<Text style={s.muted}>Gross ₹{data.totals.gross} • Refunds ₹{data.totals.refunded} • Platform fee ₹{data.totals.platformFee} • Associate net ₹{data.totals.associateNet} • Paid out ₹{data.payouts.paid} • Pending ₹{data.payouts.pending}</Text>}<Btn kind="alt" title="Refresh reconciliation" onPress={load}/></View>
  <Text style={s.h3}>Create payout record</Text>
  {users.filter(u=>u.role==='helper').map(u=><View key={u.id} style={s.card}><Text style={{fontWeight:'700'}}>{u.name} • {u.upiId||'UPI not set'}</Text><Input placeholder="Amount ₹" keyboardType="decimal-pad" value={draft[u.id]?.amount||''} onChangeText={v=>setDraft(o=>({...o,[u.id]:{...o[u.id],amount:v}}))}/><Btn title="Create pending payout" onPress={()=>create(u.id)}/></View>)}
  <Text style={s.h3}>Payout records</Text>
  {(data?.records||[]).map(p=><View key={p._id} style={s.card}><Text style={{fontWeight:'700'}}>{p.helper?.name} • ₹{p.amount} • {p.status}</Text><Text style={s.muted}>{p.reference||'No transfer reference'}</Text>{p.status==='pending'&&<><Input placeholder="Actual bank/UPI transfer reference" value={draft[p.helper?._id]?.reference||''} onChangeText={v=>setDraft(o=>({...o,[p.helper?._id]:{...o[p.helper?._id],reference:v}}))}/><Btn title="Confirm transfer paid" onPress={()=>markPaid(p)}/></>}</View>)}
 </View>;
}
function AdminAudit({notify}) {
 const [items,setItems]=useState([]);
 const load=()=>api('/admin/audit-logs?limit=100').then(setItems).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 return <View><View style={s.card}><Text style={s.h2}>Admin audit trail</Text><Btn kind="alt" title="Refresh logs" onPress={load}/></View>{items.map(x=><View key={x._id} style={s.card}><Text style={{fontWeight:'700'}}>{x.actor?.name||'Admin'} • {x.action}</Text><Text style={s.muted}>{x.resource} • {fmt(x.at)}</Text></View>)}</View>;
}

// ---------- Admin ----------
function Admin({ tab, notify }) {
  const [users, setUsers] = useState([]);
  const [data, setData] = useState({ revenue: 0, bookings: [] });
  const [finance, setFinance] = useState(null);
  const [refundInput, setRefundInput] = useState({});
  const [showId, setShowId] = useState(null);
  const [adminSearch, setAdminSearch] = useState('');
  const [userFilter, setUserFilter] = useState('all');
  const [bookingFilter, setBookingFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const load = () => {
    api('/admin/users').then(setUsers).catch((e) => notify(e.message, true));
    api('/admin/bookings').then(setData).catch(() => {});
    if (tab === 'finance') api('/admin/finance').then(setFinance).catch((e) => notify(e.message, true));
  };
  const requestRefund = (id) => {
    const input = refundInput[id] || {};
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) return notify('Enter a valid refund amount', true);
    api(`/admin/bookings/${id}/refunds`, 'POST', { amount, reason: input.reason || 'Admin-approved refund' })
      .then(() => { notify('Refund request sent to Cashfree'); load(); })
      .catch((e) => notify(e.message, true));
  };
  const syncRefund = (id, refundId) => api(`/admin/bookings/${id}/refunds/${refundId}/sync`, 'POST')
    .then((r) => { notify('Refund status: ' + r.status); load(); })
    .catch((e) => notify(e.message, true));
  useEffect(() => { load(); }, [tab]);
  const toggle = (id) => api(`/admin/users/${id}/verify`, 'POST').then(load).catch((e) => notify(e.message, true));
  const setSuspension = (u) => Alert.alert(u.isSuspended ? 'Re-enable associate?' : 'Suspend associate?', u.isSuspended ? 'The associate will need fresh verification before accepting jobs.' : 'This blocks the associate account until an administrator re-enables it.', [{text:'Cancel',style:'cancel'},{text:u.isSuspended?'Re-enable':'Suspend',style:u.isSuspended?'default':'destructive',onPress:()=>api(`/admin/helpers/${u.id}/suspension`,'POST',{suspended:!u.isSuspended,reason:u.isSuspended?'':'Administrative safety review'}).then(load).catch(e=>notify(e.message,true))}] );

  const visibleUsers = users.filter((u) => {
    const matchesRole = userFilter === 'all' || u.role === userFilter;
    const q = adminSearch.trim().toLowerCase();
    const matchesQuery = !q || [u.name, u.phone, u.city, u.role, u.upiId].filter(Boolean).join(' ').toLowerCase().includes(q);
    return matchesRole && matchesQuery;
  });
  const visibleBookings = (data.bookings || []).filter((b) => {
    const matchesStatus = bookingFilter === 'all' || b.status === bookingFilter;
    const q = adminSearch.trim().toLowerCase();
    const matchesQuery = !q || [b.hospital, b.city, b.service, b.patient?.name, b.patient?.phone, b.helper?.name, b.helper?.phone, b._id].filter(Boolean).join(' ').toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });
  if (tab === 'overview') return <View>
    <View style={[s.card,{backgroundColor:'#e8f4f1'}]}><Text style={s.h2}>Operations overview</Text><Text style={s.muted}>Live summary from the admin users and bookings endpoints.</Text><Btn kind="alt" title="Refresh dashboard" onPress={load}/></View>
    <View style={s.rowBetween}>
      <View style={[s.card,{flex:1}]}><Text style={s.muted}>Total users</Text><Text style={s.price}>{users.length}</Text></View>
      <View style={[s.card,{flex:1}]}><Text style={s.muted}>Care Associates</Text><Text style={s.price}>{users.filter(u=>u.role==='helper').length}</Text></View>
    </View>
    <View style={s.rowBetween}>
      <View style={[s.card,{flex:1}]}><Text style={s.muted}>Pending verification</Text><Text style={s.price}>{users.filter(u=>u.role==='helper'&&!u.verified).length}</Text></View>
      <View style={[s.card,{flex:1}]}><Text style={s.muted}>Total bookings</Text><Text style={s.price}>{(data.bookings||[]).length}</Text></View>
    </View>
    <View style={s.card}><Text style={s.muted}>Completed & paid revenue</Text><Text style={s.price}>₹{data.revenue||0}</Text></View>
    {['pending','accepted','on_the_way','ongoing','completed','cancelled'].map(status=><View key={status} style={s.rowBetween}><Text>{STATUS[status]||status}</Text><Text style={{fontWeight:'700'}}>{(data.bookings||[]).filter(b=>b.status===status).length}</Text></View>)}
  </View>;
  if (tab === 'emergency') return <AdminEmergency notify={notify} />;
  if (tab === 'incidents') return <AdminIncidents notify={notify} />;
  if (tab === 'payouts') return <AdminPayouts notify={notify} />;
  if (tab === 'audit') return <AdminAudit notify={notify} />;
  if (tab === 'users' && selectedUser) return <View>
    <Btn kind="alt" title="‹ Back to users" onPress={()=>{setSelectedUser(null);setShowId(null);}}/>
    <View style={[s.card,{backgroundColor:'#e8f4f1'}]}><Text style={s.h2}>User details</Text><Text style={s.muted}>Account information and administrative actions.</Text></View>
    <View style={s.card}>
      <Text style={s.h3}>{selectedUser.name}</Text>
      <Text>{selectedUser.role==='helper'?ROLE_NAME:'Patient'} • {selectedUser.city||'City not provided'}</Text>
      <Text style={s.muted}>Phone: {selectedUser.phone||'Not provided'}</Text>
      <Text style={s.muted}>Account: {selectedUser.isSuspended?'Suspended':'Active'}</Text>
      <Text style={s.muted}>Verification: {selectedUser.verified?'Verified':'Not verified'}</Text>
      {selectedUser.role==='helper'&&<>
        <Text style={s.muted}>UPI ID: {selectedUser.upiId||'Not provided'}</Text>
        <Text style={s.muted}>Aadhaar: {selectedUser.aadhaarUploaded?'Uploaded':'Not uploaded'}</Text>
        {selectedUser.aadhaarUploaded&&<Btn kind="alt" title={showId===selectedUser.id?'Hide Aadhaar':'View Aadhaar document'} onPress={()=>setShowId(showId===selectedUser.id?null:selectedUser.id)}/>}
        {showId===selectedUser.id&&<Image source={{uri:`${API_URL}/api/admin/users/${selectedUser.id}/aadhaar`,headers:{Authorization:'Bearer '+TOKEN}}} style={s.preview} resizeMode="contain"/>}
        <Btn title={selectedUser.verified?'Remove verification':'Verify Care Associate'} onPress={()=>toggle(selectedUser.id).then(()=>setSelectedUser(null))}/>
        <Btn kind={selectedUser.isSuspended?'alt':'danger'} title={selectedUser.isSuspended?'Re-enable account':'Suspend account'} onPress={()=>setSuspension(selectedUser)}/>
      </>}
    </View>
    <View style={s.card}><Text style={s.h3}>Safety & access</Text><Text style={s.muted}>Use suspension for a documented safety or policy reason. Verification requires Aadhaar and UPI to be present.</Text></View>
  </View>;
  if (tab === 'bookings' && selectedBooking) return <View>
    <Btn kind="alt" title="‹ Back to bookings" onPress={()=>setSelectedBooking(null)}/>
    <View style={[s.card,{backgroundColor:'#e8f4f1'}]}><Text style={s.h2}>Booking details</Text><Text style={s.muted}>Full booking information for admin review.</Text></View>
    <BookingCard b={selectedBooking} admin/>
    <View style={s.card}><Text style={s.h3}>People</Text><Text>Patient: {selectedBooking.patient?.name||'Not assigned'}</Text><Text style={s.muted}>{selectedBooking.patient?.phone||''}</Text><Text>Care Associate: {selectedBooking.helper?.name||'Not assigned'}</Text><Text style={s.muted}>{selectedBooking.helper?.phone||''}</Text></View>
    <View style={s.card}><Text style={s.h3}>Payment & status</Text><Text>Payment: {selectedBooking.paymentStatus||'Not available'}</Text><Text>Booking: {STATUS[selectedBooking.status]||selectedBooking.status}</Text><Text>Amount: ₹{selectedBooking.amount||0}</Text></View>
  </View>;
  if (tab === 'bookings') return <View>
    <Input placeholder="Search booking, patient, helper, hospital" value={adminSearch} onChangeText={setAdminSearch}/>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:10}}>
      {['all','pending','accepted','on_the_way','ongoing','completed','cancelled'].map(v=><Btn key={v} small kind={bookingFilter===v?'primary':'light'} title={v==='all'?'All':STATUS[v]||v} onPress={()=>setBookingFilter(v)}/>)}
    </View>
    <Text style={s.muted}>{visibleBookings.length} bookings</Text>
    {visibleBookings.map(b=><BookingCard key={b._id} b={b} admin><Btn kind="alt" title="View booking details ›" onPress={()=>setSelectedBooking(b)}/></BookingCard>)}
    {visibleBookings.length===0&&<Text style={s.muted}>No bookings match these filters.</Text>}
  </View>;
  if (tab === 'finance') return (
    <View>
      <View style={s.card}>
        <Text style={s.h2}>Payments & refunds</Text>
        {finance ? <Text style={s.muted}>Platform commission: {finance.commissionBps / 100}% • {finance.bookings.length} paid bookings</Text> : <Text style={s.muted}>Loading finance data…</Text>}
      </View>
      {finance?.bookings?.map((b) => <View style={s.card} key={b.bookingId}>
        <Text style={{ fontWeight: '700' }}>{b.patient?.name || 'Patient'} • {b.helper?.name || 'Unassigned'}</Text>
        <Text style={s.muted}>Booking {b.bookingId}</Text>
        <Text style={s.muted}>Gross ₹{b.gross.toFixed(2)} • Refunded ₹{b.refunded.toFixed(2)}</Text>
        <Text style={s.muted}>Platform fee ₹{b.platformFee.toFixed(2)} • Associate net ₹{b.associateNet.toFixed(2)}</Text>
        <Text style={s.muted}>Payment: {b.paymentStatus} • Booking: {b.status}</Text>
        {(b.refunds || []).map((r) => <View key={r.refundId} style={s.rowBetween}>
          <Text style={s.muted}>₹{r.amount.toFixed(2)} • {r.status}</Text>
          {r.status === 'PENDING' && <Btn small kind="alt" title="Sync status" onPress={() => syncRefund(b.bookingId, r.refundId)} />}
        </View>)}
        {b.paymentStatus === 'paid' && <View>
          <Input placeholder="Refund amount (₹)" keyboardType="decimal-pad" value={refundInput[b.bookingId]?.amount || ''} onChangeText={(v) => setRefundInput(old => ({ ...old, [b.bookingId]: { ...old[b.bookingId], amount: v } }))} />
          <Input placeholder="Reason (optional)" value={refundInput[b.bookingId]?.reason || ''} onChangeText={(v) => setRefundInput(old => ({ ...old, [b.bookingId]: { ...old[b.bookingId], reason: v } }))} />
          <Btn kind="danger" title="Request Cashfree refund" onPress={() => requestRefund(b.bookingId)} />
        </View>}
      </View>)}
    </View>
  );
  return (
    <View>
      <View style={s.card}><Text style={{ fontWeight: '700' }}>Paid revenue (completed bookings)</Text><Text style={s.price}>₹{data.revenue}</Text></View>
      <View style={s.rowBetween}><Text style={s.h3}>User management</Text><Text style={s.muted}>{visibleUsers.length} users</Text></View>
      <Input placeholder="Search name, phone, city or UPI" value={adminSearch} onChangeText={setAdminSearch}/>
      <View style={{flexDirection:'row',gap:8,marginBottom:10}}>
        {['all','patient','helper'].map(v=><Btn key={v} small kind={userFilter===v?'primary':'light'} title={v==='all'?'All users':v==='helper'?ROLE_NAME:'Patients'} onPress={()=>setUserFilter(v)}/>)}
      </View>
      {visibleUsers.map((u) => (
        <View style={s.card} key={u.id}>
          <Text style={{ fontWeight: '700' }}>{u.name} • {u.role === 'helper' ? ROLE_NAME : 'Patient'}{u.verified ? ' ✅' : ''}</Text>
          <Text style={s.muted}>{u.phone} • {u.city}</Text>
          <Text style={s.muted}>{u.isSuspended?'Suspended':'Active'} • {u.role==='helper'?(u.aadhaarUploaded?'Aadhaar uploaded':'Aadhaar missing'):'Patient account'}</Text>
          <Btn kind="alt" title="Open user details ›" onPress={()=>{setSelectedUser(u);setShowId(null);}}/>
        </View>
      ))}
      {visibleUsers.length===0&&<Text style={s.muted}>No users match this search.</Text>}
    </View>
  );
}

// ---------- App shell ----------
function NotificationCentre({ notify }) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      setError('');
      const result = await api('/notifications?limit=60');
      setItems(result.items || []);
      setUnreadCount(Number(result.unreadCount || 0));
    } catch (e) {
      setError(e.message || 'Unable to load notifications');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const markRead = async (id) => {
    try {
      await api('/notifications/' + id + '/read', 'PATCH');
      setItems(current => current.map(item => item._id === id ? { ...item, readAt: new Date().toISOString() } : item));
      setUnreadCount(value => Math.max(0, value - 1));
    } catch (e) { notify(e.message, true); }
  };
  const markAllRead = async () => {
    try {
      await api('/notifications/read-all', 'POST');
      setItems(current => current.map(item => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
      setUnreadCount(0);
      notify('All notifications marked as read');
    } catch (e) { notify(e.message, true); }
  };
  const remove = async (id) => {
    try {
      await api('/notifications/' + id, 'DELETE');
      const removed = items.find(item => item._id === id);
      setItems(current => current.filter(item => item._id !== id));
      if (removed && !removed.readAt) setUnreadCount(value => Math.max(0, value - 1));
    } catch (e) { notify(e.message, true); }
  };
  return (
    <View>
      <View style={s.card}>
        <View style={s.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>Notifications</Text>
            <Text style={s.muted}>{unreadCount} unread • latest 60 updates</Text>
          </View>
          <Btn kind="alt" small title="Refresh" onPress={load} />
        </View>
        {!!unreadCount && <Btn title="Mark all as read" onPress={markAllRead} />}
      </View>
      {loading && <ActivityIndicator color={C.p} style={{ margin: 20 }} />}
      {!!error && <View style={s.card}><Text style={{ color: C.err }}>{error}</Text><Btn kind="alt" title="Try again" onPress={load} /></View>}
      {!loading && !error && items.length === 0 && <View style={s.card}>
        <Text style={s.h2}>You're all caught up</Text>
        <Text style={s.muted}>Booking confirmations, status changes and important account updates will appear here.</Text>
      </View>}
      {items.map(item => (
        <View key={item._id} style={[s.card, !item.readAt && { borderColor: '#99d5c8', backgroundColor: '#f3fbf8' }]}>
          <View style={s.rowBetween}>
            <Text style={{ flex: 1, fontWeight: '700', color: '#173b37' }}>{!item.readAt ? '● ' : ''}{item.title}</Text>
            <TouchableOpacity onPress={() => remove(item._id)}><Text style={{ color: C.mute, padding: 6 }}>Delete</Text></TouchableOpacity>
          </View>
          <Text style={{ color: '#334155', marginTop: 5, lineHeight: 20 }}>{item.body}</Text>
          <Text style={s.muted}>{fmt(item.createdAt)}</Text>
          {!item.readAt && <Btn kind="alt" small title="Mark as read" onPress={() => markRead(item._id)} />}
        </View>
      ))}
    </View>
  );
}

const TABS = {
  guest: [['new', '➕', 'Book'], ['mine', '📅', 'My bookings'], ['help', '📞', 'Help'], ['login', '🔑', 'Log in']],
  patient: [['new', '➕', 'Book'], ['mine', '📅', 'My bookings'], ['notifications', '🔔', 'Alerts'], ['family', '👨‍👩‍👧', 'Family'], ['emergency', '🆘', 'Urgent'], ['safety', '⚠️', 'Report'], ['help', '📞', 'Help']],
  helper: [['jobs', '🩺', 'Jobs'], ['mine', '📋', 'My jobs'], ['notifications', '🔔', 'Alerts'], ['cal', '📅', 'Calendar'], ['profile', '👤', 'Profile'], ['earnings', '💰', 'Earnings'], ['safety', '⚠️', 'Report']],
  admin: [['overview', '📊', 'Overview'], ['notifications', '🔔', 'Alerts'], ['users', '👥', 'Users'], ['bookings', '📋', 'Bookings'], ['finance', '💳', 'Finance'], ['payouts', '💸', 'Payouts'], ['incidents', '⚠️', 'Incidents'], ['audit', '🧾', 'Audit'], ['emergency', '🆘', 'Urgent']],
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
  const [repeatBooking, setRepeatBooking] = useState(null);
  const [language, setLanguage] = useState('en');
  const [serverStatus, setServerStatus] = useState('checking');
  const [servicePage, setServicePage] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const notify = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem('token');
        if (t) { TOKEN = t; const current = await api('/me'); setUser(current); setLanguage(current.language || 'en'); }
      } catch (e) { TOKEN = ''; await AsyncStorage.removeItem('token'); }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    let active = true;
    fetch(API_URL + '/api/health')
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (active) setServerStatus(response.ok && data.ok && data.database === 'connected' ? 'connected' : 'degraded');
      })
      .catch(() => { if (active) setServerStatus('offline'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || !['patient', 'helper', 'admin'].includes(user.role)) return undefined;
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
      if (active && token) { await AsyncStorage.setItem('expoPushToken', token); await api('/push-token', 'POST', { expoPushToken: token }); }
    })().catch((e) => console.warn('Push registration:', e.message));
    return () => { active = false; };
  }, [user?.id]);

  const openAuth = (mode = 'login', reason = '') => setAuth({ mode, reason });
  const requireLogin = (reason) => { setPendingBook(true); openAuth('login', reason); };
  const onLogin = (u) => {
    setUser(u);
    setLanguage(u.language || 'en');
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
  const logout = async () => { await stopCareLocationTracking().catch(() => {}); const pushToken = await AsyncStorage.getItem('expoPushToken'); if (pushToken) await api('/push-token', 'DELETE', { expoPushToken: pushToken }).catch(() => {}); TOKEN = ''; await AsyncStorage.multiRemove(['token', 'expoPushToken']); setUser(null); setTab(null); };
  const onTab = (id) => { setServicePage(null); if (id === 'login') { setPendingBook(false); openAuth('login'); } else setTab(id); };
  const changeLanguage = async () => { const next = language === 'en' ? 'hi' : 'en'; setLanguage(next); if (user && ['patient','helper','admin'].includes(user.role)) api('/me/language','PUT',{language:next}).catch(e=>notify(e.message,true)); };
  ACTIVE_NAV_LABELS = language === 'hi' ? {Alerts:'सूचनाएँ',Book:'बुकिंग','My bookings':'मेरी बुकिंग',Family:'परिवार',Urgent:'तत्काल मदद',Help:'सहायता',Report:'रिपोर्ट','Log in':'लॉग इन',Jobs:'काम','My jobs':'मेरे काम',Calendar:'कैलेंडर',Profile:'प्रोफाइल',Earnings:'कमाई',Users:'यूज़र',Bookings:'बुकिंग',Finance:'वित्त',Payouts:'भुगतान',Incidents:'शिकायतें',Audit:'ऑडिट'} : {};

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={s.rowBetween}>
          <Logo size={38} />
          <View style={{ marginLeft: 10 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Care Associate</Text>
            <Text style={{ color: '#d1fae5', fontSize: 12 }}>{user ? `${user.name} • ${user.role === 'helper' ? ROLE_NAME : user.role === 'admin' ? 'Admin' : 'Patient'}` : 'Trusted help for every hospital visit'}</Text>
            <Text style={{ color: serverStatus === 'connected' ? '#a7f3d0' : serverStatus === 'checking' ? '#fde68a' : '#fecaca', fontSize: 11, marginTop: 3 }}>
              {serverStatus === 'connected' ? '● Server connected' : serverStatus === 'checking' ? '● Connecting to server…' : serverStatus === 'degraded' ? '● Server responding with an issue' : '● Server offline — check internet'}
            </Text>
          </View>
        </View>
        {servicePage ? <Btn small kind="light" title="‹ Back" onPress={() => setServicePage(null)} /> : user
          ? <View style={{flexDirection:'row',alignItems:'center',gap:6}}><Btn small kind="light" title={language==='en'?'हिंदी':'English'} onPress={changeLanguage}/><Btn small kind="alt" title="Log out" onPress={logout} /></View>
          : <Btn small kind="light" title="Log in" onPress={() => { setPendingBook(false); openAuth('login'); }} />}
      </View>
      {toastEl}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          {servicePage && (role === 'guest' || role === 'patient') ? <ServiceDetail serviceId={servicePage} onBack={() => setServicePage(null)} onContinue={(id) => { setSelectedService(id); setServicePage(null); setTab('new'); }} /> : (role === 'guest' || role === 'patient') && (
            // NewBooking stays mounted (hidden) so a guest does not lose the form while logging in
            <>
              <View style={cur === 'new' ? null : { display: 'none' }}>
                <NewBooking user={user} notify={notify} requireLogin={requireLogin} resume={resume} repeatBooking={repeatBooking} selectedService={selectedService} onOpenService={setServicePage} done={() => { setRepeatBooking(null); setTab('mine'); }} />
              </View>
              {cur === 'mine' && (user
                ? <MyBookings notify={notify} tick={cur} onRepeat={(b) => { setRepeatBooking(b); setTab('new'); }} />
                : <LoginPrompt onLogin={() => openAuth('login')} onRegister={() => openAuth('register')} />)}
              {cur === 'family' && <PatientCentre notify={notify} />}
              {cur === 'emergency' && <EmergencyCentre notify={notify} />}
              {cur === 'safety' && <IncidentCentre notify={notify} />}
              {cur === 'help' && <Help />}
            </>
          )}
          {user && cur === 'notifications' && <NotificationCentre notify={notify} />}
          {role === 'helper' && <Associate user={user} setUser={setUser} notify={notify} tab={cur} />}
          {role === 'admin' && <Admin tab={cur} notify={notify} />}
        </ScrollView>
      </KeyboardAvoidingView>
      {!keyboard && !servicePage && (
        <View style={[s.nav, { paddingBottom: insets.bottom + 8 }]}>
          {tabs.map(([id, icon, label]) => (
            <TouchableOpacity key={id} style={[s.navItem, cur === id && s.navItemActive]} onPress={() => onTab(id)}>
              <Text style={{ fontSize: 20 }}>{icon}</Text>
              <Text style={{ fontSize: 12, color: cur === id ? C.p : C.mute, fontWeight: cur === id ? '700' : '400' }}>{ACTIVE_NAV_LABELS[label] || label}</Text>
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

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, message: '' }; }
  static getDerivedStateFromError(error) { return { hasError: true, message: error?.message || 'Unexpected app error' }; }
  componentDidCatch(error, info) { console.error('Care Associate render error:', error, info?.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#f4f8f7', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <Logo size={76} />
          <Text style={{ color: '#123c38', fontSize: 22, fontWeight: '800', marginTop: 18 }}>We hit a screen error</Text>
          <Text style={{ color: '#526b68', textAlign: 'center', marginTop: 8, lineHeight: 21 }}>Your app is still safe. Please reopen this screen. If it happens again, share the error below with support.</Text>
          <Text selectable style={{ color: '#b42318', fontSize: 12, textAlign: 'center', marginTop: 12 }}>{this.state.message}</Text>
          <TouchableOpacity onPress={() => this.setState({ hasError: false, message: '' })} style={{ backgroundColor: '#0f766e', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 20 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <AppErrorBoundary><SafeAreaProvider><Root /></SafeAreaProvider></AppErrorBoundary>;
}

// ---------- Styles ----------
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: '#0b3b37', paddingHorizontal: 18, paddingBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#d6a84f' },
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  brand: { fontSize: 32, fontWeight: '800', color: C.p, marginTop: 18 },
  tagline: { color: C.mute, marginTop: 6, fontSize: 15, textAlign: 'center' },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  h3: { fontSize: 17, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  sec: { fontWeight: '700', marginTop: 16, marginBottom: 6, fontSize: 15 },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16, marginVertical: 8, borderWidth: 1, borderColor: '#edf2f1', elevation: 2, shadowColor: '#123c38', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  muted: { color: C.mute, fontSize: 13, marginVertical: 2 },
  duty: { color: '#5b21b6', fontSize: 13, marginVertical: 2, fontWeight: '600' },
  dutyBox: { backgroundColor: '#f5f3ff', borderRadius: 10, padding: 10, marginTop: 8 },
  price: { fontSize: 20, fontWeight: '700', color: C.p, marginVertical: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, fontSize: 12, overflow: 'hidden' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#d7e3e0', borderRadius: 13, paddingHorizontal: 14, paddingVertical: 13, marginVertical: 6, fontSize: 15, color: '#173b37', backgroundColor: '#fff', minHeight: 50 },
  btn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 14, marginVertical: 5, alignItems: 'center', alignSelf: 'stretch', minHeight: 48 },
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
  nav: { flexDirection: 'row', backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 9, elevation: 12 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, marginHorizontal: 2, borderRadius: 13 },
  navItemActive: { backgroundColor: '#e8f4f1' },
  support: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  authOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 10 },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: '#166534', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 14, zIndex: 20, maxWidth: '92%' },
});
