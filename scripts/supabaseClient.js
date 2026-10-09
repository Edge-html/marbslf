/**
 * MARBSLF - Supabase Client & Real Authentication Controller
 * Connected to project: https://pikjzvukpgdtgskoctre.supabase.co
 */

const SUPABASE_URL = 'https://pikjzvukpgdtgskoctre.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UUesi6mVCqPbgplD6fe50w_biVUJv-I';

let supabaseClient = null;

try {
  if (typeof supabase !== 'undefined' && SUPABASE_ANON_KEY) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✓ Successfully connected to Supabase Database (Project: MARBSLF)');
  }
} catch (err) {
  console.warn('Could not initialize Supabase client:', err);
}

// 0. Check and display OAuth Errors from Callback URL
function handleAuthUrlErrors() {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash);

  const errorDesc = urlParams.get('error_description') || hashParams.get('error_description');
  const error = urlParams.get('error') || hashParams.get('error');

  if (error || errorDesc) {
    const decodedError = decodeURIComponent(errorDesc || error);
    console.error('Supabase OAuth Error received:', decodedError);

    let friendlyMsg = decodedError;
    if (decodedError.includes('Unable to exchange external code')) {
      friendlyMsg = 'Google Sign-In configuration error: Unable to exchange external code. Please ensure the Google Client ID & Secret in Supabase match Google Cloud Console and the Authorized Redirect URI is set to: ' + SUPABASE_URL + '/auth/v1/callback';
    }

    if (typeof window.showToast === 'function') {
      window.showToast('⚠️ ' + friendlyMsg, 8000);
    } else {
      setTimeout(() => alert('⚠️ Authentication Error:\n\n' + friendlyMsg), 400);
    }

    // Clean up error params from browser address bar
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState(null, document.title, cleanUrl);
  }
}
handleAuthUrlErrors();

// 1. Google OAuth Sign-in
async function signInWithGoogle() {
  if (!supabaseClient) {
    alert('Supabase client is not initialized.');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) {
      alert('Google Auth Error: ' + error.message);
    }
  } catch (e) {
    console.error('Google Sign-in failed:', e);
    alert('Google Sign-in failed: ' + e.message);
  }
}

