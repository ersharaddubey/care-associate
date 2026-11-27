// Soft teal + peach theme: minty canvas, white glass-like cards, teal pill actions.
// Drawer = stepped, alternating numbered pills (number tab tucked under a white pill card).
import { StyleSheet } from 'react-native';

const C = {
  p: '#10A39B',          // main teal (buttons, active states)
  pDark: '#0B7F7A',      // deep teal (titles, pressed, toast)
  pSoft: '#E0F5F3',      // light teal tint (chips, tags)
  bg: '#EAF6F4',         // minty canvas
  card: '#FCFFFF',       // card surface
  mute: '#6F8A90',       // secondary text
  err: '#E0554D',        // coral red
  line: '#D9EAE8',       // borders and dividers
  text: '#12303A',       // deep teal ink
  success: '#16A075',
  mint: '#CFEFEA',
  ice: '#F3FAF9',
  lavender: '#FCE8DF',   // name kept so old code works; value is now soft peach
  peach: '#F6B8A1',      // warm accent
  peachSoft: '#FDE9E0',
};

// Drawer step colours, in order (image 2): light blue, blue, teal, dark teal, soft teal. Repeats after 5.
const stepColors = ['#6EC1E4', '#2E7DB5', '#0E8A85', '#1B5C73', '#8BBFBF'];

// For expo-linear-gradient (optional): <LinearGradient colors={gradients.screen} style={{ flex: 1 }} />
const gradients = {
  screen: ['#D6F1EE', '#F2F8F6', '#FDE6DC'],
  hero: ['#18B5AC', '#0B7F7A'],
};

