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
      window.showToast(`✓ Signed in with Google as ${user.displayName || user.email}`);
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

    const alias = 'Verified Citizen #' + user.uid.slice(0, 6);

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

    // Save profile to Firestore
    if (firestoreDb) {
      try {
        await firestoreDb.collection('users').doc(user.uid).set(profile);
      } catch (fErr) {
        console.warn('Firestore profile write note:', fErr);
      }
    }

    return { user: { id: user.uid, email: user.email }, profile };
  } catch (err) {
    console.error('Firebase Registration Error:', err);
    throw err;
  }
}

// 3. Real Email or Username Login
async function signInWithEmailOrUsername(identifier, password) {
  // Built-in Admin bypass & local admin support
  const trimmed = identifier.trim().toLowerCase();
  if ((trimmed === 'admin' || trimmed === 'admin@marbslf.gov.ph') && password === 'admin123') {
    const adminUser = window.marbsDB ? window.marbsDB.data.users.find(u => u.role === 'ADMIN') : null;
    const profile = adminUser || {
      user_id: 'USR-ADMIN',
      first_name: 'MarbsLF',
      last_name: 'Administrator',
      public_alias: 'System Admin #01',
      email: 'admin@marbslf.gov.ph',
      username: 'admin',
      role: 'ADMIN',
      points_balance: 9999,
      verification_status: 'VERIFIED',
      account_status: 'ACTIVE'
    };
    return { user: { id: profile.user_id, email: profile.email }, profile };
  }

  if (!firebaseAuth) return null;

  try {
    let emailToUse = identifier.trim();

    // If identifier is not an email, lookup email by username:
    // First try local registered users
    if (!emailToUse.includes('@')) {
      if (window.marbsDB) {
        const foundLocal = window.marbsDB.data.users.find(u => u.username && u.username.toLowerCase() === identifier.toLowerCase());
        if (foundLocal && foundLocal.email) {
          emailToUse = foundLocal.email;
        }
      }

      // If still not resolved and firestoreDb is present, try Firestore (wrapped so permission errors don't crash)
      if (!emailToUse.includes('@') && firestoreDb) {
        try {
          const snap = await firestoreDb.collection('users').where('username', '==', identifier).limit(1).get();
          if (!snap.empty) {
            emailToUse = snap.docs[0].data().email;
          }
        } catch (queryErr) {
          console.warn('Firestore username query skipped (permissions/rules):', queryErr.message);
        }
      }
    }

    const userCredential = await firebaseAuth.signInWithEmailAndPassword(emailToUse, password);
    const user = userCredential.user;

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
        public_alias: 'Verified Citizen #' + user.uid.slice(0, 6),
        email: user.email,
        username: user.email.split('@')[0],
        role: 'USER',
        account_status: 'ACTIVE',
        verification_status: 'VERIFIED',
        points_balance: 50
      };
    }

    return { user: { id: user.uid, email: user.email }, profile };
  } catch (err) {
    console.error('Firebase Login Error:', err);
    throw err;
  }
}

// 4. Sign Out
async function signOutUser() {
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

  const userObj = profile || {
    user_id: user.uid,
    first_name: firstName,
    middle_name: '',
    last_name: lastName,
    public_alias: 'Verified Citizen #' + user.uid.slice(0, 6),
    email: user.email,
    phone: user.phoneNumber || '',
    username: user.email.split('@')[0],
    avatar_url: avatarUrl,
    barangay: 'Zone II',
    province: 'South Cotabato',
    city: 'Koronadal City',
    account_status: 'ACTIVE',
    verification_status: 'VERIFIED',
    points_balance: 100,
    role: 'USER'
  };

  if (!profile && firestoreDb) {
    try {
      await firestoreDb.collection('users').doc(user.uid).set(userObj, { merge: true });
    } catch (err) {
      console.warn('Firestore auto-save warning:', err);
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

  // Refresh UI
  if (typeof window.renderUserPill === 'function') {
    window.renderUserPill();
  }
  if (typeof window.renderFeed === 'function') {
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
      await syncFirebaseUserProfile(user);
      if (window.marbsDB && typeof window.marbsDB.syncWithFirestore === 'function') {
        window.marbsDB.syncWithFirestore();
      }
    } else {
      console.log('Firebase Auth State: Logged Out');
      if (window.marbsDB && window.marbsDB.data.current_user_id !== 'USR-ADMIN') {
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
