// Medical blue theme (healthcare app UI kit): clean white cards, deep medical blue actions,
// pale blue tints, soft cream + blush accents. Drawer = stepped numbered pills (steps reference).
import { StyleSheet } from 'react-native';

const C = {
  p: '#1A66B8',          // main medical blue (buttons, active states, hero cards)
  pDark: '#0F4C8A',      // deep blue (titles, pressed, toast)
  pSoft: '#E6F0FB',      // pale blue tint (chips, tags, icon tiles)
  bg: '#EEF3F9',         // app canvas
  card: '#FFFFFF',       // card surface
  mute: '#5B6B80',       // secondary text
  err: '#E0554D',        // alert red
  line: '#DCE5F0',       // borders and dividers
  text: '#14233A',       // primary ink
  success: '#16A075',
  mint: '#E1F4EF',
  ice: '#F3F7FC',        // input / search field fill
  lavender: '#F7E3E8',   // name kept so old code works; value is now soft blush pink
  peach: '#E8A70F',      // warm accent (amber)
  peachSoft: '#FBF0DA',  // cream tile
  amber: '#E8A70F',
  amberSoft: '#FDF1D6',
  blush: '#F7E3E8',
};

// Drawer step colours, in order: light blue, blue, teal, dark teal, soft teal. Repeats after 5.
const stepColors = ['#2F7FC1', '#1F64A8', '#12808C', '#2A6A9E', '#3580B5'];

// For expo-linear-gradient (optional)
const gradients = {
  screen: ['#E6F0FB', '#F4F8FC', '#FFFFFF'],
  hero: ['#2A77C0', '#0F4C8A'],
};

const shadow = {
  shadowColor: '#14233A',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 5 },
  elevation: 2,
};

