import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch, ActivityIndicator, Modal,
  Image, Alert, Keyboard, KeyboardAvoidingView, Platform, Linking, Share,
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
// Server port: change only if you changed PORT in server/.env
const API_PORT = 5001;
// Configure the deployed HTTPS backend with EXPO_PUBLIC_API_URL at build time,
// or set expo.extra.apiUrl in app.json. Local Metro/emulator fallback is for development only.
const API_OVERRIDE = String(process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || '').trim().replace(/\/+$/, '');
const devHost = (Constants.expoConfig?.hostUri || '').split(':')[0];
const API_URL = API_OVERRIDE || (__DEV__ && devHost ? `http://${devHost}:${API_PORT}` : 'https://server-beryl-three-35.vercel.app');

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

const ROLE_NAME = 'Care Associate';
// Help line shown on the login/register screens, Help tab and booking page.
// TODO: yahan apna asli mobile number daalo (country code ke saath)
const SUPPORT_PHONE = String(Constants.expoConfig?.extra?.supportPhone || '').trim();
const C = { p: '#0f766e', bg: '#f4f8f7', card: '#ffffff', mute: '#64748b', err: '#dc2626', line: '#e1eae8' };
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
  if (!res.ok) {
    const message = data.error || data.message || `Request failed (${res.status})`;
    console.warn('Care Associate API error:', method, path, res.status, message);
    throw new Error(message);
  }
  return data;
}



async function syncDocumentExpiryReminders(documents) {
  try {
    const permission=await Notifications.getPermissionsAsync();
    const prefs=await api('/notification-preferences').catch(()=>({pushEnabled:true,bookingUpdates:true}));
    const allowed=permission.status==='granted'&&prefs.pushEnabled!==false&&prefs.bookingUpdates!==false;
    const scheduled=await Notifications.getAllScheduledNotificationsAsync();
    const existing=new Map(scheduled.filter(x=>x.content?.data?.careDocumentExpiryReminder).map(x=>[x.content.data.reminderKey,x.identifier]));
    const desired=new Map();
    if(allowed) for(const doc of documents||[]) {
      if(!doc.expiryAt) continue;
      const expiry=new Date(doc.expiryAt);
      if(!Number.isFinite(expiry.getTime())) continue;
      for(const days of [30,7]) {
        const at=new Date(expiry.getTime()-days*24*60*60*1000);
        if(at.getTime()<=Date.now()+60000) continue;
        const key=String(doc.id)+':'+expiry.toISOString()+':'+days;
        desired.set(key,{doc,days,at});
      }
    }
    for(const [key,id] of existing) if(!desired.has(key)) { await Notifications.cancelScheduledNotificationAsync(id); existing.delete(key); }
    for(const [key,item] of desired) if(!existing.has(key)) await Notifications.scheduleNotificationAsync({
      content:{title:'Document expiry reminder',body:(item.doc.title||'A saved document')+' expires in '+item.days+' days.',data:{careDocumentExpiryReminder:true,reminderKey:key,documentId:String(item.doc.id)}},
      trigger:item.at,
    });
  } catch(error) { console.warn('Document expiry reminders:',error.message); }
}

async function syncLocalBookingReminders(bookings) {
  try {
    const permission=await Notifications.getPermissionsAsync();
    const prefs=await api('/notification-preferences').catch(()=>({pushEnabled:true,bookingUpdates:true}));
    const allowed=permission.status==='granted'&&prefs.pushEnabled!==false&&prefs.bookingUpdates!==false;
    const scheduled=await Notifications.getAllScheduledNotificationsAsync();
    const existing=new Map(scheduled.filter(x=>x.content?.data?.careBookingReminder).map(x=>[x.content.data.reminderKey,x.identifier]));
    const desired=new Map();
    if(allowed) for(const booking of bookings||[]) {
      if(booking.paymentStatus!=='paid'||!['pending','accepted','on_the_way'].includes(booking.status)) continue;
      const start=new Date(booking.startTime);
      if(!Number.isFinite(start.getTime())) continue;
      for(const hours of [24,2]) {
        const at=new Date(start.getTime()-hours*60*60*1000);
        if(at.getTime()<=Date.now()+60000) continue;
        const key=String(booking._id)+':'+start.toISOString()+':'+hours;
        desired.set(key,{booking,hours,at});
      }
    }
    for(const [key,id] of existing) if(!desired.has(key)) {
      await Notifications.cancelScheduledNotificationAsync(id);
      existing.delete(key);
    }
    for(const [key,item] of desired) if(!existing.has(key)) {
      await Notifications.scheduleNotificationAsync({
        content:{title:'Upcoming hospital visit',body:(item.booking.hospital||'Your hospital visit')+' starts in '+item.hours+' hours.',data:{careBookingReminder:true,reminderKey:key,bookingId:String(item.booking._id)}},
        trigger:item.at,
      });
    }
  } catch(error) { console.warn('Local booking reminders:',error.message); }
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
const Input = (p) => <TextInput placeholderTextColor="#64748b" underlineColorAndroid="transparent" selectionColor={C.p} {...p} style={[s.input, p.multiline && { height: 80, textAlignVertical: 'top' }, p.style]} />;

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
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}><MenuIcon id={sv.id} size={18} /><Text style={{ fontWeight: '700', flex: 1, color: '#234640' }}>{sv.label}</Text></View>
        <Text style={[s.tag, { backgroundColor: STATUS_BG[b.status] }]}>{STATUS[b.status]}</Text>
      </View>
      <Text>🏥 {b.hospital}, {b.city}</Text>
      <Text style={s.muted}>🕒 Scheduled: {fmt(b.startTime)}{b.bookingType === 'token' ? ' • Token assistance (no duration)' : ` → ${fmt(b.endTime)} (${b.hours} hr)`}</Text>
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
  const [f, setF] = useState({ name: '', phone: '', password: '', city: '', role: 'patient', upiId: '', referralCode: '' });
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
          <Input placeholder="Referral code (optional)" autoCapitalize="characters" value={f.referralCode} onChangeText={set('referralCode')} />
        </>}
        <Input placeholder="Mobile number" keyboardType="phone-pad" value={f.phone} onChangeText={set('phone')} />
        <Input placeholder="Password" secureTextEntry autoCapitalize="none" autoCorrect={false} value={f.password} onChangeText={set('password')} style={{ color: '#173b37', backgroundColor: '#ffffff' }} />

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

      <View style={{ alignItems: 'center', marginTop: 18, marginBottom: 12 }}>
        <View style={{ height: 1, backgroundColor: '#e5eeeb', width: '100%', marginBottom: 14 }} />
        <TouchableOpacity accessibilityRole="button" onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f0f6f4' }}>
          <Text style={{ color: '#42635d', fontSize: 13, fontWeight: '700' }}>Browse as guest</Text>
        </TouchableOpacity>
      </View>
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



function DocumentVault({ notify }) {
  const [items,setItems]=useState([]);
  const [title,setTitle]=useState('');
  const [expiryDate,setExpiryDate]=useState('');
  const [category,setCategory]=useState('medical_report');
  const [selected,setSelected]=useState(null);
  const [busy,setBusy]=useState(false);
  const load=()=>api('/documents').then(d=>{setItems(d.items||[]);syncDocumentExpiryReminders(d.items||[]);}).catch(e=>notify(e.message,true));
  useEffect(()=>{load();},[]);
  const upload=async()=>{
    if(!title.trim())return notify('Enter a document title',true);
    try{
      const photo=await pickPhoto();if(!photo)return;
      setBusy(true);
      await api('/documents','POST',{title:title.trim(),category,image:photo.base64,expiryDate:expiryDate||undefined});
      setTitle('');setExpiryDate('');await load();notify('Document saved privately');
    }catch(e){notify(e.message,true);}finally{setBusy(false);}
  };
  const remove=async id=>{
    Alert.alert('Delete document?','This permanently removes your private document.',[
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async()=>{try{await api('/documents/'+id,'DELETE');setSelected(null);load();notify('Document deleted');}catch(e){notify(e.message,true);}}}
    ]);
  };
  return <View>
    <View style={[s.card,{backgroundColor:'#e8f4f1'}]}><Text style={s.h2}>Private document vault</Text><Text style={s.muted}>Your files are stored privately and only you can view or delete them. Upload JPG or PNG images up to 5 MB. Avoid sharing unnecessary sensitive information.</Text></View>
    <View style={s.card}><Text style={s.h3}>Add a document</Text><Input placeholder="Document title" value={title} onChangeText={setTitle}/><Input placeholder="Expiry date (YYYY-MM-DD, optional)" value={expiryDate} onChangeText={setExpiryDate}/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginVertical:8}}>{['medical_report','prescription','insurance','identity','certificate','other'].map(v=><Btn key={v} small kind={category===v?'primary':'alt'} title={v.replace('_',' ')} onPress={()=>setCategory(v)}/>)}</View>
      <Btn title={busy?'Uploading…':'Choose photo and upload'} disabled={busy} onPress={upload}/>
    </View>
    <Text style={s.h3}>Saved documents ({items.length})</Text>
    {items.map(d=><TouchableOpacity key={d.id} style={s.card} onPress={()=>setSelected(d)}><Text style={{fontWeight:'700'}}>{d.title}</Text><Text style={s.muted}>{d.category.replace('_',' ')} • {(d.sizeBytes/1024).toFixed(0)} KB • {fmt(d.createdAt)}{d.expiryAt?' • Expires '+new Date(d.expiryAt).toLocaleDateString():''}</Text>{d.reviewStatus!=='not_required'&&<Text style={s.muted}>Review: {d.reviewStatus}{d.reviewNote?' • '+d.reviewNote:''}</Text>}<Text style={{color:C.p,fontWeight:'700'}}>View private image ›</Text><Btn small kind="danger" title="Delete" onPress={()=>remove(d.id)}/></TouchableOpacity>)}
    {!items.length&&<Text style={s.muted}>No documents uploaded yet.</Text>}
    {selected&&<View style={s.card}><Btn kind="alt" title="Close preview" onPress={()=>setSelected(null)}/><Text style={s.h3}>{selected.title}</Text><Image source={{uri:API_URL+'/api/documents/'+selected.id+'/file',headers:{Authorization:'Bearer '+TOKEN}}} resizeMode="contain" style={{width:'100%',height:320}}/></View>}
  </View>;
}

function AdminDocuments({ notify }) {
  const [items,setItems]=useState([]);
  const [filter,setFilter]=useState('pending');
  const [selected,setSelected]=useState(null);
  const [notes,setNotes]=useState({});
  const load=()=>api('/admin/documents'+(filter==='all'?'':'?status='+filter)).then(d=>setItems(d.items||[])).catch(e=>notify(e.message,true));
  useEffect(()=>{load();},[filter]);
  const review=async(doc,status)=>{
    try{await api('/admin/documents/'+doc.id+'/review','PATCH',{status,note:notes[doc.id]||''});setSelected(null);load();notify('Document review saved');}
    catch(e){notify(e.message,true);}
  };
  return <View>
    <View style={s.card}><Text style={s.h2}>Helper document review</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{['pending','approved','rejected','all'].map(v=><Btn key={v} small kind={filter===v?'primary':'alt'} title={v} onPress={()=>setFilter(v)}/>)}</View></View>
    {items.map(d=><TouchableOpacity key={d.id} style={s.card} onPress={()=>setSelected(d)}><Text style={{fontWeight:'700'}}>{d.title}</Text><Text style={s.muted}>{d.owner?.name} • {d.owner?.phone} • {d.owner?.city}</Text><Text style={s.muted}>{d.category} • {d.reviewStatus} • {fmt(d.createdAt)}</Text><Text style={{color:C.p,fontWeight:'700'}}>Review document ›</Text></TouchableOpacity>)}
    {!items.length&&<Text style={s.muted}>No helper documents in this queue.</Text>}
    {selected&&<View style={s.card}><Btn kind="alt" title="Close preview" onPress={()=>setSelected(null)}/><Text style={s.h3}>{selected.title} • {selected.owner?.name}</Text><Image source={{uri:API_URL+'/api/admin/documents/'+selected.id+'/file',headers:{Authorization:'Bearer '+TOKEN}}} resizeMode="contain" style={{width:'100%',height:320}}/><Input placeholder="Review note (optional)" value={notes[selected.id]||''} onChangeText={v=>setNotes(old=>({...old,[selected.id]:v}))}/><View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Btn title="Approve" onPress={()=>review(selected,'approved')}/></View><View style={{flex:1}}><Btn kind="danger" title="Reject" onPress={()=>review(selected,'rejected')}/></View></View></View>}
  </View>;
}

