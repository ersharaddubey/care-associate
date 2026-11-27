const mongoose = require('mongoose');
const { User } = require('./models');

const MODULES = [
  {
    id: 'role-boundaries',
    title: 'Role boundaries and non-clinical care',
    duration: '5 min',
    summary: 'Understand what a Care Associate may and may not do.',
    lessons: [
      'Care Associates provide non-clinical assistance such as navigation, queue support, document coordination and family updates.',
      'Never diagnose, interpret reports, recommend treatment, administer medicines or perform clinical procedures.',
      'If a patient asks for medical advice, direct them to the treating healthcare professional.',
      'Do not promise clinical outcomes or represent yourself as hospital staff.',
    ],
    questions: [
      { q: 'A patient asks you to interpret a test report. What should you do?', options: ['Explain what the values mean', 'Ask the treating clinician to explain it', 'Search online and advise'], answer: 1 },
      { q: 'Which task is within the Care Associate role?', options: ['Help locate the registration counter', 'Change a prescribed dose', 'Diagnose symptoms'], answer: 0 },
      { q: 'A patient asks you to administer a prescription medicine. What is the safe response?', options: ['Give it if the patient insists', 'Do not administer it; refer to qualified clinical staff', 'Choose a dose yourself'], answer: 1 },
      { q: 'Can a Care Associate promise a medical outcome?', options: ['Yes, to reassure the patient', 'Only if the family agrees', 'No, never promise clinical outcomes'], answer: 2 },
      { q: 'Who should explain a diagnosis or treatment plan?', options: ['The treating healthcare professional', 'The Care Associate', 'Any hospital visitor'], answer: 0 },
    ],
  },
  {
    id: 'privacy-consent',
    title: 'Patient privacy and consent',
    duration: '6 min',
    summary: 'Protect personal information, documents and patient dignity.',
    lessons: [
      'Access only the information needed to perform the assigned task.',
      'Do not photograph, copy, forward or discuss patient records without explicit permission and a legitimate task need.',
      'Never ask for or share passwords, OTPs, UPI PINs or banking credentials.',
      'Keep conversations discreet and confirm the patient or authorised family contact before sharing updates.',
    ],
    questions: [
      { q: 'A visitor asks for a patient’s phone number. What should you do?', options: ['Share it if they seem familiar', 'Do not disclose it without authorisation', 'Post it in the group chat'], answer: 1 },
      { q: 'When may you access a patient document?', options: ['Whenever you are curious', 'Only when needed for the assigned task and authorised', 'To keep a personal copy'], answer: 1 },
      { q: 'A caller asks for an OTP to confirm a booking. What should you do?', options: ['Share the OTP', 'Ask for their UPI PIN too', 'Never share OTPs or credentials'], answer: 2 },
      { q: 'How should patient updates be shared?', options: ['Only with the patient or authorised contact', 'With any person at the hospital', 'On public social media'], answer: 0 },
      { q: 'You find a patient document left behind. What is best?', options: ['Take a photo for later', 'Secure it and return it through the authorised hospital/patient process', 'Leave it visible'], answer: 1 },
    ],
  },
  {
    id: 'communication-handover',
    title: 'Communication and handover',
    duration: '5 min',
    summary: 'Give clear updates and close every task responsibly.',
    lessons: [
      'Confirm the task, location, timing and authorised contact before starting.',
      'Share concise factual updates; do not guess or make promises about waiting times.',
      'If instructions are unclear, pause and ask the patient or authorised contact to clarify.',
      'At handover, confirm what was completed, what remains and who received any documents or items.',
    ],
    questions: [
      { q: 'Instructions are unclear. What should you do?', options: ['Guess and continue', 'Pause and ask for clarification', 'Ask another patient to decide'], answer: 1 },
      { q: 'What makes a good status update?', options: ['A factual, concise update', 'A guaranteed completion time you cannot verify', 'Private patient details in a public group'], answer: 0 },
      { q: 'What should a handover include?', options: ['Only say goodbye', 'Confirm completed work, pending work and recipient', 'Keep documents without telling anyone'], answer: 1 },
      { q: 'A delay occurs. What should you do?', options: ['Hide it', 'Send a factual update to the authorised contact', 'Blame the hospital without evidence'], answer: 1 },
      { q: 'When should you mark a task complete?', options: ['Before starting', 'After the agreed work and handover are complete', 'Whenever the app is slow'], answer: 1 },
    ],
  },
  {
    id: 'safety-escalation',
    title: 'Safety and emergency escalation',
    duration: '6 min',
    summary: 'Recognise when to stop and escalate rather than attempting clinical help.',
    lessons: [
      'If immediate danger or a medical emergency occurs in India, call 112 and alert hospital clinical staff.',
      'Care Associate is not an ambulance, emergency dispatch or clinical response service.',
      'Do not move an injured or unwell person unless directed by qualified responders or required to avoid immediate danger.',
      'Report safety incidents through the app and notify the authorised contact when safe to do so.',
    ],
    questions: [
      { q: 'A patient suddenly collapses. What is the priority?', options: ['Attempt a medical procedure', 'Alert hospital clinical staff and call 112 for immediate danger', 'Wait until the booking ends'], answer: 1 },
      { q: 'Is Care Associate an ambulance service?', options: ['Yes', 'No', 'Only at night'], answer: 1 },
      { q: 'A situation feels unsafe. What should you do?', options: ['Continue to avoid delay', 'Move to safety and escalate to the appropriate authority', 'Confront everyone'], answer: 1 },
      { q: 'Should you attempt a clinical procedure without qualification?', options: ['No', 'Yes, if asked by a visitor', 'Only if the app is offline'], answer: 0 },
      { q: 'When should an incident be reported?', options: ['Only if someone posts online', 'Promptly through the appropriate safety/reporting channel', 'Never'], answer: 1 },
    ],
  },
  {
    id: 'digital-location-safety',
    title: 'Digital and location safety',
    duration: '4 min',
    summary: 'Use app tools responsibly and keep location sharing limited to active duty.',
    lessons: [
      'Use only your own account and keep your login credentials private.',
      'Location sharing is for the assigned booking and must stop when duty ends.',
      'Do not share screenshots containing patient details, addresses or booking identifiers.',
      'Report suspicious messages, account access or payment requests through the official support channel.',
    ],
    questions: [
      { q: 'When should live location be shared?', options: ['Continuously with everyone', 'Only for the assigned active-duty booking with consent', 'On social media'], answer: 1 },
      { q: 'What should you do with your password?', options: ['Share it with a colleague', 'Keep it private and secure', 'Use the patient’s password'], answer: 1 },
      { q: 'A stranger asks for a screenshot of a booking. What should you do?', options: ['Send it', 'Do not disclose booking or patient information', 'Post it publicly'], answer: 1 },
      { q: 'When should location sharing stop?', options: ['When assigned duty ends', 'Only after a week', 'Never'], answer: 0 },
      { q: 'You notice suspicious account activity. What should you do?', options: ['Ignore it', 'Report it through official support and secure your account', 'Share your OTP with the caller'], answer: 1 },
    ],
  },
];

