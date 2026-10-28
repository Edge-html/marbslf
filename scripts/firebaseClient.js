/**
 * MARBSLF - Firebase Client & Real Authentication / Firestore Controller
 * Project: marbslf
 */

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBC02ErfNs_YdQdg5ok6YegjSSmrwVR6M4",
  authDomain: "marbslf.firebaseapp.com",
  projectId: "marbslf",
  storageBucket: "marbslf.firebasestorage.app",
  messagingSenderId: "804925427828",
  appId: "1:804925427828:web:89d1c3ab7c71c6a4c08121",
  measurementId: "G-JXG1M26K4N"
};

let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let googleAuthProvider = null;
window.firebaseAdminClaim = false;

try {
  if (typeof firebase !== 'undefined') {
    firebaseApp = firebase.initializeApp(firebaseConfig);
    firebaseAuth = firebase.auth();
    firestoreDb = firebase.firestore();
    googleAuthProvider = new firebase.auth.GoogleAuthProvider();
    googleAuthProvider.setCustomParameters({ prompt: 'select_account' });
    console.log('✓ Successfully connected to Firebase (Project: marbslf)');
  }
} catch (err) {
  console.warn('Could not initialize Firebase client:', err);
}

// 1. Google OAuth Sign-in (Uses Firebase Popup - No redirect code exchange failure!)
async function signInWithGoogle() {
  if (!firebaseAuth || !googleAuthProvider) {
    alert('Firebase Auth is not initialized yet.');
    return;
  }

  try {
    const result = await firebaseAuth.signInWithPopup(googleAuthProvider);
    const user = result.user;
    console.log('✓ Firebase Google Sign-in successful:', user.email);

    // Sync profile
    await syncFirebaseUserProfile(user);

    if (typeof window.showToast === 'function') {
      window.showToast(`Signed in with Google as ${user.displayName || user.email}`);
    }

    // Close any open auth modals
    const loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.classList.remove('active');
    const registerModal = document.getElementById('registerModal');
    if (registerModal) registerModal.classList.remove('active');

    return user;
  } catch (error) {
    console.error('Google Sign-in failed:', error);
    // If popup was blocked or closed, show friendly notice
    if (error.code === 'auth/popup-closed-by-user') {
      console.log('Popup closed by user.');
      return;
    }
    if (error.code === 'auth/unauthorized-domain') {
      alert('Authentication Domain Error: Please ensure localhost is authorized in Firebase Authentication -> Settings -> Authorized domains.');
      return;
    }
    alert('Google Sign-in failed: ' + error.message);
  }
}

// 2. Real Email & Password Registration
async function signUpWithEmailPassword({ email, password, firstName, middleName, lastName, dob, phone, username, barangay }) {
  if (!firebaseAuth) return null;

  try {
    const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Update display name
    const fullName = `${firstName} ${lastName}`.trim();
    await user.updateProfile({ displayName: fullName });

    const alias = 'Citizen #' + String(user.uid).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).padEnd(6, '0');

    const profile = {
      user_id: user.uid,
      first_name: firstName,
      middle_name: middleName || '',
      last_name: lastName,
      public_alias: alias,
      date_of_birth: dob || null,
      email: email,
      phone: phone || '',
      username: username || email.split('@')[0],
      barangay: barangay || 'Zone II',
      province: 'South Cotabato',
      city: 'Koronadal City',
      account_status: 'ACTIVE',
      verification_status: 'UNVERIFIED',
      points_balance: 50,
      role: 'USER',
      created_at: new Date().toISOString()
    };

    // Save profile before sending verification so a failed email delivery can
    // be retried later without leaving an orphaned auth account.
    if (firestoreDb) {
      try {
        await firestoreDb.collection('users').doc(user.uid).set(profile);
      } catch (fErr) {
        console.warn('Firestore profile write note:', fErr);
      }
    }

    // Cache the account's own profile locally so username sign-in works on
    // this device without publishing a username-to-email directory.
    if (window.marbsDB?.data?.users) {
      const cachedIndex = window.marbsDB.data.users.findIndex(existing =>
        existing.user_id === user.uid || String(existing.email || '').toLowerCase() === String(user.email || '').toLowerCase()
      );
      if (cachedIndex >= 0) {
        window.marbsDB.data.users[cachedIndex] = { ...window.marbsDB.data.users[cachedIndex], ...profile };
      } else {
        window.marbsDB.data.users.push(profile);
      }
      window.marbsDB.save();
    }

    let verificationEmailSent = true;
    try {
      await user.sendEmailVerification();
    } catch (verificationError) {
      verificationEmailSent = false;
      console.warn('Verification email could not be sent:', verificationError.message);
    }
    await firebaseAuth.signOut();
    return { user: { id: user.uid, email: user.email }, profile, verificationRequired: true, verificationEmailSent };
  } catch (err) {
    console.error('Firebase Registration Error:', err);
    throw err;
  }
}