function SupportCentre({ notify }) {
  const [items,setItems]=useState([]);
  const [selected,setSelected]=useState(null);
  const [form,setForm]=useState({subject:'',category:'booking',message:''});
  const [reply,setReply]=useState('');
  const [busy,setBusy]=useState(false);
  const load=()=>api('/support/tickets').then(data=>setItems(data.items||[])).catch(e=>notify(e.message,true));
  useEffect(()=>{load();},[]);
  const create=async()=>{
    if(!form.subject.trim()||!form.message.trim())return notify('Enter a subject and message',true);
    try{setBusy(true);const data=await api('/support/tickets','POST',form);setForm({subject:'',category:'booking',message:''});await load();setSelected(data.ticket);notify('Support ticket created');}
    catch(e){notify(e.message,true);}finally{setBusy(false);}
  };
  const send=async()=>{
    if(!reply.trim()||!selected)return;
    try{setBusy(true);const data=await api('/support/tickets/'+selected._id+'/messages','POST',{message:reply});setSelected(data.ticket);setReply('');await load();}
    catch(e){notify(e.message,true);}finally{setBusy(false);}
  };
  if(selected)return <View>
    <Btn kind="alt" small title="‹ All support tickets" onPress={()=>setSelected(null)}/>
    <View style={s.card}><Text style={s.h2}>{selected.subject}</Text><Text style={s.muted}>Ticket #{String(selected._id).slice(-8)} • {selected.status.replace('_',' ')}</Text>
      {(selected.messages||[]).map(m=><View key={m._id} style={{paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.line}}><Text style={{fontWeight:'700'}}>{m.senderRole==='admin'?'Care Associate Support':m.senderRole==='helper'?'You • Care Associate':'You'}</Text><Text>{m.body}</Text><Text style={s.muted}>{fmt(m.createdAt)}</Text></View>)}
      {['resolved','closed'].includes(selected.status)?<Text style={s.muted}>This ticket is closed. Create a new ticket if you need more help.</Text>:<><Input placeholder="Write a reply" value={reply} onChangeText={setReply}/><Btn title={busy?'Sending…':'Send reply'} disabled={busy} onPress={send}/></>}
    </View>
  </View>;
  return <View>
    <View style={[s.card,{backgroundColor:'#e8f4f1'}]}><Text style={s.h2}>Support centre</Text><Text style={s.muted}>Create a private support ticket and follow replies from our team. Do not include passwords, OTPs or full payment credentials.</Text></View>
    <View style={s.card}><Text style={s.h3}>Create a ticket</Text>
      <Input placeholder="Subject" value={form.subject} onChangeText={v=>setForm({...form,subject:v})}/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginVertical:8}}>{['booking','payment','account','associate','safety','other'].map(v=><Btn key={v} small kind={form.category===v?'primary':'alt'} title={v} onPress={()=>setForm({...form,category:v})}/>)}</View>
      <Input placeholder="Describe the issue" value={form.message} onChangeText={v=>setForm({...form,message:v})} multiline/>
      <Btn title={busy?'Submitting…':'Submit support ticket'} disabled={busy} onPress={create}/>
    </View>
    <Text style={s.h2}>Your tickets</Text>
    {items.map(item=><TouchableOpacity key={item._id} style={s.card} onPress={()=>setSelected(item)}><Text style={{fontWeight:'700'}}>{item.subject}</Text><Text style={s.muted}>{item.category} • {item.status.replace('_',' ')} • {fmt(item.updatedAt)}</Text><Text style={s.muted}>{item.messages?.length||0} messages • Tap to open</Text></TouchableOpacity>)}
    {!items.length&&<Text style={s.muted}>No support tickets yet.</Text>}
  </View>;
}