const glass = {
  backgroundColor: C.card,
  borderWidth: 1,
  borderColor: '#FFFFFF',
  shadowColor: '#2A6F72',
  shadowOpacity: 0.09,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
    flexDirection: 'column',
    alignItems: 'stretch',
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    borderBottomWidth: 1,
    borderColor: C.line,
    shadowColor: '#2A6F72',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  brand: { fontSize: 30, fontWeight: '800', color: C.pDark, marginTop: 18, letterSpacing: -0.5 },
  tagline: { color: C.mute, marginTop: 6, fontSize: 15, textAlign: 'center' },
  h2: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 10, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 8 },
  sec: { fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 8, fontSize: 15 },
  card: { ...glass, borderRadius: 24, padding: 16, marginVertical: 8 },
  muted: { color: C.mute, fontSize: 13, marginVertical: 2, lineHeight: 18 },
  duty: { color: '#2F6F73', fontSize: 13, marginVertical: 2, fontWeight: '600' },
  dutyBox: { backgroundColor: '#EAF7F5', borderRadius: 16, padding: 12, marginTop: 8, borderWidth: 1, borderColor: C.line },
  price: { fontSize: 22, fontWeight: '800', color: C.pDark, marginVertical: 4, letterSpacing: -0.3 },
  tag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, fontSize: 12, overflow: 'hidden', backgroundColor: C.pSoft, color: C.pDark, fontWeight: '700' },
  tagWarm: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, fontSize: 12, overflow: 'hidden', backgroundColor: C.peachSoft, color: '#B5543C', fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    borderWidth: 1, borderColor: '#D3E6E4', borderRadius: 16, paddingHorizontal: 15,
    paddingVertical: 13, marginVertical: 6, fontSize: 14, lineHeight: 20, color: C.text,
    backgroundColor: '#FFFFFF', minHeight: 50,
  },
  btn: {
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: 99, marginVertical: 6,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', minHeight: 52,
    backgroundColor: C.p, borderWidth: 1, borderColor: C.p,
    shadowColor: C.pDark, shadowOpacity: 0.22, shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  btnSmall: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 99, alignSelf: 'auto', marginVertical: 0, minHeight: 40 },
  btnTxt: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 0.2 },
  preview: { width: '100%', height: 200, marginVertical: 8, backgroundColor: '#F1F8F7', borderRadius: 18, borderWidth: 1, borderColor: C.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FFFFFF', borderRadius: 99, paddingVertical: 9, paddingHorizontal: 16 },
  chipOn: { borderWidth: 1, borderColor: C.p, backgroundColor: C.p },
  chipOnText: { color: '#FFFFFF', fontWeight: '700' },
  svcGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  svc: {
    width: '47%', minHeight: 104, borderWidth: 1, borderColor: '#FFFFFF', backgroundColor: C.card,
    borderRadius: 22, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8,
    elevation: 2, shadowColor: '#2A6F72', shadowOpacity: 0.08, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  serviceLabel: { color: C.text, textAlign: 'center', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  opt: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, marginVertical: 4, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: { width: '14.28%', textAlign: 'center', color: C.mute, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 4 },
  day: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayToday: { backgroundColor: C.pSoft },
  dayLeave: { backgroundColor: '#FDECEA' },
  daySel: { backgroundColor: C.p, borderRadius: 12 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.p, marginTop: 2 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBrand: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  hamburgerButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: C.pSoft, borderWidth: 1, borderColor: '#CBEBE7', alignItems: 'center', justifyContent: 'center' },
  hamburgerText: { color: C.pDark, fontSize: 20, fontWeight: '700' },
  guestAuthRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  guestAuthButton: { flex: 1, paddingVertical: 11, borderRadius: 99, backgroundColor: C.pSoft, borderWidth: 1, borderColor: '#CBEBE7', alignItems: 'center' },
  guestRegisterButton: { backgroundColor: C.p, borderColor: C.p },
  guestAuthText: { color: C.pDark, fontWeight: '700', fontSize: 13 },
  backLink: { alignSelf: 'flex-start', paddingTop: 8, paddingLeft: 8 },

  // Bottom navigation (rounded top, optional centre round button)
  bottomNav: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: C.line,
    paddingTop: 10, paddingBottom: 4, paddingHorizontal: 10, borderTopLeftRadius: 26,
    borderTopRightRadius: 26, elevation: 12, shadowColor: '#2A6F72', shadowOpacity: 0.1,
    shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
  },
  bottomNavItem: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', position: 'relative', borderRadius: 16 },
  bottomNavIcon: { color: '#8FA6AB', fontSize: 20, fontWeight: '700' },
  bottomNavIconActive: { color: C.p },
  bottomNavLabel: { color: '#8FA6AB', fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 3 },
  bottomNavLabelActive: { color: C.pDark, fontWeight: '800' },
  bottomNavIndicator: { position: 'absolute', top: -2, width: 22, height: 4, borderRadius: 99, backgroundColor: C.p },
  bottomNavFab: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: C.p, alignItems: 'center', justifyContent: 'center',
    marginTop: -26, borderWidth: 4, borderColor: '#FFFFFF',
    shadowColor: C.pDark, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },

  // Drawer (image 2): light grey page, alternating numbered pills
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(11,48,52,0.36)' },
  drawer: {
    width: '100%', maxWidth: '100%', flex: 1, alignSelf: 'stretch', backgroundColor: '#F7F8F8',
    borderWidth: 0, paddingHorizontal: 18, paddingTop: 8, borderRadius: 0,
    elevation: 24, shadowColor: '#0B3034', shadowOpacity: 0.18, shadowRadius: 22,
    shadowOffset: { width: -7, height: 0 },
  },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.line, marginBottom: 18, marginTop: 8 },
  drawerTitle: { color: '#4A4F55', fontSize: 22, fontWeight: '900', marginBottom: 3, marginTop: 0, textAlign: 'left' },
  drawerClose: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.pSoft, alignItems: 'center', justifyContent: 'center' },
  // Odd steps (1,3,5): card on left, number tab on right (use with drawerStepReverse)
  // Even steps (2,4): number tab on left, card on right. Rows are staggered like the reference.
  drawerStep: { minHeight: 76, width: '90%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  drawerStepReverse: { flexDirection: 'row-reverse', alignSelf: 'flex-end' },
  drawerStepActive: { transform: [{ scale: 1.02 }] },
  drawerStepNumber: {
    width: 84, height: 70, borderTopLeftRadius: 35, borderBottomLeftRadius: 35, borderTopRightRadius: 12, borderBottomRightRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: -30, zIndex: 0, backgroundColor: C.p,
  },
  drawerStepNumberAlt: {
    borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderTopRightRadius: 35, borderBottomRightRadius: 35,
    marginRight: 0, marginLeft: -30,
  },
  drawerStepNumberActive: { backgroundColor: C.pDark },
  drawerStepNumberText: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', paddingLeft: 12 },
  drawerStepNumberTextAlt: { paddingLeft: 0, paddingRight: 12 },
  drawerStepCard: {
    flex: 1, minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingLeft: 24,
    borderRadius: 35, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#F2F4F4', zIndex: 2,
    shadowColor: '#243B3F', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 5,
  },
  drawerStepLine: { height: 2, width: '70%', alignSelf: 'center', backgroundColor: C.p, opacity: 0.55, marginBottom: 2 },
  drawerStepArrow: { color: C.pDark, fontSize: 24, fontWeight: '700', marginLeft: 8 },
  drawerIcon: { width: 36, fontSize: 16 },
  drawerLabel: { flex: 1, color: '#555B61', fontSize: 15, lineHeight: 20, fontWeight: '600', marginLeft: 10 },
  drawerLogout: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 18, paddingBottom: 16, marginTop: 12 },

  support: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line, borderRadius: 22 },
  authOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(234,246,244,0.98)', zIndex: 10 },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: C.pDark, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 99, zIndex: 20, maxWidth: '92%', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});

export { C, s, stepColors, gradients };
