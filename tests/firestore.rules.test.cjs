const fs = require('node:fs');
const path = require('node:path');
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const { deleteDoc, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

const projectId = 'marbslf-rules-test';
const verificationId = 'VER-test-1';
const completedMeetupId = 'MT-private-1';
let testEnv;

const image = 'data:image/jpeg;base64,ZmFrZS1pbWFnZS1mb3ItdGVzdA==';
const pendingVerification = (userId) => ({
  verification_id: verificationId,
  user_id: userId,
  full_legal_name: 'Test Citizen',
  id_type: 'National ID',
  id_image: image,
  selfie_image: image,
  camera_verified: true,
  selfie_camera_verified: true,
  consented_to_visual_comparison: true,
  consented_at: new Date().toISOString(),
  status: 'PENDING',
  submitted_at: new Date().toISOString(),
  reviewed_by: '',
  reviewed_at: ''
});

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'owner-1'), {
      user_id: 'owner-1', role: 'USER', verification_status: 'UNVERIFIED', points_balance: 50
    });
    await setDoc(doc(context.firestore(), 'id_verifications', verificationId), pendingVerification('owner-1'));
    await setDoc(doc(context.firestore(), 'meetups', completedMeetupId), {
      meetup_id: completedMeetupId,
      owner_id: 'owner-1',
      finder_id: 'finder-2',
      status: 'COMPLETED',
      owner_confirmed_return: true,
      finder_confirmed_return: true,
      place_name: 'Private pickup location',
      time: '9:30 PM'
    });
    await setDoc(doc(context.firestore(), 'messages', 'MSG-test-123456'), {
      message_id: 'MSG-test-123456',
      sender_id: 'finder-2',
      receiver_id: 'owner-1',
      post_id: 'POST-test-1',
      message: 'This is the test message being reported.',
      timestamp: new Date().toISOString(),
      status: 'SENT'
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('owner can read their own verification, but another citizen cannot', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-1').firestore();
  const strangerDb = testEnv.authenticatedContext('stranger-2').firestore();
  await assertSucceeds(getDoc(doc(ownerDb, 'id_verifications', verificationId)));
  await assertFails(getDoc(doc(strangerDb, 'id_verifications', verificationId)));
});

test('citizen can submit a pending record only for their own UID', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-1').firestore();
  const otherDb = testEnv.authenticatedContext('stranger-2').firestore();
  await assertSucceeds(setDoc(doc(ownerDb, 'id_verifications', 'VER-new'), {
    ...pendingVerification('owner-1'), verification_id: 'VER-new'
  }));
  await assertFails(setDoc(doc(otherDb, 'id_verifications', 'VER-forged'), {
    ...pendingVerification('owner-1'), verification_id: 'VER-forged'
  }));
});

test('citizen cannot approve, edit, or delete their submission', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-1').firestore();
  await assertFails(updateDoc(doc(ownerDb, 'id_verifications', verificationId), { status: 'VERIFIED' }));
  await assertFails(updateDoc(doc(ownerDb, 'id_verifications', verificationId), { selfie_image: image }));
  await assertFails(deleteDoc(doc(ownerDb, 'id_verifications', verificationId)));
});

test('admin claim can review status, but cannot replace submitted images', async () => {
  const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
  await assertSucceeds(updateDoc(doc(adminDb, 'id_verifications', verificationId), {
    status: 'VERIFIED', reviewed_by: 'admin-1', reviewed_at: new Date().toISOString()
  }));
  await assertFails(updateDoc(doc(adminDb, 'id_verifications', verificationId), {
    selfie_image: 'data:image/jpeg;base64,bmV3LXNlbGZpZQ=='
  }));
});

test('only an admin can redact ID and selfie images after a final review', async () => {
  const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
  const ownerDb = testEnv.authenticatedContext('owner-1').firestore();
  await assertFails(updateDoc(doc(adminDb, 'id_verifications', verificationId), {
    id_image: '', selfie_image: '', images_deleted_at: new Date().toISOString()
  }));
  await updateDoc(doc(adminDb, 'id_verifications', verificationId), {
    status: 'VERIFIED', reviewed_by: 'admin-1', reviewed_at: new Date().toISOString()
  });
  await assertSucceeds(updateDoc(doc(adminDb, 'id_verifications', verificationId), {
    id_image: '', selfie_image: '', images_deleted_at: new Date().toISOString()
  }));
  await assertFails(updateDoc(doc(ownerDb, 'id_verifications', verificationId), {
    id_image: '', selfie_image: '', images_deleted_at: new Date().toISOString()
  }));
});

test('abuse reports are private to the reporter and admins, and only admins resolve them', async () => {
  const reporterDb = testEnv.authenticatedContext('owner-1').firestore();
  const strangerDb = testEnv.authenticatedContext('stranger-2').firestore();
  const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
  const report = {
    report_id: 'REP-test-1234567',
    reporter_id: 'owner-1',
    reported_user_id: 'finder-2',
    reported_post_id: 'POST-test-1',
    reported_message_id: '',
    target_type: 'POST',
    target_id: 'POST-test-1',
    reason: 'Scam',
    details: 'This post asks people to pay an advance fee.',
    status: 'UNDER_REVIEW',
    admin_action: 'Pending administrator inspection',
    created_at: new Date().toISOString()
  };
  await assertSucceeds(setDoc(doc(reporterDb, 'reports', report.report_id), report));
  await assertSucceeds(getDoc(doc(reporterDb, 'reports', report.report_id)));
  await assertFails(getDoc(doc(strangerDb, 'reports', report.report_id)));
  await assertFails(updateDoc(doc(reporterDb, 'reports', report.report_id), { status: 'RESOLVED' }));
  await assertSucceeds(updateDoc(doc(adminDb, 'reports', report.report_id), {
    status: 'RESOLVED',
    admin_action: 'Investigated and resolved by moderator',
    resolved_at: new Date().toISOString()
  }));
  const messageReport = {
    ...report,
    report_id: 'REP-message-1234567',
    reported_user_id: 'finder-2',
    reported_post_id: 'POST-test-1',
    reported_message_id: 'MSG-test-123456',
    target_type: 'MESSAGE',
    target_id: 'MSG-test-123456'
  };
  await assertSucceeds(setDoc(doc(reporterDb, 'reports', messageReport.report_id), messageReport));
  await assertFails(setDoc(doc(reporterDb, 'reports', 'REP-message-self-123456'), {
    ...messageReport,
    report_id: 'REP-message-self-123456',
    reported_user_id: 'owner-1'
  }));
});