// 3. Real Email or Username Login
async function signInWithEmailOrUsername(identifier, password) {
  const cleanIdentifier = String(identifier || '').trim();
  const trimmed = cleanIdentifier.toLowerCase();
  const isDemoAdminLogin = (trimmed === 'admin' || trimmed === 'admin@marbslf.gov.ph') && password === 'admin123';
  // The demo profile is only for an offline build. When Firebase is configured,
  // always authenticate against Firebase so a local ADMIN profile cannot be
  // mistaken for a real Firebase administrator with an admin custom claim.
  if (!firebaseAuth) {
    if (isDemoAdminLogin) {
      const adminUser = window.marbsDB?.data.users.find(u => u.user_id === 'USR-ADMIN');
      return { user: { id: 'USR-ADMIN', email: 'admin@marbslf.gov.ph' }, profile: adminUser };
    }
    throw new Error('Firebase Authentication is unavailable. Refresh the page and try again.');
  }

  try {
    let emailToUse = cleanIdentifier.includes('@')
      ? cleanIdentifier
      : trimmed === 'admin' ? 'admin@marbslf.gov.ph' : '';

    // Firebase password authentication requires an email. Resolve usernames
    // only from profiles this device already knows; never expose all users'
    // private email addresses through a public Firestore lookup.
    if (!emailToUse.includes('@')) {
      const foundLocal = (window.marbsDB?.data?.users || []).find(user =>
        String(user.username || '').trim().toLowerCase() === trimmed && user.email
      );
      if (foundLocal) {
        emailToUse = String(foundLocal.email).trim();
      }

      if (!emailToUse.includes('@')) {
        throw new Error('This device does not have that username saved yet. Sign in with your email once on this device, then you can use either email or username here.');
      }
    }

    const userCredential = await firebaseAuth.signInWithEmailAndPassword(emailToUse, password);
    const user = userCredential.user;
    const tokenResult = await user.getIdTokenResult();
    window.firebaseAdminClaim = tokenResult.claims.admin === true;

    // Trusted Firebase admins must be able to access the moderation portal even
    // when their legacy/admin mailbox cannot receive email. This exception is
    // based only on the server-issued custom claim, never a local profile role.
    if (!window.firebaseAdminClaim && user.providerData.some(provider => provider.providerId === 'password') && !user.emailVerified) {
      try { await user.sendEmailVerification(); } catch (verificationError) {
        console.warn('Could not resend email verification:', verificationError.message);
      }
      await firebaseAuth.signOut();
      throw new Error('This email is not verified yet. We sent a fresh confirmation link; open it before signing in.');
    }

    // Fetch user profile from Firestore or local marbsDB
    let profile = null;
    if (window.marbsDB) {
      profile = window.marbsDB.data.users.find(u => u.user_id === user.uid || u.email === user.email) || null;
    }

    if (!profile && firestoreDb) {
      try {
        const doc = await firestoreDb.collection('users').doc(user.uid).get();
        if (doc.exists) {
          profile = doc.data();
        }
      } catch (e) {
        console.warn('Firestore profile read skipped (permissions/rules):', e.message);
      }
    }

    // Default profile if not yet created in Firestore
    if (!profile) {
      const nameParts = (user.displayName || '').split(' ');
      profile = {
        user_id: user.uid,
        first_name: nameParts[0] || user.email.split('@')[0],
        middle_name: '',
        last_name: nameParts.slice(1).join(' ') || '',
        public_alias: 'Citizen #' + String(user.uid).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).padEnd(6, '0'),
        email: user.email,
        username: user.email.split('@')[0],
        role: 'USER',
        account_status: 'ACTIVE',
        verification_status: 'VERIFIED',
        points_balance: 50
      };
    }

    return { user: { id: user.uid, email: user.email }, profile: { ...profile, user_id: user.uid, role: window.firebaseAdminClaim ? 'ADMIN' : (profile.role || 'USER') } };
  } catch (err) {
    console.error('Firebase Login Error:', err);
    throw err;
  }
}