function publicModule(module) {
  return {
    id: module.id,
    title: module.title,
    duration: module.duration,
    summary: module.summary,
    lessons: module.lessons,
    questions: module.questions.map(({ q, options }) => ({ q, options })),
  };
}

function mountTrainingRoutes(app, auth) {
  app.get('/api/helper/training', auth('helper'), async (req, res) => {
    const progress = req.user.trainingProgress || [];
    res.json({
      modules: MODULES.map(module => ({
        ...publicModule(module),
        progress: progress.find(item => item.moduleId === module.id) || null,
      })),
      completed: progress.filter(item => item.passed).length,
      total: MODULES.length,
    });
  });

  app.post('/api/helper/training/:moduleId/complete', auth('helper'), async (req, res) => {
    const module = MODULES.find(item => item.id === req.params.moduleId);
    if (!module) return res.status(404).json({ error: 'Training module not found' });
    const answers = req.body.answers;
    if (!Array.isArray(answers) || answers.length !== module.questions.length || answers.some(value => !Number.isInteger(value) || value < 0 || value > 2)) {
      return res.status(400).json({ error: 'Please answer every question before submitting' });
    }
    const correct = answers.reduce((total, answer, index) => total + (answer === module.questions[index].answer ? 1 : 0), 0);
    const score = Math.round(correct / module.questions.length * 100);
    const passed = score >= 80;
    const existing = req.user.trainingProgress.find(item => item.moduleId === module.id);
    const wasPassed = !!existing?.passed;
    const progress = {
      moduleId: module.id,
      score: wasPassed ? existing.score : score,
      passed: passed || wasPassed,
      completedAt: wasPassed ? existing.completedAt : passed ? new Date() : undefined,
      attempts: (existing?.attempts || 0) + 1,
      lastAttemptAt: new Date(),
    };
    if (existing) Object.assign(existing, progress);
    else req.user.trainingProgress.push(progress);
    await req.user.save();
    res.json({ moduleId: module.id, score, passed, progress: req.user.trainingProgress, message: passed ? 'Module completed' : 'You need at least 80% to pass. Review the lessons and try again.' });
  });
}

module.exports = { MODULES, publicModule, mountTrainingRoutes };
