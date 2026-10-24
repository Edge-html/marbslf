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