const glass = {
  backgroundColor: C.card,
  borderWidth: 1,
  borderColor: '#DCE5F0',
  ...shadow,
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
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderColor: C.line,
    ...shadow,
    elevation: 3,
  },
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  brand: { fontSize: 30, fontWeight: '800', color: C.pDark, marginTop: 18, letterSpacing: -0.5 },
  tagline: { color: C.mute, marginTop: 6, fontSize: 15, textAlign: 'center' },
  h2: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 10, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 8 },
  sec: { fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 8, fontSize: 15 },
  card: { ...glass, borderRadius: 20, padding: 16, marginVertical: 8 },
  muted: { color: C.mute, fontSize: 13, marginVertical: 2, lineHeight: 18 },
  duty: { color: C.pDark, fontSize: 13, marginVertical: 2, fontWeight: '600' },
  dutyBox: { backgroundColor: C.pSoft, borderRadius: 14, padding: 12, marginTop: 8, borderWidth: 1, borderColor: C.line },
  price: { fontSize: 22, fontWeight: '800', color: C.pDark, marginVertical: 4, letterSpacing: -0.3 },
  tag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, fontSize: 12, overflow: 'hidden', backgroundColor: C.pSoft, color: C.pDark, fontWeight: '700' },
  tagWarm: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, fontSize: 12, overflow: 'hidden', backgroundColor: C.amberSoft, color: '#8A5A00', fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 15,
    paddingVertical: 13, marginVertical: 6, fontSize: 14, lineHeight: 20, color: C.text,
    backgroundColor: C.ice, minHeight: 50,
  },
  btn: {
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, marginVertical: 6,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', minHeight: 52,
    backgroundColor: C.p, borderWidth: 1, borderColor: C.p,
    shadowColor: C.p, shadowOpacity: 0.2, shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }, elevation: 3,
  },
  btnSmall: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, alignSelf: 'auto', marginVertical: 0, minHeight: 40 },
  btnTxt: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '700', letterSpacing: 0.2 },
  preview: { width: '100%', height: 200, marginVertical: 8, backgroundColor: C.ice, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  chip: { borderWidth: 1, borderColor: C.line, backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16 },
  chipOn: { borderWidth: 1, borderColor: C.p, backgroundColor: C.p },
  chipOnText: { color: '#FFFFFF', fontWeight: '700' },
  svcGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  svc: {
    width: '47%', minHeight: 104, borderWidth: 1, borderColor: '#DCE5F0', backgroundColor: C.card,
    borderRadius: 20, padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8,
    ...shadow, shadowOpacity: 0.07,
  },
  svcOn: { backgroundColor: C.pSoft, borderColor: C.p, borderWidth: 1.5 },
  serviceLabel: { color: C.text, textAlign: 'center', fontSize: 12, lineHeight: 17, fontWeight: '700' },
  opt: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, marginVertical: 4, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line },
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
  hamburgerButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.pSoft, borderWidth: 1, borderColor: '#C9DDF3', alignItems: 'center', justifyContent: 'center' },
  hamburgerText: { color: C.pDark, fontSize: 20, fontWeight: '700' },
  guestAuthRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  guestAuthButton: { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: C.pSoft, borderWidth: 1, borderColor: '#C9DDF3', alignItems: 'center' },
  guestRegisterButton: { backgroundColor: C.p, borderColor: C.p },
  guestAuthText: { color: C.pDark, fontWeight: '700', fontSize: 13 },
  backLink: { alignSelf: 'flex-start', paddingTop: 8, paddingLeft: 8 },

  // Bottom navigation: white bar, rounded top, blue active icon + label
  bottomNav: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: C.line,
    paddingTop: 10, paddingBottom: 4, paddingHorizontal: 10, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, elevation: 12, shadowColor: C.p, shadowOpacity: 0.1,
    shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
  },
  bottomNavItem: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', position: 'relative', borderRadius: 16 },
  bottomNavIcon: { color: '#6B7A90', fontSize: 20, fontWeight: '700' },
  bottomNavIconActive: { color: C.p },
  bottomNavLabel: { color: '#6B7A90', fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 3 },
  bottomNavLabelActive: { color: C.p, fontWeight: '800' },
  bottomNavIndicator: { position: 'absolute', top: -2, width: 22, height: 4, borderRadius: 99, backgroundColor: C.p },
  bottomNavFab: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: C.p, alignItems: 'center', justifyContent: 'center',
    marginTop: -26, borderWidth: 4, borderColor: '#FFFFFF',
    shadowColor: C.p, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },

  // Drawer: light grey page, alternating numbered pills (steps reference)
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(22,50,86,0.38)' },
  drawer: {
    width: '100%', maxWidth: '100%', flex: 1, alignSelf: 'stretch', backgroundColor: '#F4F7FB',
    borderWidth: 0, paddingHorizontal: 18, paddingTop: 8, borderRadius: 0,
    elevation: 24, shadowColor: '#10243D', shadowOpacity: 0.18, shadowRadius: 22,
    shadowOffset: { width: -7, height: 0 },
  },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.line, marginBottom: 18, marginTop: 8 },
  drawerTitle: { color: '#14233A', fontSize: 22, fontWeight: '900', marginBottom: 3, marginTop: 0, textAlign: 'left' },
  drawerClose: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.pSoft, alignItems: 'center', justifyContent: 'center' },
  drawerStep: { minHeight: 76, width: '90%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  drawerStepReverse: { flexDirection: 'row-reverse', alignSelf: 'flex-end' },
  drawerStepActive: { transform: [{ scale: 1.02 }] },
  drawerStepNumber: {
    width: 96, height: 70, borderTopLeftRadius: 35, borderBottomLeftRadius: 35, borderTopRightRadius: 12, borderBottomRightRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: -30, zIndex: 0, backgroundColor: C.p, overflow: 'hidden',
  },
  drawerStepNumberAlt: {
    borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderTopRightRadius: 35, borderBottomRightRadius: 35,
    marginRight: 0, marginLeft: -30,
  },
  drawerStepNumberActive: { backgroundColor: C.pDark },
  drawerStepNumberText: { color: '#FFFFFF', fontSize: 28, lineHeight: 34, fontWeight: '800', paddingRight: 30, includeFontPadding: false },
  drawerStepNumberTextAlt: { paddingRight: 0, paddingLeft: 30 },
  drawerStepCard: {
    flex: 1, minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingLeft: 24,
    borderRadius: 35, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#E9EEF5', zIndex: 2,
    shadowColor: '#243B4F', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 5,
  },
  drawerStepLine: { height: 2, width: '70%', alignSelf: 'center', backgroundColor: C.p, opacity: 0.55, marginBottom: 2 },
  drawerStepArrow: { color: C.pDark, fontSize: 24, fontWeight: '700', marginLeft: 8 },
  drawerIcon: { width: 36, fontSize: 16 },
  drawerLabel: { flex: 1, color: '#22344F', fontSize: 15, lineHeight: 20, fontWeight: '600', marginLeft: 10 },
  drawerLogout: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 18, paddingBottom: 16, marginTop: 12 },

  support: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line, borderRadius: 20 },
  authOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(238,243,249,0.98)', zIndex: 10 },
  toast: { position: 'absolute', alignSelf: 'center', backgroundColor: C.pDark, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, zIndex: 20, maxWidth: '92%', shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});

export { C, s, stepColors, gradients };