function AdminSupport({ notify }) {
  const [items,setItems]=useState([]);
  const [filter,setFilter]=useState('open');
  const [reply,setReply]=useState({});
  const load=()=>api('/admin/support/tickets'+(filter==='all'?'':'?status='+filter)).then(data=>setItems(data.items||[])).catch(e=>notify(e.message,true));
  useEffect(()=>{load();},[filter]);
  const update=(id,body)=>api('/admin/support/tickets/'+id,'PATCH',body).then(load).catch(e=>notify(e.message,true));
  return <View>
    <View style={s.card}><Text style={s.h2}>Support ticket queue</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{['open','in_progress','resolved','closed','all'].map(v=><Btn key={v} small kind={filter===v?'primary':'alt'} title={v.replace('_',' ')} onPress={()=>setFilter(v)}/>)}</View></View>
    {items.map(item=><View key={item._id} style={s.card}>
      <Text style={s.h3}>{item.subject}</Text><Text style={s.muted}>{item.owner?.name||'User'} • {item.owner?.phone||''} • {item.role} • {item.category}</Text><Text style={s.muted}>Status: {item.status}</Text>
      {(item.messages||[]).map(m=><View key={m._id} style={{paddingVertical:7,borderBottomWidth:1,borderBottomColor:C.line}}><Text style={{fontWeight:'700'}}>{m.senderRole==='admin'?'Admin':'Customer'} • {fmt(m.createdAt)}</Text><Text>{m.body}</Text></View>)}
      <Input placeholder="Reply to user" value={reply[item._id]||''} onChangeText={v=>setReply({...reply,[item._id]:v})}/>
      <Btn title="Send reply" onPress={()=>{const message=reply[item._id]||'';if(!message.trim())return notify('Enter a reply',true);update(item._id,{message}).then(()=>setReply(old=>({...old,[item._id]:''})));}}/>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{['open','in_progress','resolved','closed'].filter(v=>v!==item.status).map(v=><Btn key={v} small kind="alt" title={'Mark '+v.replace('_',' ')} onPress={()=>update(item._id,{status:v})}/>)}</View>
    </View>)}
    {!items.length&&<Text style={s.muted}>No tickets in this queue.</Text>}
  </View>;
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
function LiveWatch() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const hour = now.getHours() % 12;
  const minute = now.getMinutes();
  const second = now.getSeconds();
  return (
    <View style={{ width: 124, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f7f5', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 7 }}>
      <Svg width={92} height={108} viewBox="0 0 120 140">
        <Rect x="43" y="2" width="34" height="35" rx="12" fill="#b8d7d0" />
        <Rect x="43" y="103" width="34" height="35" rx="12" fill="#b8d7d0" />
        <Rect x="25" y="23" width="70" height="94" rx="23" fill="#164f49" />
        <Path d="M60 30 A34 34 0 1 1 59.9 30" fill="#ffffff" stroke="#d9ebe6" strokeWidth="2" />
        <Path d="M60 34 A30 30 0 1 1 59.9 34" fill="none" stroke="#e7efed" strokeWidth="1" />
        <Path d="M60 36 L60 43" stroke="#829b96" strokeWidth="2" strokeLinecap="round" />
        <Path d="M60 84 L60 91" stroke="#829b96" strokeWidth="2" strokeLinecap="round" />
        <Path d="M36 63 L43 63" stroke="#829b96" strokeWidth="2" strokeLinecap="round" />
        <Path d="M77 63 L84 63" stroke="#829b96" strokeWidth="2" strokeLinecap="round" />
        <Path d="M60 63 L60 46" stroke="#0f766e" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${hour * 30 + minute * 0.5} 60 63)`} />
        <Path d="M60 63 L60 39" stroke="#164f49" strokeWidth="2.2" strokeLinecap="round" transform={`rotate(${minute * 6 + second * 0.1} 60 63)`} />
        <Path d="M60 69 L60 38" stroke="#e26f5b" strokeWidth="1.2" strokeLinecap="round" transform={`rotate(${second * 6} 60 63)`} />
        <Path d="M57 63 A3 3 0 1 0 63 63 A3 3 0 1 0 57 63" fill="#0f766e" />
      </Svg>
      <Text style={{ color: '#174b44', fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
      <Text style={{ color: '#78908a', fontSize: 10, marginTop: 2 }}>LIVE LOCAL TIME</Text>
    </View>
  );
}

function NewBooking({ user, notify, done, requireLogin, resume, repeatBooking, onOpenService, selectedService }) {
  const [f, setF] = useState({ service: 'queue', hospital: '', city: user?.city || '', details: '' });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [hours, setHours] = useState(4);
  const [bookingType, setBookingType] = useState('hourly');
  const [price, setPrice] = useState(null);
  const [free, setFree] = useState([]);
  const [pick, setPick] = useState('any');
  const [patientExperience, setPatientExperience] = useState(null);
  const [familyProfileId, setFamilyProfileId] = useState('');
  const [familyConsent,setFamilyConsent]=useState(false);
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
    return { startTime: start.toISOString(), endTime: new Date(start.getTime() + (bookingType === 'token' ? 1 : hours) * 3600000).toISOString() };
  };

  useEffect(()=>{let live=true;const timer=setTimeout(async()=>{if(!f.hospital.trim()||!f.city.trim()){setHospitalLocation(null);return;}try{const found=await Location.geocodeAsync(`${f.hospital}, ${f.city}`);if(live&&found?.[0])setHospitalLocation({latitude:found[0].latitude,longitude:found[0].longitude});else if(live)setHospitalLocation(null);}catch{if(live)setHospitalLocation(null);}},700);return()=>{live=false;clearTimeout(timer);};},[f.hospital,f.city]);

  useEffect(() => {
    if (!date || !validTime(time) || !f.city.trim()) { setPrice(null); setFree([]); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      const r = range();
      const loc = hospitalLocation ? `&latitude=${hospitalLocation.latitude}&longitude=${hospitalLocation.longitude}` : '';
      const q = `startTime=${encodeURIComponent(r.startTime)}&endTime=${encodeURIComponent(r.endTime)}&city=${encodeURIComponent(f.city.trim())}${loc}`;
      Promise.all([api('/price', 'POST', { ...r, bookingType }), api('/availability?' + q)])
        .then(([p, a]) => { if (live) { setPrice(p); setFree(a); setPick('any'); } })
        .catch((e) => { if (live) { setPrice(null); setFree([]); notify(e.message, true); } });
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [date, time, hours, bookingType, f.city, hospitalLocation?.latitude, hospitalLocation?.longitude]);

  const book = async () => {
    if (!user) return requireLogin('Please log in or create an account to confirm your booking. Your details are saved, you will not have to fill them again.');
    if (user.role !== 'patient') return notify('Please use a patient account to book', true);
    if (payBusy) return;
    try {
      setPayBusy(true);
      const order = await api('/bookings/create-payment', 'POST', {
        ...f, bookingType, ...range(), helperId: pick === 'any' ? undefined : pick, familyProfileId: familyProfileId || undefined, familyConsent, hospitalLocation: hospitalLocation || undefined,
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
      <View style={s.card}><Text style={s.muted}>💰 Approved rates: Day ₹150 − ₹50 = ₹100/hour • Night ₹200 − ₹75 = ₹125/hour. Token booking: ₹250 − ₹100 = ₹150 fixed.</Text></View>

      <Text style={s.sec}>1. What do you need help with?</Text>
      <View style={s.svcGrid}>
        {SERVICES.map((sv) => (
          <TouchableOpacity key={sv.id} style={[s.svc, f.service === sv.id && s.chipOn]} onPress={() => onOpenService ? onOpenService(sv.id) : setF({ ...f, service: sv.id })}>
            <MenuIcon id={sv.id} size={22} /><Text style={s.serviceLabel}>{sv.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.sec}>2. Which hospital?</Text>
      <Input placeholder="Hospital name" value={f.hospital} onChangeText={set('hospital')} />
      {!!patientExperience?.savedHospitals?.length && <View style={s.chips}>{patientExperience.savedHospitals.map(h => <Chip key={h._id} label={h.name} on={f.hospital === h.name && f.city === h.city} onPress={() => setF(old => ({ ...old, hospital: h.name, city: h.city }))} />)}</View>}
      <Input placeholder="City" value={f.city} onChangeText={set('city')} />
      <Input placeholder="Anything we should know? (doctor, department, reports...)" multiline value={f.details} onChangeText={set('details')} />
      <Text style={s.sec}>2. Booking for</Text>
      <View style={[s.card, { padding: 12 }]}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity onPress={() => { setFamilyProfileId(''); setFamilyConsent(false); }} style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: !familyProfileId ? '#0f766e' : '#dce8e5', backgroundColor: !familyProfileId ? '#eaf5f2' : '#ffffff', borderRadius: 11, paddingVertical: 10, paddingHorizontal: 13 }}>
            <MenuIcon id="profile" active={!familyProfileId} size={17} />
            <Text style={{ color: !familyProfileId ? '#0f766e' : '#425c57', fontSize: 12, fontWeight: '700', marginLeft: 7 }}>Myself</Text>
          </TouchableOpacity>
          {(patientExperience?.familyProfiles || []).map(p => (
            <TouchableOpacity key={p._id} onPress={() => { setFamilyProfileId(p._id); setFamilyConsent(false); }} style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: familyProfileId === p._id ? '#0f766e' : '#dce8e5', backgroundColor: familyProfileId === p._id ? '#eaf5f2' : '#ffffff', borderRadius: 11, paddingVertical: 10, paddingHorizontal: 13 }}>
              <MenuIcon id="family" active={familyProfileId === p._id} size={17} />
              <Text style={{ color: familyProfileId === p._id ? '#0f766e' : '#425c57', fontSize: 12, fontWeight: '700', marginLeft: 7 }}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{ color: '#7a8d88', fontSize: 11, marginTop: 9 }}>{familyProfileId ? 'This booking will be arranged for your selected family member.' : 'You are booking care for yourself.'}</Text>
        {!!familyProfileId && <View style={{ borderTopWidth: 1, borderTopColor: '#edf2f1', marginTop: 10, paddingTop: 10 }}>
          <Text style={s.muted}>Confirm that you are authorized by this family member or their legal representative to arrange this booking and share the necessary details.</Text>
          <View style={[s.rowBetween, { marginTop: 10 }]}>
            <Text style={{ flex: 1, fontWeight: '700', color: '#294a46', fontSize: 12 }}>I have consent to book for this person</Text>
            <Switch value={familyConsent} onValueChange={setFamilyConsent} trackColor={{ true: C.p }} />
          </View>
        </View>}
      </View>

      <Text style={s.sec}>3. Which day? (you can book in advance)</Text>
      <View style={s.card}><Calendar value={date} onChange={setDate} /></View>
      {!!date && <Text style={{ color: '#15803d' }}>📅 {fmtDay(date)}</Text>}

      {f.service === 'queue' && <View style={s.card}><Text style={{fontWeight:'800',color:'#244740'}}>Booking type</Text><View style={s.chips}><Chip label="Hourly assistance" on={bookingType==='hourly'} onPress={()=>setBookingType('hourly')} /><Chip label="Token only • ₹150 fixed" on={bookingType==='token'} onPress={()=>setBookingType('token')} /></View>{bookingType==='token' && <Text style={s.muted}>Care Associate will reach at your selected time and handle the token queue. Token waiting time is not guaranteed; it may take 10 minutes or 2 hours. No duration is charged.</Text>}</View>}
      <Text style={s.sec}>4. Schedule your care</Text>
      <View style={[s.card, { padding: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#244740', fontSize: 13, fontWeight: '800', marginBottom: 5 }}>Preferred start time</Text>
            <Input placeholder="HH:MM" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
            <Text style={{ color: '#7a8d88', fontSize: 10, marginTop: 1 }}>24-hour format</Text>
          </View>
          <LiveWatch />
        </View>
        {!validTime(time) && <Text style={{ color: C.err, fontSize: 12, marginTop: 6 }}>Enter time in HH:MM format, for example 09:30.</Text>}
        <Text style={{ color: '#526b66', fontSize: 12, fontWeight: '700', marginTop: 15, marginBottom: 3 }}>Quick select</Text>
        <View style={s.chips}>{['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'].map((t) => <Chip key={t} label={t} on={time === t} onPress={() => setTime(t)} />)}</View>
        {bookingType === 'hourly' && <>        <View style={{ height: 1, backgroundColor: '#edf2f1', marginTop: 9, marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: '#244740', fontSize: 14, fontWeight: '800' }}>Care duration</Text>
            <Text style={{ color: '#7a8d88', fontSize: 11, marginTop: 2 }}>Select the required hours</Text>
          </View>
          <Text style={{ color: '#0f766e', fontSize: 20, fontWeight: '800' }}>{hours} <Text style={{ fontSize: 11 }}>hrs</Text></Text>
        </View>
        <View style={s.chips}>{[2, 4, 8, 12, 24, 48].map((h) => <Chip key={h} label={h >= 24 ? `${h / 24} day${h > 24 ? 's' : ''}` : `${h} hours`} on={hours === h} onPress={() => setHours(h)} />)}</View></>}
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
          {bookingType === 'token' ? <Text style={s.muted}>Token booking • No duration • ₹250 base − ₹100 discount</Text> : <Text style={s.muted}>{price.totalHours} hours • Day ₹100/hr • Night ₹125/hr</Text>}
          <Text style={s.price}>Payable: ₹{price.payable ?? price.total}</Text>
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
  const load = () => api('/bookings/mine').then(rows => { setList(rows); syncLocalBookingReminders(rows); }).catch((e) => notify(e.message, true));
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
function Profile({ user, setUser, notify, onDeleted }) {
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
      <AccountDeletion user={user} notify={notify} onDeleted={onDeleted} />
    </View>
  );
}

// ---------- Care Associate ----------
function Earnings({ notify }) {
  const [data, setData] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [error, setError] = useState('');
  const load = async () => {
    const results = await Promise.allSettled([
      api('/helper/earnings').then(setData),
      api('/helper/payouts').then(setPayouts),
    ]);
    const failed = results.find(result => result.status === 'rejected');
    setError(failed?.reason?.message || '');
  };
  useEffect(() => { load(); }, []);
  const exportStatement = async () => {
    try {
      const response = await fetch(API_URL + '/api/helper/payouts/statement.csv', { headers: { Authorization: 'Bearer ' + TOKEN } });
      if (!response.ok) {
        let message = 'Unable to export payout statement';
        try { message = (await response.json()).error || message; } catch (_) {}
        throw new Error(message);
      }
      const csv = await response.text();
      await Share.share({ title: 'Care Associate payout statement', message: csv });
    } catch (e) { notify(e.message, true); }
  };
  return (
    <View>
      <View style={s.card}>
        <Text style={s.h2}>My earnings</Text>
        {error ? <Text style={{ color: C.err }}>{error}</Text> : !data ? <ActivityIndicator color={C.p} /> : <>
          <Text style={s.muted}>Completed paid bookings • commission {Number(data.bookings?.[0]?.commissionBps || 0) / 100}%</Text>
          <Text style={s.price}>₹{data.associateEarning.toFixed(2)}</Text>
          <Text style={s.muted}>Gross: ₹{data.gross.toFixed(2)}  •  Platform fee: ₹{data.platformFee.toFixed(2)}</Text>
          <Text style={s.muted}>This is calculated earning, not an automatic UPI payout.</Text>
        </>}
        <View style={{flexDirection:"row",gap:8}}><View style={{flex:1}}><Btn kind="alt" title="Refresh earnings" onPress={load} /></View><View style={{flex:1}}><Btn kind="alt" title="Share payout statement" onPress={exportStatement} /></View></View>
      </View>
      <Text style={s.h3}>Completed bookings</Text>
      {data?.bookings?.map((b) => <View key={b.bookingId} style={s.card}>
        <Text style={{ fontWeight: '700' }}>{b.hospital}</Text>
        <Text style={s.muted}>{b.service} • {fmt(b.completedAt)}</Text>
        <Text style={s.muted}>Gross ₹{b.gross.toFixed(2)} • Fee ₹{b.platformFee.toFixed(2)}</Text>
        <Text style={s.price}>Your earning: ₹{b.associateEarning.toFixed(2)}</Text>
      </View>)}
      {data && data.bookings.length === 0 && <Text style={s.muted}>No completed paid bookings yet.</Text>}
      <Text style={s.h3}>Payout history</Text>
      {!payouts && !error && <ActivityIndicator color={C.p} />}
      {payouts && <View style={s.card}>
        <Text style={s.muted}>Pending: ₹{Number(payouts.totals?.pending || 0).toFixed(2)} • Paid: ₹{Number(payouts.totals?.paid || 0).toFixed(2)}</Text>
        {payouts.records.length === 0 && <Text style={s.muted}>No payouts have been recorded yet.</Text>}
        {payouts.records.map(p => <View key={p._id} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
          <View style={s.rowBetween}>
            <Text style={{ fontWeight: '700' }}>₹{Number(p.amount).toFixed(2)}</Text>
            <Text style={[s.tag, { backgroundColor: p.status === 'paid' ? '#dcfce7' : p.status === 'pending' ? '#fef3c7' : '#fee2e2' }]}>{p.status.toUpperCase()}</Text>
          </View>
          <Text style={s.muted}>{fmt(p.createdAt)}{p.paidAt ? ' • Paid ' + fmt(p.paidAt) : ''}</Text>
          {!!p.reference && <Text style={s.muted}>Transfer reference: {p.reference}</Text>}
        </View>)}
      </View>}
    </View>
  );
}

function Associate({ user, setUser, notify, tab, onLogout }) {
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

  if (tab === 'training') return <TrainingCentre notify={notify} />;
  if (tab === 'performance') return <HelperPerformance notify={notify} />;
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
  if (tab === 'profile') return <Profile user={user} setUser={setUser} notify={notify} onDeleted={onLogout} />;
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

function AdminReports({ notify }) {
  const [city, setCity] = useState('');
  const [report, setReport] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      setLoading(true); setError('');
      const query = city.trim() ? '?city=' + encodeURIComponent(city.trim()) : '';
      const [operationsData, attendanceData] = await Promise.all([api('/admin/reports/operations' + query), api('/admin/reports/attendance' + query)]);
      setReport(operationsData); setAttendance(attendanceData);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const shareCsv = async () => {
    try {
      const query = city.trim() ? '?city=' + encodeURIComponent(city.trim()) : '';
      const response = await fetch(API_URL + '/api/admin/reports/operations.csv' + query, { headers: { Authorization: 'Bearer ' + TOKEN } });
      if (!response.ok) {
        let message = 'Unable to export report';
        try { message = (await response.json()).error || message; } catch (_) {}
        throw new Error(message);
      }
      const csv = await response.text();
      await Share.share({ title: 'Care Associate operations report', message: csv });
    } catch (e) { notify(e.message, true); }
  };
  const moneyText = value => '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const shareAttendanceCsv = async () => {
    try {
      const query = city.trim() ? '?city=' + encodeURIComponent(city.trim()) : '';
      const response = await fetch(API_URL + '/api/admin/reports/attendance.csv' + query, { headers: { Authorization: 'Bearer ' + TOKEN } });
      if (!response.ok) throw new Error('Unable to export attendance report');
      await Share.share({ title: 'Care Associate attendance report', message: await response.text() });
    } catch(e) { notify(e.message,true); }
  };
  return (
    <View>
      <View style={s.card}>
        <Text style={s.h2}>Operations reports</Text>
        <Text style={s.muted}>Booking activity, service demand and collected payments for the last 30 days.</Text>
        <Input placeholder="Filter by city (optional)" value={city} onChangeText={setCity} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Btn title={loading ? 'Loading…' : 'Apply filter'} disabled={loading} onPress={load} /></View>
          <View style={{ flex: 1 }}><Btn kind="alt" title="Share CSV" onPress={shareCsv} /></View>
        </View>
        {!!error && <Text style={{ color: C.err }}>{error}</Text>}
      </View>
      {loading && <ActivityIndicator color={C.p} style={{ margin: 18 }} />}
            {attendance && <View style={s.card}>
        <Text style={s.h2}>Helper attendance & work hours</Text>
        <Text style={s.muted}>{attendance.summary.helpers} Care Associates • {attendance.summary.duties} completed duties • {Number(attendance.summary.totalHours||0).toFixed(2)} total hours</Text>
        <Btn kind="alt" title="Share attendance CSV" onPress={shareAttendanceCsv}/>
        {attendance.rows.slice(0,20).map(row=><View key={row.helperId} style={{paddingVertical:8,borderTopWidth:1,borderTopColor:C.line}}><Text style={{fontWeight:'700'}}>{row.name} • {row.city}</Text><Text style={s.muted}>{row.duties} completed duties • {Number(row.totalHours).toFixed(2)} hours</Text></View>)}
        {attendance.rows.length===0&&<Text style={s.muted}>No completed duty hours in this period.</Text>}
      </View>}
      {report && <>
        <View style={s.card}>
          <Text style={s.h2}>Summary</Text>
          <View style={s.rowBetween}><Text style={s.muted}>Total bookings</Text><Text style={{ fontWeight: '700' }}>{report.summary.bookings}</Text></View>
          <View style={s.rowBetween}><Text style={s.muted}>Paid bookings</Text><Text style={{ fontWeight: '700' }}>{report.summary.paidBookings}</Text></View>
          <View style={s.rowBetween}><Text style={s.muted}>Gross collected</Text><Text style={{ fontWeight: '700' }}>{moneyText(report.summary.grossCollected)}</Text></View>
          <View style={s.rowBetween}><Text style={s.muted}>Successful refunds</Text><Text style={{ fontWeight: '700' }}>{moneyText(report.summary.refunds)}</Text></View>
          <Text style={s.price}>Net collected: {moneyText(report.summary.netCollected)}</Text>
          <Text style={s.muted}>From {fmt(report.range.from)} to {fmt(report.range.to)}</Text>
        </View>
        {[
          ['Bookings by city', report.byCity],
          ['Hospital demand', report.byHospital],
          ['Service demand', report.byService],
        ].map(([title, rows]) => <View key={title} style={s.card}>
          <Text style={s.h2}>{title}</Text>
          {rows.length === 0 && <Text style={s.muted}>No bookings in this period.</Text>}
          {rows.map(row => <View key={row.name} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
            <Text style={{ fontWeight: '700' }}>{row.name}</Text>
            <Text style={s.muted}>{row.bookings} bookings • {row.paid} paid • Net {moneyText(row.netCollected)}</Text>
          </View>)}
        </View>)}
      </>}
    </View>
  );
}

// ---------- Admin ----------
function Admin({ tab, notify, onNavigate }) {
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
  const [assigning, setAssigning] = useState(false);
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
  const shareFinanceCsv = async () => {
    try {
      const response=await fetch(API_URL+'/api/admin/finance.csv',{headers:{Authorization:'Bearer '+TOKEN}});
      if(!response.ok)throw new Error('Unable to export finance report');
      await Share.share({title:'Care Associate finance report',message:await response.text()});
    } catch(e) { notify(e.message,true); }
  };

  const assignHelper = async (booking, helper) => {
    try { setAssigning(true); const result = await api('/admin/bookings/'+booking._id+'/assign','POST',{helperId:helper.id}); setSelectedBooking(result.booking); notify('Care Associate assigned successfully'); load(); }
    catch(e) { notify(e.message,true); } finally { setAssigning(false); }
  };
  const unassignHelper = booking => Alert.alert('Reassign this booking?','The current Care Associate will be removed and the booking returned to the pending queue.',[
    {text:'Cancel',style:'cancel'},
    {text:'Reassign',style:'destructive',onPress:async()=>{try{setAssigning(true);const result=await api('/admin/bookings/'+booking._id+'/unassign','POST');setSelectedBooking(result.booking);notify('Booking returned to assignment queue');load();}catch(e){notify(e.message,true);}finally{setAssigning(false);}}}
  ]);
  useEffect(() => { load(); }, [tab]);
  useEffect(() => { if(tab!=='overview') return; const timer=setInterval(()=>api('/admin/users').then(setUsers).catch(e=>console.warn('Pending approval refresh failed:',e.message)),20000); return ()=>clearInterval(timer); }, [tab]);
  if (tab === 'reports') return <AdminReports notify={notify} />;
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
  if (tab === 'overview') {
    const pendingApprovals=users.filter(u=>u.role==='helper'&&!u.verified);
    const paidBookings=(data.bookings||[]).filter(b=>b.paymentStatus==='paid').length;
    return <View>
      <View style={{backgroundColor:'#123f3a',borderRadius:20,padding:18,marginBottom:14}}>
        <Text style={{color:'#b9e3d9',fontSize:12,fontWeight:'700',letterSpacing:1}}>CARE ASSOCIATE • ADMIN</Text>
        <Text style={{color:'#fff',fontSize:24,fontWeight:'800',marginTop:7}}>Operations dashboard</Text>
        <Text style={{color:'#d5e9e4',fontSize:13,lineHeight:19,marginTop:5}}>Monitor registrations, approve Care Associates and manage daily operations.</Text>
        <View style={{flexDirection:'row',gap:8,marginTop:15}}>
          <View style={{flex:1}}><Btn title="Refresh data" kind="light" onPress={load}/></View>
          <View style={{flex:1}}><Btn title="View approvals" onPress={()=>onNavigate?.('approvals')}/></View>
        </View>
      </View>
      <View style={s.card}>
        <View style={s.rowBetween}><Text style={s.h3}>Pending Care Associate approvals</Text><Text style={{fontWeight:'800',fontSize:22,color:pendingApprovals.length?'#b45309':C.p}}>{pendingApprovals.length}</Text></View>
        <Text style={s.muted}>New registrations waiting for your review</Text>
        {pendingApprovals.map(u=><View key={u.id} style={{paddingVertical:11,borderTopWidth:1,borderTopColor:C.line}}>
          <Text style={{fontWeight:'700',color:'#173b37'}}>{u.name}</Text>
          <Text style={s.muted}>{u.phone} • {u.city||'City not provided'}</Text>
          <Text style={{fontSize:12,color:u.aadhaarUploaded&&u.upiId?'#15803d':'#b45309',marginTop:3}}>{u.aadhaarUploaded?'Aadhaar uploaded':'Aadhaar missing'} • {u.upiId?'UPI added':'UPI missing'}</Text>
          <Btn small kind="alt" title="Review & approve" onPress={()=>{setSelectedUser(u);onNavigate?.('approvals');}}/>
        </View>)}
        {!pendingApprovals.length&&<Text style={s.muted}>No pending Care Associate requests.</Text>}
        <Btn kind="alt" title="Open full approvals list" onPress={()=>onNavigate?.('approvals')}/>
      </View>
      <View style={{flexDirection:'row',gap:10}}>
        <View style={[s.card,{flex:1,marginBottom:10}]}>
          <Text style={s.muted}>Pending approvals</Text>
          <Text style={[s.price,{color:pendingApprovals.length?'#b45309':C.p,fontSize:30}]}>{pendingApprovals.length}</Text>
          <Text style={s.muted}>Care Associate requests</Text>
        </View>
        <View style={[s.card,{flex:1,marginBottom:10}]}>
          <Text style={s.muted}>Total users</Text><Text style={[s.price,{fontSize:30}]}>{users.length}</Text>
          <Text style={s.muted}>{users.filter(u=>u.role==='helper').length} Care Associates</Text>
        </View>
      </View>
      <View style={{flexDirection:'row',gap:10}}>
        <View style={[s.card,{flex:1,marginBottom:10}]}>
          <Text style={s.muted}>Bookings</Text><Text style={[s.price,{fontSize:27}]}>{(data.bookings||[]).length}</Text>
          <Text style={s.muted}>{paidBookings} paid</Text>
        </View>
        <View style={[s.card,{flex:1,marginBottom:10}]}>
          <Text style={s.muted}>Completed revenue</Text><Text style={[s.price,{fontSize:27}]}>₹{data.revenue||0}</Text>
          <Text style={s.muted}>Paid & completed</Text>
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.h3}>Booking status</Text>
        {['pending','accepted','on_the_way','ongoing','completed','cancelled'].map(status=><View key={status} style={[s.rowBetween,{paddingVertical:7,borderTopWidth:1,borderTopColor:C.line}]}><Text>{STATUS[status]||status}</Text><Text style={{fontWeight:'800',color:'#173b37'}}>{(data.bookings||[]).filter(b=>b.status===status).length}</Text></View>)}
      </View>
    </View>;
  }
  if (tab === 'approvals') {
    const pending=users.filter(u=>u.role==='helper'&&!u.verified);
    return <View>
      <View style={[s.card,{backgroundColor:'#e8f4f1'}]}>
        <Text style={s.h2}>Care Associate approvals</Text>
        <Text style={s.muted}>Review each registration, check masked Aadhaar and UPI details, then approve eligible associates.</Text>
        <View style={s.rowBetween}><Text style={{fontWeight:'700',color:'#173b37'}}>Pending requests</Text><Text style={[s.price,{fontSize:24}]}>{pending.length}</Text></View>
        <Btn kind="alt" title="Refresh requests" onPress={load}/>
      </View>
      {pending.map(u=><View key={u.id} style={s.card}>
        <Text style={s.h3}>{u.name}</Text>
        <Text style={s.muted}>{u.phone} • {u.city||'City not provided'}</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:9}}>
          <Text style={[s.tag,{backgroundColor:u.aadhaarUploaded?'#dcfce7':'#fef3c7'}]}>{u.aadhaarUploaded?'Aadhaar uploaded':'Aadhaar missing'}</Text>
          <Text style={[s.tag,{backgroundColor:u.upiId?'#dcfce7':'#fef3c7'}]}>{u.upiId?'UPI added':'UPI missing'}</Text>
        </View>
        <Text style={s.muted}>Registered: {fmt(u.createdAt)}</Text>
        <Btn title="Review application" onPress={()=>setSelectedUser(u)}/>
      </View>)}
      {!pending.length&&<View style={s.card}><Text style={{fontWeight:'700',color:'#173b37'}}>No pending requests found</Text><Text style={s.muted}>Refresh to check again. If a new registration is still missing, confirm that the person selected “Care Associate” during registration and completed the masked Aadhaar upload.</Text></View>}
    </View>;
  }
  if (tab === 'emergency') return <AdminEmergency notify={notify} />;
  if (tab === 'incidents') return <AdminIncidents notify={notify} />;
  if (tab === 'payouts') return <AdminPayouts notify={notify} />;
  if (tab === 'audit') return <AdminAudit notify={notify} />;
  if ((tab === 'users' || tab === 'approvals') && selectedUser) return <View>
    <Btn kind="alt" title={tab==='approvals'?'‹ Back to pending approvals':'‹ Back to users'} onPress={()=>{setSelectedUser(null);setShowId(null);}}/>
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
        <Btn title={selectedUser.verified?'Remove verification':'Approve Care Associate'} disabled={!selectedUser.verified&&(!selectedUser.aadhaarUploaded||!selectedUser.upiId)} onPress={()=>toggle(selectedUser.id).then(()=>setSelectedUser(null))}/>
        {!selectedUser.verified&&(!selectedUser.aadhaarUploaded||!selectedUser.upiId)&&<Text style={{color:C.err,fontSize:12,marginTop:6}}>Approval blocked: {(!selectedUser.aadhaarUploaded?'masked Aadhaar':'')+(!selectedUser.aadhaarUploaded&&!selectedUser.upiId?' and ':'')+(!selectedUser.upiId?'UPI ID':'')} missing.</Text>}
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
    {selectedBooking.paymentStatus==='paid'&&selectedBooking.status==='pending'&&!selectedBooking.helper&&<View style={s.card}>
      <Text style={s.h3}>Manual Care Associate assignment</Text><Text style={s.muted}>Verified, active associates in {selectedBooking.city} are shown. The server also checks leave and booking conflicts.</Text>
      {users.filter(u=>u.role==='helper'&&u.verified&&!u.isSuspended&&u.available!==false&&String(u.city||'').toLowerCase()===String(selectedBooking.city||'').toLowerCase()).map(helper=><View key={helper.id} style={{paddingVertical:8,borderTopWidth:1,borderTopColor:C.line}}><Text style={{fontWeight:'700'}}>{helper.name} • ★ {Number(helper.ratingAverage||0).toFixed(1)}</Text><Text style={s.muted}>{helper.phone} • {helper.city}</Text><Btn small title={assigning?'Assigning…':'Assign this associate'} disabled={assigning} onPress={()=>assignHelper(selectedBooking,helper)}/></View>)}
    </View>}
    {selectedBooking.status==='accepted'&&selectedBooking.paymentStatus==='paid'&&<Btn kind="danger" title="Unassign and return to queue" disabled={assigning} onPress={()=>unassignHelper(selectedBooking)}/>}


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
        <Btn kind="alt" title="Share finance CSV" onPress={shareFinanceCsv}/>
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
function HelperPerformance({ notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/helper/performance').then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  return (
    <View>
      <View style={s.card}>
        <Text style={s.h2}>My performance</Text>
        {!data && !error && <ActivityIndicator color={C.p} />}
        {error && <Text style={{ color: C.err }}>{error}</Text>}
        {data && <>
          <Text style={s.price}>{data.ratingCount ? '★ ' + data.ratingAverage.toFixed(2) + ' / 5' : 'Not rated yet'}</Text>
          <Text style={s.muted}>{data.ratingCount} verified booking review{data.ratingCount === 1 ? '' : 's'}</Text>
        </>}
        <Btn kind="alt" title="Refresh performance" onPress={load} />
      </View>
      <Text style={s.h3}>Patient feedback</Text>
      {data?.reviews?.map(review => <View key={review.id} style={s.card}>
        <Text style={{ fontWeight: '700', color: '#a16207' }}>{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)} <Text style={{ color: '#173b37' }}>{review.rating}/5</Text></Text>
        {!!review.comment && <Text style={{ color: '#334155', marginTop: 7, lineHeight: 20 }}>{review.comment}</Text>}
        <Text style={s.muted}>{review.booking?.hospital || 'Completed booking'}{review.booking?.service ? ' • ' + review.booking.service : ''}</Text>
        <Text style={s.muted}>{fmt(review.createdAt)}</Text>
      </View>)}
      {data && data.reviews.length === 0 && <View style={s.card}><Text style={s.muted}>Reviews from completed bookings will appear here.</Text></View>}
    </View>
  );
}

function TrainingCentre({ notify }) {
  const [catalogue, setCatalogue] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const load = () => api('/helper/training').then(setCatalogue).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  const selected = catalogue?.modules?.find(module => module.id === selectedId);
  const submit = async () => {
    if (!selected || answers.length !== selected.questions.length || answers.some(answer => answer == null)) {
      return notify('Please answer every question first', true);
    }
    try {
      setSubmitting(true);
      const result = await api('/helper/training/' + selected.id + '/complete', 'POST', { answers });
      notify(result.passed ? 'Training module passed — ' + result.score + '%' : 'Quiz score: ' + result.score + '%. Review and try again.', !result.passed);
      setSelectedId(null);
      setAnswers([]);
      await load();
    } catch (e) { notify(e.message, true); }
    finally { setSubmitting(false); }
  };
  if (error && !catalogue) return <View style={s.card}><Text style={{ color: C.err }}>{error}</Text><Btn title="Retry" onPress={load} /></View>;
  if (!catalogue) return <ActivityIndicator color={C.p} style={{ margin: 24 }} />;
  if (selected) return (
    <View>
      <Btn kind="alt" small title="‹ All training modules" onPress={() => { setSelectedId(null); setAnswers([]); }} />
      <View style={s.card}>
        <Text style={s.h2}>{selected.title}</Text>
        <Text style={s.muted}>{selected.duration} • Read each lesson, then complete the quiz (80% required)</Text>
        {selected.lessons.map((lesson, index) => <View key={index} style={{ flexDirection: 'row', marginTop: 10 }}>
          <Text style={{ color: C.p, fontWeight: '700', marginRight: 8 }}>{index + 1}.</Text>
          <Text style={{ flex: 1, lineHeight: 20, color: '#334155' }}>{lesson}</Text>
        </View>)}
      </View>
      <Text style={s.h3}>Knowledge check</Text>
      {selected.questions.map((question, index) => (
        <View key={index} style={s.card}>
          <Text style={{ fontWeight: '700', lineHeight: 21 }}>{index + 1}. {question.q}</Text>
          {question.options.map((option, optionIndex) => {
            const active = answers[index] === optionIndex;
            return <TouchableOpacity key={optionIndex} onPress={() => setAnswers(current => {
              const next = [...current];
              next[index] = optionIndex;
              return next;
            })} style={{ padding: 11, borderRadius: 10, borderWidth: 1, borderColor: active ? C.p : C.line, backgroundColor: active ? '#e8f4f1' : '#fff', marginTop: 8 }}>
              <Text style={{ color: '#173b37', fontWeight: active ? '700' : '400' }}>{active ? '◉ ' : '○ '}{option}</Text>
            </TouchableOpacity>;
          })}
        </View>
      ))}
      <Btn title={submitting ? 'Submitting…' : 'Submit answers'} disabled={submitting || answers.some(answer => answer == null)} onPress={submit} />
    </View>
  );
  return (
    <View>
      <View style={s.card}>
        <Text style={s.h2}>Care Associate Training</Text>
        <Text style={s.muted}>Non-clinical role, privacy, communication and safety essentials.</Text>
        <Text style={s.price}>{catalogue.completed} / {catalogue.total} completed</Text>
        <View style={{ height: 8, borderRadius: 8, backgroundColor: '#e2e8f0', overflow: 'hidden', marginTop: 5 }}>
          <View style={{ width: (catalogue.completed / Math.max(1, catalogue.total) * 100) + '%', height: 8, backgroundColor: C.p }} />
        </View>
      </View>
      {catalogue.modules.map(module => (
        <View key={module.id} style={s.card}>
          <View style={s.rowBetween}>
            <Text style={{ flex: 1, fontWeight: '700', color: '#173b37' }}>{module.title}</Text>
            <Text style={[s.tag, { backgroundColor: module.progress?.passed ? '#dcfce7' : '#fef3c7' }]}>{module.progress?.passed ? 'PASSED' : 'PENDING'}</Text>
          </View>
          <Text style={s.muted}>{module.duration} • {module.questions.length} questions</Text>
          <Text style={{ color: '#334155', marginTop: 5 }}>{module.summary}</Text>
          {module.progress && <Text style={s.muted}>Last score: {module.progress.score}% • Attempts: {module.progress.attempts}</Text>}
          <Btn kind="alt" title={module.progress?.passed ? 'Review module' : 'Start training'} onPress={() => { setSelectedId(module.id); setAnswers(Array(module.questions.length).fill(null)); }} />
        </View>
      ))}
    </View>
  );
}

function NotificationCentre({ notify }) {
  const [items, setItems] = useState([]);
  const [prefs, setPrefs] = useState({ pushEnabled: true, bookingUpdates: true, chatMessages: true, marketing: false });
  const [prefsBusy, setPrefsBusy] = useState(false);
  const loadPrefs = () => api('/notification-preferences').then(setPrefs).catch(e => notify(e.message, true));
  const changePref = async (key, value) => {
    try {
      setPrefsBusy(true);
      const next = await api('/notification-preferences', 'PATCH', { [key]: value });
      setPrefs(next);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setPrefsBusy(false);
    }
  };
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
  useEffect(() => { load(); loadPrefs(); }, []);
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
          <Btn kind="alt" small title="Refresh" onPress={()=>{load();loadPrefs();}} />
        </View>
        <Text style={s.h3}>Push preferences</Text>
        { [["pushEnabled","Push notifications"],["bookingUpdates","Booking updates"],["chatMessages","Chat messages"],["marketing","Product announcements"]].map(([key,label])=><View key={key} style={[s.rowBetween,{paddingVertical:5}]}><Text style={{flex:1}}>{label}</Text><Switch disabled={prefsBusy} value={!!prefs[key]} onValueChange={v=>changePref(key,v)} trackColor={{true:C.p}}/></View>)}
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


// ---------- Booking operations: reschedule, visit checklist and safety ----------
function BookingOperations({ notify, isAssoc }) {
  const [items,setItems]=useState([]),[selected,setSelected]=useState(null),[start,setStart]=useState(''),[end,setEnd]=useState(''),[note,setNote]=useState(''),[visit,setVisit]=useState(null),[busy,setBusy]=useState(false);
  const load=async()=>{try{const rows=await api('/bookings/mine');setItems(rows);if(selected){const latest=rows.find(x=>x._id===selected._id);if(latest)setSelected(latest);}}catch(e){notify(e.message,true);}};
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(!selected)return;api('/bookings/'+selected._id+'/visit').then(v=>{setVisit(v);setNote(v.handoverNote||'');}).catch(e=>setVisit(null));setStart(new Date(selected.startTime).toISOString());setEnd(new Date(selected.endTime).toISOString());},[selected?._id]);
  const reschedule=async()=>{try{setBusy(true);await api('/bookings/'+selected._id+'/reschedule','POST',{startTime:start,endTime:end});notify('Booking rescheduled');await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}};
  const checklist=[['arrival_confirmed','Arrival confirmed'],['identity_confirmed','Patient identity confirmed'],['task_completed','Agreed task completed'],['belongings_returned','Documents and belongings returned'],['handover_completed','Handover completed']];
  const toggle=async(key,checked)=>{try{const r=await api('/bookings/'+selected._id+'/visit/checklist','PATCH',{key,checked});setVisit(v=>({...v,checklist:r.checklist}));}catch(e){notify(e.message,true);}};
  const saveNote=async()=>{try{const r=await api('/bookings/'+selected._id+'/visit/handover','PATCH',{note});setVisit(v=>({...v,handoverNote:r.handoverNote}));notify('Handover saved');}catch(e){notify(e.message,true);}};
  const safety=async(action)=>{try{const r=await api('/bookings/'+selected._id+'/safety-check-'+action,'POST');setVisit(v=>({...v,[action==='in'?'safetyCheckInAt':'safetyCheckOutAt']:action==='in'?r.checkedInAt:r.checkedOutAt}));notify(action==='in'?'Safety check-in saved':'Safety check-out saved');}catch(e){notify(e.message,true);}};
  if(!selected)return <View><View style={s.card}><Text style={s.h2}>{isAssoc?'Visit & safety tools':'Manage your booking'}</Text><Text style={s.muted}>Choose an upcoming or active booking to view its visit workflow.</Text></View>{items.filter(b=>!['cancelled'].includes(b.status)).map(b=><TouchableOpacity key={b._id} style={s.card} onPress={()=>setSelected(b)}><Text style={{fontWeight:'700'}}>{b.hospital}</Text><Text style={s.muted}>{b.service} • {fmt(b.startTime)} • {STATUS[b.status]||b.status}</Text><Text style={{color:C.p,fontWeight:'700',marginTop:5}}>Open visit tools ›</Text></TouchableOpacity>)}{!items.length&&<Text style={s.muted}>No bookings found.</Text>}</View>;
  const checked=new Set((visit?.checklist||[]).filter(x=>x.checked).map(x=>x.key));
  return <View><Btn kind="alt" title="‹ All bookings" onPress={()=>setSelected(null)}/><BookingCard b={selected} isAssoc={isAssoc}/>
    {!isAssoc&&selected.paymentStatus==='paid'&&['pending','accepted'].includes(selected.status)&&<View style={s.card}><Text style={s.h3}>Reschedule booking</Text><Text style={s.muted}>Enter ISO date-time values. Requests within 24 hours must go through Support. Maximum two reschedules.</Text><Input placeholder="Start time (e.g. 2026-12-01T10:00:00+05:30)" value={start} onChangeText={setStart}/><Input placeholder="End time (e.g. 2026-12-01T14:00:00+05:30)" value={end} onChangeText={setEnd}/><Btn title={busy?'Saving…':'Confirm reschedule'} disabled={busy} onPress={reschedule}/></View>}
    {isAssoc&&<View style={s.card}><Text style={s.h3}>Visit checklist</Text>{checklist.map(([key,label])=><View key={key} style={[s.rowBetween,{paddingVertical:7}]}><Text style={{flex:1}}>{label}</Text><Switch value={checked.has(key)} onValueChange={v=>toggle(key,v)} trackColor={{true:C.p}}/></View>)}<Text style={s.h3}>Digital handover</Text><Input placeholder="Non-clinical task summary and items handed over" value={note} onChangeText={setNote} multiline/><Btn title="Save handover" onPress={saveNote}/><Text style={s.h3}>Personal safety</Text><Text style={s.muted}>Record check-in when duty begins and check-out when you leave. For immediate danger, contact local emergency services.</Text><Text style={s.muted}>Check-in: {visit?.safetyCheckInAt?fmt(visit.safetyCheckInAt):'Not recorded'} • Check-out: {visit?.safetyCheckOutAt?fmt(visit.safetyCheckOutAt):'Not recorded'}</Text><View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Btn title="Check in" onPress={()=>safety('in')}/></View><View style={{flex:1}}><Btn kind="alt" title="Check out" onPress={()=>safety('out')}/></View></View></View>}
    {!isAssoc&&<View style={s.card}><Text style={s.h3}>Visit handover</Text><Text style={s.muted}>{visit?.handoverNote||'Your Care Associate has not added a handover note yet.'}</Text></View>}
  </View>;
}

function AdminServiceCatalogue({notify}) {
 const [items,setItems]=useState([]),[busy,setBusy]=useState({});
 const load=()=>api('/admin/services').then(r=>setItems(r.items||[])).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 const edit=(id,field,value)=>setItems(old=>old.map(x=>x.key===id?{...x,[field]:value}:x));
 const save=async item=>{try{setBusy(v=>({...v,[item.key]:true}));await api('/admin/services/'+item.key,'PUT',{title:item.title,description:item.description,active:item.active,sortOrder:item.sortOrder});notify(item.title+' saved');await load();}catch(e){notify(e.message,true);}finally{setBusy(v=>({...v,[item.key]:false}));}};
 return <View><View style={s.card}><Text style={s.h2}>Service catalogue</Text><Text style={s.muted}>Edit customer-facing service names, descriptions and visibility. Pricing remains governed by the configured booking rate engine.</Text><Btn kind="alt" title="Refresh catalogue" onPress={load}/></View>{items.map(item=><View key={item.key} style={s.card}><Text style={s.muted}>{item.key.toUpperCase()}</Text><Input placeholder="Service title" value={item.title} onChangeText={v=>edit(item.key,'title',v)}/><Input placeholder="Description" value={item.description||''} onChangeText={v=>edit(item.key,'description',v)} multiline/><View style={s.rowBetween}><Text style={{fontWeight:'700'}}>Visible to patients</Text><Switch value={item.active!==false} onValueChange={v=>edit(item.key,'active',v)} trackColor={{true:C.p}}/></View><Btn title={busy[item.key]?'Saving…':'Save service'} disabled={!!busy[item.key]} onPress={()=>save(item)}/></View>)}</View>;
}


function AdminDeliveryAudit({notify}) {
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true);
 const load=()=>{setLoading(true);api('/admin/notification-deliveries?limit=100').then(r=>setItems(r.items||[])).catch(e=>notify(e.message,true)).finally(()=>setLoading(false));};
 useEffect(()=>{load();},[]);
 return <View><View style={s.card}><Text style={s.h2}>Push delivery audit</Text><Text style={s.muted}>Recent push gateway outcomes. Device tokens are never displayed.</Text><Btn kind="alt" title="Refresh audit" onPress={load}/></View>{loading&&<ActivityIndicator color={C.p} />}{items.map(item=><View key={item._id} style={s.card}><View style={s.rowBetween}><Text style={{fontWeight:'700'}}>{item.user?.name||'User'} • {item.kind}</Text><Text style={[s.tag,{backgroundColor:item.status==='sent'?'#dcfce7':item.status==='failed'?'#fee2e2':'#fef3c7'}]}>{item.status.toUpperCase()}</Text></View><Text style={s.muted}>{item.user?.role||'account'} • {fmt(item.createdAt)}</Text><Text style={s.muted}>{item.providerStatus||item.errorCode||'No provider detail'}</Text></View>)}{!loading&&!items.length&&<Text style={s.muted}>No push delivery attempts have been recorded yet.</Text>}</View>;
}


function ReferralCentre({notify}) {
 const [data,setData]=useState(null),[donationSource,setDonationSource]=useState('referral_reward'),[donationAmount,setDonationAmount]=useState(''),[coupons,setCoupons]=useState([]);
 const load=()=>Promise.all([api('/referrals/mine'),api('/donations/coupons')]).then(([r,d])=>{setData(r);setCoupons(d.items||[]);}).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 const share=()=>Share.share({message:'Join Care Associate with my referral code '+(data?.code||'')+'. Enter it during registration.'});
 const donate=async()=>{try{const result=await api('/donations/create','POST',{source:donationSource,amount:Number(donationAmount)});notify('Donation coupon created: '+result.coupon.code);setDonationAmount('');load();}catch(e){notify(e.message,true);}};
 return <View>
  <View style={s.card}><Text style={s.h2}>Referral & rewards</Text><Text style={s.muted}>Share your referral code with a new patient or Care Associate. You receive ₹25 when they register successfully.</Text><Text style={s.sec}>Your referral code</Text><Text style={s.price}>{data?.code||'Loading…'}</Text><Btn title="Share referral code" onPress={share}/><Text style={s.sec}>Your permanent coupon</Text><Text style={s.price}>{data?.permanentCouponCode||'Loading…'}</Text><Text style={s.muted}>Personal coupon commission balance: ₹{Number(data?.couponCommissionBalance||0).toFixed(2)}</Text><Btn kind="alt" title="Refresh rewards" onPress={load}/></View>
  {data&&<View style={s.card}><Text style={s.h3}>Reward balance</Text><Text style={s.price}>₹{Number(data.referralRewardBalance||0).toFixed(2)}</Text><Text style={s.muted}>₹25 is credited for each successful referral registration. This reward is not cash-withdrawable; it can be donated.</Text><Text style={s.muted}>Total referrals: {data.summary.total} • Qualified: {data.summary.qualified}</Text></View>}
  <View style={s.card}><Text style={s.h3}>Donate your balance</Text><Text style={s.muted}>Choose which balance to donate. A donated coupon is created for other users to use.</Text><View style={s.chips}><Chip label="Referral reward" on={donationSource==='referral_reward'} onPress={()=>setDonationSource('referral_reward')}/><Chip label="Coupon commission" on={donationSource==='coupon_commission'} onPress={()=>setDonationSource('coupon_commission')}/></View><Input placeholder="Donation amount (₹)" keyboardType="number-pad" value={donationAmount} onChangeText={setDonationAmount}/><Btn title="Donate & create coupon" disabled={!donationAmount||Number(donationAmount)<=0} onPress={donate}/></View>
  <View style={s.card}><Text style={s.h3}>Community donated coupons</Text>{coupons.map(item=><View key={item._id} style={s.opt}><Text style={{fontWeight:'700'}}>{item.code} • ₹{item.remainingAmount} available</Text><Text style={s.muted}>Donated by {item.donorName} • Original ₹{item.originalAmount}</Text></View>)}{!coupons.length&&<Text style={s.muted}>No donated coupons are available right now.</Text>}</View>
  {(data?.items||[]).map(item=><View key={item._id} style={s.card}><Text style={{fontWeight:'700'}}>{item.referredUser?.name||'New referral'}</Text><Text style={s.muted}>{item.referredUser?.city||''} • {fmt(item.createdAt)}</Text><Text style={s.muted}>Reward credited: ₹{Number(item.rewardAmount||0).toFixed(2)} • {item.status}</Text></View>)}
 </View>;
}
function AdminReferrals({notify}) {
 const [items,setItems]=useState([]),[amounts,setAmounts]=useState({});
 const load=()=>api('/admin/referrals').then(r=>setItems(r.items||[])).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 const update=async(item,body)=>{try{await api('/admin/referrals/'+item._id,'PATCH',body);notify('Referral ledger updated');load();}catch(e){notify(e.message,true);}};
 return <View><View style={s.card}><Text style={s.h2}>Referral & incentive ledger</Text><Text style={s.muted}>Qualify valid referrals, set the approved reward and mark payout only after the transfer is completed.</Text><Btn kind="alt" title="Refresh" onPress={load}/></View>{items.map(item=><View key={item._id} style={s.card}><Text style={{fontWeight:'700'}}>{item.referrer?.name||'Referrer'} → {item.referredUser?.name||'New user'}</Text><Text style={s.muted}>{item.referrer?.phone} • {item.referredUser?.phone} • Code {item.code}</Text><Text style={s.muted}>Status: {item.status} • Payout: {item.payoutStatus} • Reward ₹{Number(item.rewardAmount||0).toFixed(2)}</Text><Input placeholder="Approved reward amount (INR)" keyboardType="decimal-pad" value={amounts[item._id]??String(item.rewardAmount||'')} onChangeText={v=>setAmounts(old=>({...old,[item._id]:v}))}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}><Btn small title="Qualify" onPress={()=>update(item,{status:'qualified',rewardAmount:Number(amounts[item._id]||0),payoutStatus:'pending'})}/><Btn small kind="danger" title="Reject" onPress={()=>update(item,{status:'rejected',payoutStatus:'not_eligible'})}/>{item.status==='qualified'&&item.payoutStatus!=='paid'&&<Btn small kind="alt" title="Mark reward paid" onPress={()=>update(item,{payoutStatus:'paid'})}/>}</View><Input placeholder="Admin note (optional)" value={item.note||''} onChangeText={v=>setItems(old=>old.map(x=>x._id===item._id?{...x,note:v}:x))}/><Btn small kind="alt" title="Save note" onPress={()=>update(item,{note:item.note||''})}/></View>)}{!items.length&&<Text style={s.muted}>No referrals submitted yet.</Text>}</View>;
}


function AdminStaff({notify}) {
 const permissions=['dashboard','users','bookings','finance','reports','support','safety','documents','services','referrals','notifications','staff','diagnostics'];
 const [items,setItems]=useState([]),[form,setForm]=useState({name:'',phone:'',password:''}),[selected,setSelected]=useState(['dashboard','bookings']),[busy,setBusy]=useState(false);
 const load=()=>api('/admin/staff').then(r=>setItems(r.items||[])).catch(e=>notify(e.message,true));
 useEffect(()=>{load();},[]);
 const toggle=p=>setSelected(old=>old.includes(p)?old.filter(x=>x!==p):[...old,p]);
 const create=async()=>{if(!form.name.trim()||!form.phone.trim()||form.password.length<12||!selected.length)return notify('Enter staff details, a 12-character password and at least one permission',true);try{setBusy(true);await api('/admin/staff','POST',{...form,permissions:selected});setForm({name:'',phone:'',password:''});setSelected(['dashboard']);notify('Admin staff account created');load();}catch(e){notify(e.message,true);}finally{setBusy(false);}};
 const save=item=>api('/admin/staff/'+item._id,'PATCH',{permissions:item.adminPermissions}).then(()=>{notify('Permissions updated');load();}).catch(e=>notify(e.message,true));
 return <View><View style={s.card}><Text style={s.h2}>Admin roles & permissions</Text><Text style={s.muted}>Create restricted admin staff accounts. The primary administrator retains full access and controls staff permissions.</Text><Input placeholder="Staff full name" value={form.name} onChangeText={v=>setForm({...form,name:v})}/><Input placeholder="Mobile number" keyboardType="phone-pad" value={form.phone} onChangeText={v=>setForm({...form,phone:v})}/><Input placeholder="Temporary password (min 12 characters)" secureTextEntry value={form.password} onChangeText={v=>setForm({...form,password:v})}/><Text style={s.h3}>Grant access to</Text>{permissions.map(p=><View key={p} style={[s.rowBetween,{paddingVertical:5}]}><Text>{p}</Text><Switch value={selected.includes(p)} onValueChange={()=>toggle(p)} trackColor={{true:C.p}}/></View>)}<Btn title={busy?'Creating…':'Create admin staff'} disabled={busy} onPress={create}/></View><Text style={s.h3}>Existing restricted admins</Text>{items.map(item=><View key={item._id} style={s.card}><Text style={{fontWeight:'700'}}>{item.name}</Text><Text style={s.muted}>{item.phone}</Text><Text style={s.muted}>Permissions: {(item.adminPermissions||[]).join(', ')}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{permissions.map(p=><Btn key={p} small kind={(item.adminPermissions||[]).includes(p)?'primary':'alt'} title={p} onPress={()=>setItems(old=>old.map(x=>x._id===item._id?{...x,adminPermissions:(x.adminPermissions||[]).includes(p)?x.adminPermissions.filter(v=>v!==p):[...(x.adminPermissions||[]),p]}:x))}/>)}</View><Btn kind="alt" title="Save permissions" onPress={()=>save(item)}/></View>)}{!items.length&&<Text style={s.muted}>No restricted admin accounts created yet.</Text>}</View>;
}


function AdminDiagnostics({notify}) {
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true);
 const load=()=>{setLoading(true);api('/admin/client-diagnostics').then(r=>setItems(r.items||[])).catch(e=>notify(e.message,true)).finally(()=>setLoading(false));};
 useEffect(()=>{load();},[]);
 return <View><View style={s.card}><Text style={s.h2}>App crash diagnostics</Text><Text style={s.muted}>Authenticated app render errors, with phone numbers, email addresses and bearer tokens redacted. Records expire after 90 days.</Text><Btn kind="alt" title="Refresh diagnostics" onPress={load}/></View>{loading&&<ActivityIndicator color={C.p} />}{items.map(item=><View key={item._id} style={s.card}><Text style={{fontWeight:'700'}}>{item.user?.name||'User'} • {item.role} • {item.platform}</Text><Text style={s.muted}>Version {item.appVersion||'unknown'} • {fmt(item.createdAt)}</Text><Text style={{color:C.err,marginTop:6}}>{item.message}</Text>{!!item.stack&&<Text selectable style={s.muted}>{item.stack}</Text>}{!!item.componentStack&&<Text selectable style={s.muted}>{item.componentStack}</Text>}</View>)}{!loading&&!items.length&&<Text style={s.muted}>No crash diagnostics have been received.</Text>}</View>;
}

function MenuIcon({ id, active = false, size = 20 }) {
  const paths = {
    queue: 'M5 4h14v16H5z M8 8h8 M8 12h5 M8 16h8',
    report: 'M6 3h8l4 4v14H6z M14 3v5h5 M9 13h6 M9 17h6',
    accompany: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M3 20c.5-4 2.5-6 6-6s5.5 2 6 6 M17 9v6 M14 12h6',
    medicine: 'M8 4a4 4 0 0 0-4 4v8a4 4 0 0 0 8 0V8a4 4 0 0 0-8-4 M8 12h4 M16 8h5 M18.5 5.5v5',
    admission: 'M4 5h16v15H4z M8 9h8 M8 13h8 M8 17h4 M12 2v6 M9 5h6',
    insurance: 'M12 3 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z M8 12l3 3 5-6',
    other: 'M12 5v14 M5 12h14',
    new: 'M12 5v14 M5 12h14',
    mine: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5',
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21c.8-4 3.5-6 8-6s7.2 2 8 6',
    help: 'M12 18h.01 M9.1 9a3 3 0 1 1 5.8 1c-.9 1.2-2.9 1.5-2.9 3.5',
    visit: 'M4 5h16v15H4z M8 3v4 M16 3v4 M4 9h16',
    notifications: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
    family: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M17 11a2.5 2.5 0 1 0 0-5 M3 20c.5-4 2.5-6 6-6s5.5 2 6 6 M15 15c3 0 5 1.5 6 5',
    emergency: 'M12 3 22 21H2z M12 9v5 M12 17h.01',
    safety: 'M12 3 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z M8 12l3 3 5-6',
    documents: 'M6 3h8l4 4v14H6z M14 3v5h5 M9 12h6 M9 16h6',
    jobs: 'M3 8h18v12H3z M8 8V5h8v3 M3 12h18 M10 12v2h4v-2',
    referrals: 'M16 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0 M4 20c.5-4 2.5-6 6-6 M17 14v6 M14 17h6',
    training: 'M3 6l9-3 9 3-9 3z M6 8v7c4 3 8 3 12 0V8 M21 7v8',
    performance: 'M4 19V5 M4 19h17 M7 15l4-4 3 2 6-7',
    cal: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',
    earnings: 'M12 3v18 M17 7c0-2-2-3-5-3S7 5 7 7s2 3 5 4 5 2 5 4-2 4-5 4-5-1-5-3',
    support: 'M4 5h16v12H9l-5 4z M8 10h8 M8 13h5',
    overview: 'M4 4h7v7H4z M14 4h6v4h-6z M14 11h6v9h-6z M4 14h7v6H4z',
    bookings: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5',
    reports: 'M4 19V5 M4 19h17 M7 15l4-4 3 2 6-7',
    services: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M5.6 5.6l2.8 2.8 M15.6 15.6l2.8 2.8 M18.4 5.6l-2.8 2.8 M8.4 15.6l-2.8 2.8 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    delivery: 'M3 6h18v12H3z M3 7l9 7 9-7',
    staff: 'M12 3 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z M9 12h6',
    diagnostics: 'M4 12h4l2-5 4 10 2-5h4',
    users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M3 20c.5-4 2.5-6 6-6s5.5 2 6 6 M17 8h4 M19 6v4',
    finance: 'M3 6h18v13H3z M3 10h18 M7 15h4',
    payouts: 'M12 3v18 M17 7c0-2-2-3-5-3S7 5 7 7s2 3 5 4 5 2 5 4-2 4-5 4-5-1-5-3',
    incidents: 'M12 3 22 21H2z M12 9v5 M12 17h.01',
    audit: 'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',
    login: 'M10 17l5-5-5-5 M15 12H3 M14 3h6v18h-6',
    register: 'M12 5v14 M5 12h14'
  };
  const d = paths[id] || paths.documents;
  const color = active ? '#0f766e' : '#526b68';
  return <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? '#e4f3ef' : '#f3f7f6' }}>
    <Svg width={size} height={size} viewBox="0 0 24 24"><Path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>
  </View>;
}

const TABS = {
  guest: [['new', '➕', 'Book'], ['mine', '📅', 'My bookings'], ['profile', '👤', 'Profile'], ['help', '📞', 'Help'], ['login', '🔑', 'Log in'], ['register', '📝', 'Create account']],
  patient: [['new', '➕', 'Book'], ['mine', '📅', 'My bookings'], ['referrals', '🎁', 'Rewards & Donate'], ['profile', '👤', 'Profile'], ['visit', '🧾', 'Visit'], ['notifications', '🔔', 'Alerts'], ['family', '👨‍👩‍👧', 'Family'], ['emergency', '🆘', 'Urgent'], ['safety', '⚠️', 'Report'], ['documents', '📁', 'Documents'], ['help', '📞', 'Help']],
  helper: [['jobs', '🩺', 'Jobs'], ['mine', '📋', 'My jobs'], ['visit', '🧾', 'Visit'], ['referrals', '🎁', 'Referrals'], ['training', '🎓', 'Training'], ['performance', '⭐', 'Performance'], ['notifications', '🔔', 'Alerts'], ['cal', '📅', 'Calendar'], ['profile', '👤', 'Profile'], ['earnings', '💰', 'Earnings'], ['safety', '⚠️', 'Report'], ['documents', '📁', 'Documents'], ['support', '💬', 'Support']],
  admin: [['overview', '📊', 'Overview'], ['approvals', '🧑‍⚕️', 'Care Associate approvals'], ['bookings', '📋', 'Bookings'], ['profile', '👤', 'Profile'], ['reports', '📈', 'Reports'], ['services', '🛠️', 'Services'], ['referrals', '🎁', 'Referrals'], ['delivery', '📨', 'Push audit'], ['staff', '🛡️', 'Staff access'], ['diagnostics', '🐞', 'Diagnostics'], ['notifications', '🔔', 'Alerts'], ['users', '👥', 'Users'], ['finance', '💳', 'Finance'], ['payouts', '💸', 'Payouts'], ['incidents', '⚠️', 'Incidents'], ['audit', '🧾', 'Audit'], ['documents', '📁', 'Documents'], ['support', '💬', 'Support'], ['emergency', '🆘', 'Urgent']],
};

function AccountDeletion({ user, notify, onDeleted }) {
  const [familyProfiles,setFamilyProfiles]=useState([]);
  const [selectedIds,setSelectedIds]=useState([]);
  const [loading,setLoading]=useState(user?.role==='patient');
  const [loadError,setLoadError]=useState(false);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    if(user?.role!=='patient'){setLoading(false);return ()=>{active=false;};}
    api('/patient/experience').then(data=>{if(active)setFamilyProfiles(data.familyProfiles||[]);})
      .catch(error=>{if(active){setLoadError(true);notify('Could not load family profiles before account deletion: '+error.message,true);}})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[user?.id]);
  const allSelected=familyProfiles.length===0||familyProfiles.every(item=>selectedIds.includes(String(item._id)));
  const toggle=id=>setSelectedIds(old=>old.includes(String(id))?old.filter(x=>x!==String(id)):[...old,String(id)]);
  const beginDelete=()=>{
    if(loading||busy)return;
    if(!allSelected)return notify('Please tick every saved family member. Account deletion removes all family profiles linked to this account.',true);
    const count=familyProfiles.length;
    Alert.alert('Permanently delete account?','This permanently deletes your Care Associate account'+(count?' and all '+count+' selected family profile(s)':'')+'. Private uploaded documents and account-linked personal data will also be removed. Financial and legally required records may be retained in de-identified form.',[
      {text:'No, keep my account',style:'cancel'},
      {text:'Yes, permanently delete',style:'destructive',onPress:async()=>{
        try{setBusy(true);await api('/me/account','DELETE',{confirm:true,familyProfileIds:selectedIds});notify('Your account and selected family data have been deleted.');await onDeleted?.();}
        catch(error){notify(error.message,true);}finally{setBusy(false);}
      }}
    ]);
  };
  return <View style={s.card}>
    <Text style={[s.h3,{color:'#991b1b',marginTop:0}]}>Privacy & account deletion</Text>
    <Text style={s.muted}>We store digital account and care-coordination data needed to provide the service. We retain it while your treatment or care is ongoing; after care ends, we aim to delete or anonymise eligible personal data within 30 days. Some booking, payment, safety or legal records may need to be retained for the period required by law or to resolve disputes. Please keep your own hard copies of prescriptions and reports; app records are not a substitute.</Text>
    {user?.role==='patient'&&<>
      <Text style={{fontWeight:'700',color:'#294a46',marginTop:12}}>Family data linked to this account</Text>
      <Text style={s.muted}>Select each family member whose saved profile should be removed. To permanently delete this account, every linked family profile must be selected so no family data is left behind.</Text>
      {loading?<ActivityIndicator color={C.p} style={{margin:10}}/>:familyProfiles.map(person=>{
        const checked=selectedIds.includes(String(person._id));
        return <TouchableOpacity key={person._id} accessibilityRole="checkbox" accessibilityState={{checked}} onPress={()=>toggle(person._id)} style={{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.line}}>
          <View style={{width:23,height:23,borderRadius:6,borderWidth:1.5,borderColor:checked?C.p:'#9aa9a5',backgroundColor:checked?C.p:'#fff',alignItems:'center',justifyContent:'center',marginRight:10}}>{checked&&<Text style={{color:'#fff',fontWeight:'800'}}>✓</Text>}</View>
          <View style={{flex:1}}><Text style={{fontWeight:'700',color:'#294a46'}}>{person.name}</Text><Text style={s.muted}>{person.relation}{person.age?' • '+person.age+' years':''}</Text></View>
        </TouchableOpacity>;
      })}
      {!loading&&familyProfiles.length===0&&<Text style={s.muted}>No saved family profiles are linked to this account.</Text>}
      {!!familyProfiles.length&&<Text style={{color:allSelected?'#15803d':'#a16207',fontSize:12,marginTop:8}}>{selectedIds.length} of {familyProfiles.length} family profiles selected</Text>}
    </>}
    {loadError&&<Text style={{color:C.err,fontSize:12,marginTop:8}}>Family records could not be loaded. Refresh your profile and try again before deleting.</Text>}
    <Btn kind="danger" title={busy?'Deleting account…':'Delete my account permanently'} disabled={busy||loading||loadError||!allSelected} onPress={beginDelete}/>
    <Text style={{fontSize:11,color:'#8b9693',lineHeight:16,marginTop:5}}>This action cannot be undone. Active bookings, pending refunds or unpaid associate payouts must be resolved first.</Text>
  </View>;
}

function AccountProfile({ user, onDeleted, notify }) {
  const name = user?.name || 'Care Associate member';
  const initials = name.trim().split(/\\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('');
  const roleLabel = user?.role === 'admin' ? 'Administrator' : user?.role === 'helper' ? 'Care Associate' : 'Patient';
  const InfoRow = ({ icon, label, value }) => value ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#edf2f1' }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: '#eff7f5', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <MenuIcon id={icon} size={18} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#7b8d89', fontSize: 11, fontWeight: '600', marginBottom: 3 }}>{label}</Text>
        <Text style={{ color: '#1e3d38', fontSize: 14, lineHeight: 19, fontWeight: '600' }}>{value}</Text>
      </View>
    </View>
  ) : null;
  return (
    <View>
      <Text style={{ color: '#173b37', fontSize: 22, fontWeight: '800', marginBottom: 4 }}>My profile</Text>
      <Text style={{ color: '#71837f', fontSize: 13, marginBottom: 14 }}>Your account details and preferences</Text>
      <View style={{ backgroundColor: '#0d625b', borderRadius: 20, padding: 18, marginBottom: 14, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 62, height: 62, borderRadius: 20, backgroundColor: '#d8f0e9', alignItems: 'center', justifyContent: 'center', marginRight: 14, borderWidth: 2, borderColor: '#ffffff' }}>
            <Text style={{ color: '#0d625b', fontSize: 22, fontWeight: '800' }}>{initials || 'CA'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#ffffff', fontSize: 19, fontWeight: '800' }}>{name}</Text>
            <Text style={{ color: '#c7e7df', fontSize: 12, marginTop: 4 }}>{roleLabel}</Text>
            <View style={{ alignSelf: 'flex-start', marginTop: 8, borderRadius: 20, backgroundColor: user?.verified ? '#d8f5e6' : '#fff3d6', paddingHorizontal: 9, paddingVertical: 4 }}>
              <Text style={{ color: user?.verified ? '#176344' : '#8a5a12', fontSize: 10, fontWeight: '800' }}>{user?.verified ? 'VERIFIED ACCOUNT' : 'ACCOUNT DETAILS'}</Text>
            </View>
          </View>
        </View>
        <Text style={{ color: '#d7eee8', fontSize: 11, marginTop: 16 }}>CARE ASSOCIATE  •  YOUR TRUSTED CARE PARTNER</Text>
      </View>
      <View style={[s.card, { paddingHorizontal: 15, paddingTop: 4 }]}>
        <Text style={{ color: '#244740', fontSize: 15, fontWeight: '800', marginTop: 10, marginBottom: 2 }}>Personal information</Text>
        <InfoRow icon="profile" label="FULL NAME" value={name} />
        <InfoRow icon="support" label="MOBILE NUMBER" value={user?.phone} />
        <InfoRow icon="delivery" label="EMAIL ADDRESS" value={user?.email} />
        <InfoRow icon="overview" label="CITY" value={user?.city} />
        <InfoRow icon="staff" label="ACCOUNT TYPE" value={roleLabel} />
      </View>
      <View style={{ backgroundColor: '#eff7f5', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <MenuIcon id="safety" size={18} />
        <Text style={{ color: '#526b66', fontSize: 12, lineHeight: 18, flex: 1, marginLeft: 10 }}>Keep your contact details up to date so we can coordinate your hospital visits smoothly.</Text>
      </View>
      {user?.role==='patient'&&<AccountDeletion user={user} notify={notify} onDeleted={onDeleted}/>}
      {user?.role==='admin'&&<Text style={s.muted}>Administrator accounts are managed by the primary administrator.</Text>}
    </View>
  );
}

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
  const [serverStatus, setServerStatus] = useState('checking');
  const [servicePage, setServicePage] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const notify = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem('token');
        if (t) { TOKEN = t; const current = await api('/me'); setUser(current); }
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
  const logout = async () => { setMenuOpen(false); try { await stopCareLocationTracking().catch(() => {}); const pushToken = await AsyncStorage.getItem('expoPushToken'); if (pushToken) await api('/push-token', 'DELETE', { expoPushToken: pushToken }).catch(() => {}); } finally { TOKEN = ''; await AsyncStorage.multiRemove(['token', 'expoPushToken']).catch(() => {}); setUser(null); setTab(null); setAuth(null); setPendingBook(false); } };
  const onTab = (id) => {
    setMenuOpen(false);
    setServicePage(null);
    if (id === 'login' || (id === 'profile' && !user)) { setPendingBook(false); openAuth('login'); }
    else if (id === 'register') { setPendingBook(false); openAuth('register'); }
    else setTab(id);
  };

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={s.headerTop}>
          <View style={s.headerBrand}>
            <Logo size={38} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Care Associate</Text>
              <Text style={{ color: '#d1fae5', fontSize: 12 }}>{user ? `${user.name} • ${user.role === 'helper' ? ROLE_NAME : user.role === 'admin' ? 'Admin' : 'Patient'}` : 'Trusted help for every hospital visit'}</Text>
              <Text style={{ color: serverStatus === 'connected' ? '#a7f3d0' : serverStatus === 'checking' ? '#fde68a' : '#fecaca', fontSize: 11, marginTop: 3 }}>
                {serverStatus === 'connected' ? '● Server connected' : serverStatus === 'checking' ? '● Connecting to server…' : serverStatus === 'degraded' ? '● Server responding with an issue' : '● Server offline — check internet'}
              </Text>
            </View>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open navigation menu" onPress={() => setMenuOpen(true)} style={s.hamburgerButton}>
            <Text style={s.hamburgerText}>☰</Text>
          </TouchableOpacity>
        </View>
        {!user && <View style={s.guestAuthRow}>
          <TouchableOpacity accessibilityRole="button" onPress={() => openAuth('login')} style={s.guestAuthButton}><Text style={s.guestAuthText}>Log in</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => openAuth('register')} style={[s.guestAuthButton, s.guestRegisterButton]}><Text style={[s.guestAuthText, { color: '#0b3b37' }]}>Create account</Text></TouchableOpacity>
        </View>}
        {servicePage && <TouchableOpacity onPress={() => setServicePage(null)} style={s.backLink}><Text style={{ color: '#fff', fontWeight: '600' }}>‹ Back</Text></TouchableOpacity>}
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
              {cur === 'visit' && <BookingOperations notify={notify} isAssoc={false} />}
              {cur === 'mine' && (user
                ? <MyBookings notify={notify} tick={cur} onRepeat={(b) => { setRepeatBooking(b); setTab('new'); }} />
                : <LoginPrompt onLogin={() => openAuth('login')} onRegister={() => openAuth('register')} />)}
              {cur === 'family' && <PatientCentre notify={notify} />}
              {cur === 'documents' && role === 'patient' && <DocumentVault notify={notify} />}
              {cur === 'emergency' && <EmergencyCentre notify={notify} />}
              {cur === 'safety' && <IncidentCentre notify={notify} />}
              {cur === 'help' && (user ? <SupportCentre notify={notify} /> : <Help />)}
              {cur === 'support' && role === 'helper' && <SupportCentre notify={notify} />}
            </>
          )}
          {user && cur === 'notifications' && <NotificationCentre notify={notify} />}
          {role === 'helper' && cur === 'visit' && <BookingOperations notify={notify} isAssoc />}
          {['patient','helper'].includes(role) && cur === 'referrals' && <ReferralCentre notify={notify} />}
          {role === 'helper' && cur === 'support' && <SupportCentre notify={notify} />}
          {role === 'helper' && cur === 'documents' && <DocumentVault notify={notify} />}
          {role === 'helper' && !['notifications','support','documents','visit','referrals'].includes(cur) && <Associate user={user} setUser={setUser} notify={notify} tab={cur} onLogout={logout} />}
          {role === 'patient' && cur === 'profile' && <AccountProfile user={user} onDeleted={logout} notify={notify} />}
          {role === 'admin' && cur === 'profile' && <AccountProfile user={user} onDeleted={logout} notify={notify} />}
          {role === 'admin' && cur === 'services' && <AdminServiceCatalogue notify={notify} />}
          {role === 'admin' && cur === 'referrals' && <AdminReferrals notify={notify} />}
          {role === 'admin' && cur === 'delivery' && <AdminDeliveryAudit notify={notify} />}
          {role === 'admin' && cur === 'staff' && <AdminStaff notify={notify} />}
          {role === 'admin' && cur === 'diagnostics' && <AdminDiagnostics notify={notify} />}
          {role === 'admin' && cur === 'support' && <AdminSupport notify={notify} />}
          {role === 'admin' && cur === 'documents' && <AdminDocuments notify={notify} />}
          {role === 'admin' && !['notifications','support','documents','services','delivery','referrals','staff','diagnostics','profile'].includes(cur) && <Admin tab={cur} notify={notify} onNavigate={setTab} />}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {(role === 'helper'
          ? [['jobs', 'Home', 'Home'], ['mine', 'Booking System', 'Booking System'], ['profile', 'Profile', 'Profile']]
          : role === 'admin'
            ? [['overview', 'Home', 'Home'], ['bookings', 'Booking System', 'Booking System'], ['profile', 'Profile', 'Profile']]
            : [['new', 'Home', 'Home'], ['mine', 'Booking System', 'Booking System'], ['profile', 'Profile', 'Profile']]
        ).map(([id, icon, label]) => (
          <TouchableOpacity key={id} accessibilityRole="button" onPress={() => onTab(id)} style={s.bottomNavItem}>
            <MenuIcon id={id} active={cur === id} size={19} />
            <Text style={[s.bottomNavLabel, cur === id && s.bottomNavLabelActive]}>{label}</Text>
            {cur === id && <View style={s.bottomNavIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
      <Modal
        visible={!auth && menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={s.drawerBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setMenuOpen(false)} />
          <View style={[s.drawer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
            <View style={s.drawerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.drawerTitle}>Care Associate</Text>
                <Text style={s.muted}>{user ? user.name + ' • ' + (user.role === 'helper' ? ROLE_NAME : user.role === 'admin' ? 'Admin' : 'Patient') : 'Guest menu'}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setMenuOpen(false)} style={s.drawerClose}>
                <Text style={{ color: C.p, fontSize: 22, fontWeight: '700' }}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 18 }} showsVerticalScrollIndicator={false}>
              {tabs.map(([id, icon, label]) => (
                <TouchableOpacity key={id} accessibilityRole="button" style={[s.drawerItem, cur === id && s.drawerItemActive]} onPress={() => onTab(id)}>
                  <MenuIcon id={id} active={cur === id} />
                  <Text style={[s.drawerLabel, cur === id && { color: C.p, fontWeight: '700' }]}>{label}</Text>
                  {cur === id && <Text style={{ color: C.p, fontWeight: '700' }}>›</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {user && <TouchableOpacity accessibilityRole="button" style={s.drawerLogout} onPress={logout}>
              <Text style={{ color: '#b91c1c', fontWeight: '700' }}>↪  Log out</Text>
            </TouchableOpacity>}
          </View>
        </View>
      </Modal>

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
  componentDidCatch(error, info) { console.error('Care Associate render error:', error, info?.componentStack); if(TOKEN) api('/client-diagnostics','POST',{message:error?.message||'Unexpected app error',stack:error?.stack||'',componentStack:info?.componentStack||'',platform:Platform.OS,appVersion:Constants.expoConfig?.version||''}).catch(()=>{}); }
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
  header: { backgroundColor: '#0b3b37', paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'column', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: '#d8e8e4' },
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  brand: { fontSize: 32, fontWeight: '800', color: C.p, marginTop: 18 },
  tagline: { color: C.mute, marginTop: 6, fontSize: 15, textAlign: 'center' },
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  h3: { fontSize: 17, fontWeight: '700', marginTop: 16, marginBottom: 6 },
  sec: { fontWeight: '700', marginTop: 16, marginBottom: 6, fontSize: 15 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginVertical: 7, borderWidth: 1, borderColor: '#e7efed', elevation: 1, shadowColor: '#123c38', shadowOpacity: 0.045, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  muted: { color: C.mute, fontSize: 13, marginVertical: 2 },
  duty: { color: '#5b21b6', fontSize: 13, marginVertical: 2, fontWeight: '600' },
  dutyBox: { backgroundColor: '#f5f3ff', borderRadius: 10, padding: 10, marginTop: 8 },
  price: { fontSize: 20, fontWeight: '700', color: C.p, marginVertical: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, fontSize: 12, overflow: 'hidden' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#d7e3e0', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10, marginVertical: 5, fontSize: 14, lineHeight: 20, color: '#173b37', backgroundColor: '#fff', minHeight: 44 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 11, marginVertical: 4, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', minHeight: 42 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'auto', marginVertical: 0 },
  btnTxt: { color: '#fff', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  preview: { width: '100%', height: 200, marginVertical: 8, backgroundColor: '#f1f5f9', borderRadius: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  chip: { borderWidth: 2, borderColor: C.line, backgroundColor: '#fff', borderRadius: 99, paddingVertical: 7, paddingHorizontal: 13 },
  chipOn: { borderColor: C.p, backgroundColor: '#ecfdf5' },
  svcGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  svc: { width: '48%', minHeight: 88, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', borderRadius: 13, padding: 11, alignItems: 'center', justifyContent: 'center', gap: 7 },
  serviceLabel: { color: '#294a46', textAlign: 'center', fontSize: 12, lineHeight: 17, fontWeight: '600' },
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
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBrand: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  hamburgerButton: { width: 40, height: 40, borderRadius: 11, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  hamburgerText: { color: '#0b3b37', fontSize: 22, fontWeight: '700' },
  guestAuthRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  guestAuthButton: { minHeight: 34, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: '#b7d8d1', justifyContent: 'center', alignItems: 'center' },
  guestRegisterButton: { backgroundColor: '#ffffff' },
  guestAuthText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  backLink: { alignSelf: 'flex-start', paddingTop: 8, paddingLeft: 48 },
  bottomNav: { flexDirection: 'row', backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#dce8e5', paddingTop: 7, paddingHorizontal: 8, elevation: 16, shadowColor: '#123c38', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: -3 } },
  bottomNavItem: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bottomNavIcon: { color: '#64748b', fontSize: 21, fontWeight: '700' },
  bottomNavIconActive: { color: C.p },
  bottomNavLabel: { color: '#64748b', fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 2 },
  bottomNavLabelActive: { color: C.p, fontWeight: '800' },
  bottomNavIndicator: { position: 'absolute', top: -7, width: 28, height: 3, borderRadius: 3, backgroundColor: C.p },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.42)', flexDirection: 'row', justifyContent: 'flex-end' },
  drawer: { width: 276, maxWidth: '78%', alignSelf: 'stretch', backgroundColor: '#ffffff', paddingHorizontal: 12, elevation: 24, shadowColor: '#0f172a', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: -5, height: 0 } },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line, marginBottom: 8 },
  drawerTitle: { color: '#173b37', fontSize: 17, fontWeight: '800', marginBottom: 2 },
  drawerClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#e8f4f1', alignItems: 'center', justifyContent: 'center' },
  drawerItem: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginVertical: 1, borderRadius: 10, backgroundColor: '#ffffff' },
  drawerItemActive: { backgroundColor: '#e8f4f1' },
  drawerIcon: { width: 34, fontSize: 16 },
  drawerLabel: { flex: 1, color: '#334155', fontSize: 13, lineHeight: 18, fontWeight: '500' },
  drawerLogout: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16, paddingBottom: 6 },
  support: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  authOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, zIndex: 10 },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: '#166534', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 14, zIndex: 20, maxWidth: '92%' },
});