async function sendPasswordReset(email) {
  if (!firebaseAuth) throw new Error('Firebase Authentication is unavailable.');
  const normalizedEmail = String(email || '').trim();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Enter the email address on your account first.');
  }
  await firebaseAuth.sendPasswordResetEmail(normalizedEmail);
}

window.sendPasswordReset = sendPasswordReset;

// 4. Sign Out
async function signOutUser() {
  // Fade the current surface out before the hard reload so the handoff to the
  // landing page feels deliberate. Falls back to an instant sign-out when the
  // user prefers reduced motion.
  const motion = window.marbsMotion;
  const reduced = motion && motion.prefersReducedMotion && motion.prefersReducedMotion.matches;
  const wait = reduced ? 0 : 240;

  if (motion && !reduced) {
    motion.beginTransition(240);
    document.body.classList.add('is-route-complete');
  }

  await new Promise(r => setTimeout(r, wait));

  if (firebaseAuth) {
    try {
      await firebaseAuth.signOut();
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
  }

  if (window.marbsDB) {
    window.marbsDB.setCurrentUser(null);
  }

  if (window.renderUserPill) {
    window.renderUserPill();
  } else if (window.updateAuthUI) {
    window.updateAuthUI();
  }
  location.reload();
}

// Helper: sync Firebase user to marbsDB and Firestore
async function syncFirebaseUserProfile(user) {
  if (!user) return null;

  try {
    const tokenResult = await user.getIdTokenResult();
    window.firebaseAdminClaim = tokenResult.claims.admin === true;
  } catch (error) {
    window.firebaseAdminClaim = false;
  }

  let profile = null;
  if (firestoreDb) {
    try {
      const doc = await firestoreDb.collection('users').doc(user.uid).get();
      if (doc.exists) {
        profile = doc.data();
      }
    } catch (e) {
      console.warn('Could not read user profile from Firestore:', e);
    }
  }

  const displayName = user.displayName || '';
  const nameParts = displayName.trim().split(' ');
  const firstName = nameParts[0] || user.email.split('@')[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  const avatarUrl = user.photoURL || '';

  // Check if existing profile in local marbsDB is already VERIFIED
  let existingLocalUser = null;
  if (window.marbsDB && Array.isArray(window.marbsDB.data.users)) {
    existingLocalUser = window.marbsDB.data.users.find(u => u.user_id === user.uid || u.email === user.email);
  }

  // Preserve VERIFIED status if local user or local id_verifications says VERIFIED
  let finalVerStatus = (profile && profile.verification_status) || 'UNVERIFIED';
  if (existingLocalUser && existingLocalUser.verification_status === 'VERIFIED') {
    finalVerStatus = 'VERIFIED';
  } else if (window.marbsDB && Array.isArray(window.marbsDB.data.id_verifications)) {
    const hasApproved = window.marbsDB.data.id_verifications.some(v => 
      (v.user_id === user.uid || v.user_id === user.email) && v.status === 'VERIFIED'
    );
    if (hasApproved) finalVerStatus = 'VERIFIED';
  }

  // The alias is always derived from the resolved verification status so the
  // public label can never contradict the badge shown next to it.
  const aliasSource = {
    user_id: user.uid,
    verification_status: finalVerStatus
  };
  const correctAlias = (typeof window.buildPublicAlias === 'function')
    ? window.buildPublicAlias(aliasSource, finalVerStatus)
    : (finalVerStatus === 'VERIFIED' ? 'Verified Citizen #' : 'Citizen #') +
      String(user.uid).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).padEnd(6, '0');

  const userObj = {
    ...(existingLocalUser || {}),
    ...(profile || {}),
    user_id: user.uid,
    first_name: (profile && profile.first_name) || (existingLocalUser && existingLocalUser.first_name) || firstName,
    middle_name: (profile && profile.middle_name) || (existingLocalUser && existingLocalUser.middle_name) || '',
    last_name: (profile && profile.last_name) || (existingLocalUser && existingLocalUser.last_name) || lastName,
    public_alias: correctAlias,
    email: user.email,
    phone: (profile && profile.phone) || (existingLocalUser && existingLocalUser.phone) || user.phoneNumber || '',
    username: (profile && profile.username) || (existingLocalUser && existingLocalUser.username) || user.email.split('@')[0],
    avatar_url: avatarUrl || (existingLocalUser && existingLocalUser.avatar_url) || '',
    barangay: (profile && profile.barangay) || (existingLocalUser && existingLocalUser.barangay) || 'Zone II',
    province: 'South Cotabato',
    city: 'Koronadal City',
    account_status: 'ACTIVE',
    verification_status: finalVerStatus,
    points_balance: (profile && profile.points_balance !== undefined) ? profile.points_balance : (existingLocalUser ? existingLocalUser.points_balance : 50),
    role: window.firebaseAdminClaim ? 'ADMIN' : ((profile && profile.role) || (existingLocalUser && existingLocalUser.role) || 'USER')
  };

  if (firestoreDb) {
    try {
      await firestoreDb.collection('users').doc(user.uid).set(userObj, { merge: true });
    } catch (err) {
      // Ignored if blocked by client (adblocker/shield)
      console.warn('Firestore auto-save note (offline or blocked by client):', err.message);
    }
  }

  // Update marbsDB in-memory & localStorage
  if (window.marbsDB) {
    const idx = window.marbsDB.data.users.findIndex(x => x.user_id === userObj.user_id || x.email === userObj.email);
    if (idx >= 0) {
      window.marbsDB.data.users[idx] = { ...window.marbsDB.data.users[idx], ...userObj };
    } else {
      window.marbsDB.data.users.push(userObj);
    }
    window.marbsDB.setCurrentUser(userObj.user_id);
    window.marbsDB.save();
  }

  // Refresh UI. renderUserPill() will also route a signed-in citizen off the
  // public landing page into the main application (see isRouterReady guard).
  if (typeof window.renderUserPill === 'function') {
    window.renderUserPill();
  }
  if (userObj.role === 'ADMIN' && typeof window.navigateToView === 'function') {
    const savedView = localStorage.getItem('marbslf_active_view');
    if (!savedView || savedView === 'home' || savedView === 'admin' || savedView === 'landing') {
      window.navigateToView('admin');
    }
  } else if (typeof window.renderFeed === 'function') {
    window.renderFeed();
  }

  return userObj;
}

// 5. Initialize & Check Active Session
async function checkCurrentSession() {
  if (!firebaseAuth) return null;
  const user = firebaseAuth.currentUser;
  if (user) {
    return await syncFirebaseUserProfile(user);
  }
  return null;
}

// Listen to Firebase Auth state change in real-time
if (firebaseAuth) {
  firebaseAuth.onAuthStateChanged(async (user) => {
    if (user) {
      console.log('✓ Firebase Auth State: Logged In as', user.email);
      try {
        const tokenResult = await user.getIdTokenResult();
        window.firebaseAdminClaim = tokenResult.claims.admin === true;
      } catch (error) {
        window.firebaseAdminClaim = false;
        console.warn('Could not verify Firebase admin claim:', error.message);
      }
      await syncFirebaseUserProfile(user);
      if (window.marbsDB && typeof window.marbsDB.startPrivateWorkflowListeners === 'function') {
        window.marbsDB.startPrivateWorkflowListeners();
      }
      try {
        if (window.marbsDB && typeof window.marbsDB.syncWithFirestore === 'function') {
          await window.marbsDB.syncWithFirestore();
        }
      } catch (err) {
        console.warn('Firestore sync skipped or blocked by client:', err.message);
      }
    } else {
      console.log('Firebase Auth State: Logged Out');
      window.firebaseAdminClaim = false;
      if (window.marbsDB) {
        window.marbsDB.setCurrentUser(null);
      }
      if (typeof window.renderUserPill === 'function') {
        window.renderUserPill();
      }
    }
  });
}

// Global Exports
window.firebaseAuth = firebaseAuth;
window.firestoreDb = firestoreDb;
window.signInWithGoogle = signInWithGoogle;
window.signUpWithEmailPassword = signUpWithEmailPassword;
window.signInWithEmailOrUsername = signInWithEmailOrUsername;
window.signOutUser = signOutUser;
window.checkCurrentSession = checkCurrentSession;