test('audit logs are private, admin-authored, and append-only', async () => {
  const citizenDb = testEnv.authenticatedContext('owner-1').firestore();
  const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
  const log = {
    log_id: 'LOG-test-123456789',
    admin_id: 'admin-1',
    action_type: 'REPORT_RESOLVED',
    description: 'Resolved a test abuse report.',
    timestamp: new Date().toISOString()
  };
  await assertFails(setDoc(doc(citizenDb, 'audit_logs', log.log_id), log));
  await assertSucceeds(setDoc(doc(adminDb, 'audit_logs', log.log_id), log));
  await assertFails(getDoc(doc(citizenDb, 'audit_logs', log.log_id)));
  await assertFails(updateDoc(doc(adminDb, 'audit_logs', log.log_id), { description: 'Changed later' }));
});

test('citizen cannot change their Firebase profile verification status or role', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-1').firestore();
  await assertFails(updateDoc(doc(ownerDb, 'users', 'owner-1'), { verification_status: 'VERIFIED' }));
  await assertFails(updateDoc(doc(ownerDb, 'users', 'owner-1'), { role: 'ADMIN' }));
});

test('new citizen profiles do not accept registration selfie images', async () => {
  const userDb = testEnv.authenticatedContext('new-user-1').firestore();
  const profile = {
    user_id: 'new-user-1',
    first_name: 'Test',
    middle_name: '',
    last_name: 'Citizen',
    public_alias: 'Citizen #000001',
    date_of_birth: '2000-01-01',
    email: 'citizen@example.com',
    phone: '09123456789',
    username: 'test-citizen',
    barangay: 'Zone I',
    province: 'South Cotabato',
    city: 'Koronadal City',
    account_status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    points_balance: 50,
    role: 'USER',
    created_at: new Date().toISOString()
  };
  await assertSucceeds(setDoc(doc(userDb, 'users', 'new-user-1'), profile));
  const secondUserDb = testEnv.authenticatedContext('new-user-2').firestore();
  await assertFails(setDoc(doc(secondUserDb, 'users', 'new-user-2'), {
    ...profile,
    user_id: 'new-user-2',
    registration_selfie_image: image
  }));
});

test('admin claim can update verification status on a user profile', async () => {
  const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore();
  await assertSucceeds(updateDoc(doc(adminDb, 'users', 'owner-1'), { verification_status: 'VERIFIED' }));
});

test('meetup schedules are private to participants', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-1').firestore();
  const strangerDb = testEnv.authenticatedContext('stranger-2').firestore();
  await assertSucceeds(getDoc(doc(ownerDb, 'meetups', completedMeetupId)));
  await assertFails(getDoc(doc(strangerDb, 'meetups', completedMeetupId)));
});

test('a return is completed only after each meetup participant confirms their own side', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-1').firestore();
  const finderDb = testEnv.authenticatedContext('finder-2').firestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'meetups', 'MT-active-1'), {
      meetup_id: 'MT-active-1',
      owner_id: 'owner-1',
      finder_id: 'finder-2',
      status: 'CONFIRMED',
      owner_confirmed_return: false,
      finder_confirmed_return: false
    });
  });
  const meetupRef = doc(ownerDb, 'meetups', 'MT-active-1');
  await assertSucceeds(updateDoc(meetupRef, { owner_confirmed_return: true }));
  await assertFails(updateDoc(meetupRef, { status: 'COMPLETED' }));
  await assertFails(updateDoc(meetupRef, { finder_confirmed_return: true }));
  await assertSucceeds(updateDoc(doc(finderDb, 'meetups', 'MT-active-1'), {
    finder_confirmed_return: true,
    status: 'COMPLETED',
    completed_at: new Date().toISOString()
  }));
});

test('public history exposes only a sanitized completed-return summary', async () => {
  const ownerDb = testEnv.authenticatedContext('owner-1').firestore();
  const strangerDb = testEnv.authenticatedContext('stranger-2').firestore();
  const publicRecord = {
    public_transaction_id: completedMeetupId,
    kind: 'ITEM_RETURN',
    category: 'Electronics',
    city: 'Koronadal City',
    completed_month: '2026-10',
    completed_at: new Date().toISOString(),
    confirmation: 'Confirmed by both participants'
  };
  await assertSucceeds(setDoc(doc(ownerDb, 'public_transactions', completedMeetupId), publicRecord));
  await assertSucceeds(getDoc(doc(strangerDb, 'public_transactions', completedMeetupId)));
  await assertFails(setDoc(doc(strangerDb, 'public_transactions', 'forged-return'), {
    ...publicRecord, public_transaction_id: 'forged-return'
  }));
  await assertFails(setDoc(doc(ownerDb, 'public_transactions', 'leaky-return'), {
    ...publicRecord,
    public_transaction_id: 'leaky-return',
    owner_id: 'owner-1'
  }));
});