// 2. Real Email & Password Registration (Section 3: Real Legal Name)
async function signUpWithEmailPassword({ email, password, firstName, middleName, lastName, dob, phone, username, barangay }) {
  if (!supabaseClient) return null;

  try {
    // Register user in Supabase Auth
    const { data: authData, error: authErr } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`.trim(),
          username: username,
          phone: phone,
          barangay: barangay,
          date_of_birth: dob
        }
      }
    });

    if (authErr) throw authErr;

    const user = authData.user;
    if (!user) throw new Error('Registration failed, please check your information.');

    const alias = 'Verified Citizen #' + user.id.slice(0, 6);

    // Save profile into public.users table
    const profile = {
      user_id: user.id,
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
      role: 'USER'
    };

    const { error: profileErr } = await supabaseClient
      .from('users')
      .upsert(profile, { onConflict: 'user_id' });

    if (profileErr) {
      console.warn('Could not insert profile into public.users (will rely on trigger):', profileErr.message);
    }

    return { user, profile };
  } catch (err) {
    console.error('Supabase Registration Error:', err);
    throw err;
  }
}

// 3. Real Email or Username Login
async function signInWithEmailOrUsername(identifier, password) {
  if (!supabaseClient) return null;

  try {
    let emailToUse = identifier.trim();

    // If identifier is not an email, lookup email by username from public.users table
    if (!emailToUse.includes('@')) {
      const { data: userRecord, error: userErr } = await supabaseClient
        .from('users')
        .select('email')
        .eq('username', identifier)
        .maybeSingle();

      if (userRecord && userRecord.email) {
        emailToUse = userRecord.email;
      } else {
        throw new Error('Username not found. Please log in with your email or register.');
      }
    }

    // Authenticate with Supabase Auth
    const { data: authData, error: authErr } = await supabaseClient.auth.signInWithPassword({
      email: emailToUse,
      password: password
    });

    if (authErr) throw authErr;

    // Fetch user's profile
    const { data: profile } = await supabaseClient
      .from('users')
      .select('*')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    return { user: authData.user, profile };
  } catch (err) {
    console.error('Supabase Login Error:', err);
    throw err;
  }
}

// 4. Sign Out
async function signOutUser() {
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.warn('Sign out warning:', e);
    }
  }

  if (window.marbsDB) {
    window.marbsDB.setCurrentUser(null); // Real logout: user is now a guest
  }
  
  if (window.updateAuthUI) {
    window.updateAuthUI();
  }
  location.reload();
}

// 5. Initialize & Check Active Session on Page Load
async function checkCurrentSession() {
  if (!supabaseClient) return null;

  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      const u = session.user;
      console.log('✓ Active Supabase Session Found:', u.email);

      // Fetch or sync profile from public.users
      let profile = null;
      try {
        const { data: prof, error: profErr } = await supabaseClient
          .from('users')
          .select('*')
          .eq('user_id', u.id)
          .maybeSingle();
        if (!profErr && prof) {
          profile = prof;
        }
      } catch (pe) {
        console.warn('Could not query public.users:', pe);
      }

      // Extract details from OAuth metadata or user info
      const meta = u.user_metadata || {};
      const fullName = meta.full_name || meta.name || '';
      const nameParts = fullName.trim().split(' ');
      const firstName = meta.first_name || nameParts[0] || u.email.split('@')[0];
      const lastName = meta.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
      const avatarUrl = meta.avatar_url || meta.picture || '';

      const userObj = profile || {
        user_id: u.id,
        first_name: firstName,
        middle_name: '',
        last_name: lastName,
        public_alias: 'Verified Citizen #' + u.id.slice(0, 6),
        email: u.email,
        phone: u.phone || '',
        username: meta.username || meta.user_name || u.email.split('@')[0],
        avatar_url: avatarUrl,
        barangay: 'Zone II',
        province: 'South Cotabato',
        city: 'Koronadal City',
        account_status: 'ACTIVE',
        verification_status: 'VERIFIED',
        points_balance: 100,
        role: 'USER'
      };

      // Try inserting into public.users if not present yet
      if (!profile) {
        try {
          await supabaseClient.from('users').upsert(userObj, { onConflict: 'user_id' });
        } catch (upErr) {
          console.warn('Supabase profile auto-upsert note:', upErr);
        }
      }

      // Update marbsDB state
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

      // Clean OAuth hash from URL for cleaner UX without refreshing
      if (window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('error'))) {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      }

      // Update UI components
      if (typeof window.renderUserPill === 'function') {
        window.renderUserPill();
      } else if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }

      if (typeof window.renderFeed === 'function') {
        window.renderFeed();
      }

      return userObj;
    }
  } catch (err) {
    console.warn('Could not retrieve Supabase session:', err);
  }
  return null;
}

// Listen to Auth State Changes in real time
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    console.log('Supabase Auth Change Event:', event);
    if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
      const user = await checkCurrentSession();
      if (user && typeof window.showToast === 'function') {
        window.showToast(`✓ Signed in as ${user.first_name || user.email}`);
      }
      if (window.marbsDB) {
        window.marbsDB.syncWithSupabase();
      }
    } else if (event === 'SIGNED_OUT') {
      if (window.marbsDB) {
        window.marbsDB.setCurrentUser(null);
      }
      if (typeof window.renderUserPill === 'function') {
        window.renderUserPill();
      }
    }
  });

  // Check session after DOM is loaded or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      checkCurrentSession();
    });
  } else {
    checkCurrentSession();
  }
}

// Global Exports
window.supabaseClient = supabaseClient;
window.signInWithGoogle = signInWithGoogle;
window.signUpWithEmailPassword = signUpWithEmailPassword;
window.signInWithEmailOrUsername = signInWithEmailOrUsername;
window.signOutUser = signOutUser;
window.checkCurrentSession = checkCurrentSession;
